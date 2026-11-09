# -*- coding: utf-8 -*-

# SPDX-License-Identifier: MIT
# Copyright (c) 2026 qiapicoco
# MD Image Cleaner - https://github.com/qiapicoco/md-image-cleaner

"""
黄金用例校验：把 desktop/dist/core_test.exe 跑在上述 fixture 副本上，
与 core/cases/*.json（原版 Python 产出的基准）逐字段比对。

用法：
    python core/check.py            全量
    python core/check.py basic      单个
"""
import json
import os
import shutil
import subprocess
import sys

import fixtures_layout

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(ROOT)
FIXTURES = os.path.join(ROOT, "fixtures")
CASES = os.path.join(ROOT, "cases")
WORK = os.path.join(ROOT, "_check")
EXE = os.path.join(PROJ, "desktop", "dist", "core_test.exe")


def split_previews(lst):
    """前段是未引用(false)，后段是已引用(true)。已引用顺序原版不稳定，比较时排序。"""
    unused = [p[0] for p in lst if not p[1]]
    used = sorted(p[0] for p in lst if p[1])
    order_ok = all(not p[1] for p in lst[:len(unused)])
    return unused, used, order_ok


def diff_list(name, got, want):
    if got == want:
        return None
    only_got = [x for x in got if x not in want]
    only_want = [x for x in want if x not in got]
    return (f"  ✗ {name}\n"
            f"      实际({len(got)}): {got}\n"
            f"      期望({len(want)}): {want}\n"
            f"      多出: {only_got}\n"
            f"      缺少: {only_want}")


def compare(case):
    gold_path = os.path.join(CASES, case + ".json")
    if not os.path.isfile(gold_path):
        return f"  ✗ 缺少基准 {gold_path}"
    gold = json.load(open(gold_path, encoding="utf-8"))

    src = os.path.join(FIXTURES, case)
    work = os.path.join(WORK, case)
    if os.path.isdir(work):
        shutil.rmtree(work)
    os.makedirs(WORK, exist_ok=True)
    shutil.copytree(src, work)
    fixtures_layout.ensure(case, work)
    md = os.path.join(work, case + ".md")
    out = os.path.join(work, "_result.json")

    r = subprocess.run([EXE, "--apply", md, "--json", "--out", out],
                       capture_output=True)
    if r.returncode != 0 or not os.path.isfile(out):
        return (f"  ✗ 执行失败 rc={r.returncode}\n"
                f"      {r.stderr.decode('utf-8', 'replace')[:500]}")
    got = json.load(open(out, encoding="utf-8"))

    errs = []
    for field in ("stats", "finished", "finalAssets", "finalDeleted"):
        d = diff_list(field, got.get(field), gold.get(field))
        if d:
            errs.append(d)

    # 日志：逐条
    if got["logs"] != gold["logs"]:
        detail = []
        for i in range(max(len(got["logs"]), len(gold["logs"]))):
            g = got["logs"][i] if i < len(got["logs"]) else "<缺>"
            w = gold["logs"][i] if i < len(gold["logs"]) else "<多>"
            if g != w:
                detail.append(f"      第{i}条 实际={g!r}\n              期望={w!r}")
        errs.append("  ✗ logs\n" + "\n".join(detail))

    # 进度：逐条（原版含进度回跳，也照抄）
    if got["progress"] != gold["progress"]:
        detail = []
        for i in range(max(len(got["progress"]), len(gold["progress"]))):
            g = got["progress"][i] if i < len(got["progress"]) else "<缺>"
            w = gold["progress"][i] if i < len(gold["progress"]) else "<多>"
            if g != w:
                detail.append(f"      第{i}条 实际={g} 期望={w}")
        errs.append("  ✗ progress\n" + "\n".join(detail))

    gu, gs, gorder = split_previews(got["previews"])
    wu, ws, worder = split_previews(gold["previews"])
    d = diff_list("previews(unused)", gu, wu)
    if d:
        errs.append(d)
    d = diff_list("previews(used,排序后)", gs, ws)
    if d:
        errs.append(d)
    if not gorder:
        errs.append("  ✗ previews 顺序应为「未引用在前、已引用在后」")

    return "\n".join(errs) if errs else None


def main():
    if not os.path.isfile(EXE):
        sys.exit(f"[错误] 找不到 {EXE}，先执行 python build.py test")
    only = sys.argv[1:] or None
    names = sorted(f[:-5] for f in os.listdir(CASES) if f.endswith(".json"))
    if only:
        names = [n for n in names if n in only]
    bad = 0
    for n in names:
        e = compare(n)
        if e:
            bad += 1
            print(f"[FAIL] {n}\n{e}")
        else:
            print(f"[ ok ] {n}")
    print("-" * 46)
    print(f"{len(names) - bad}/{len(names)} 通过" + ("" if not bad else "  ← 有差异"))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
