# SPDX-License-Identifier: MIT
# Copyright (c) 2026 qiapicoco
# MD Image Cleaner - https://github.com/qiapicoco/md-image-cleaner

"""浏览器自动化驱动器：封装 bsk CLI 的 context / observation 约束。

bsk 0.4.2 的规则：
  - 每个写动作（navigate/click/fill/evaluate）前必须 cooperate sync 拿 context
  - evaluate 这类"脚本动作"还要额外带 sync 顶层返回的 observation_id，且一次一用
  - 动作完成后状态变了，下一次动作前要重新 sync

用法：
  python tools/web.py <command> [args...]

这是开发期辅助脚本（发布 Release 时自动填表用），不是程序运行必需。
bsk 本体路径可用环境变量 BSK 指定。
"""

import json
import os
import re
import subprocess
import sys
import time

BSK = os.environ.get("BSK") or r"C:\temp\bsk\bin\bsk.exe"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

os.environ["NO_PROXY"] = "127.0.0.1,localhost,::1"
os.environ["no_proxy"] = os.environ["NO_PROXY"]
os.environ["BSK_AUTO_START"] = "0"


def _run(*args, timeout=120):
    p = subprocess.run(
        [BSK, *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )
    return p.returncode, (p.stdout or "") + (p.stderr or "")


class Bsk:
    def __init__(self):
        self.sid = None
        self.ctx = None
        self.obs = None

    # ---------------------------------------------------------------- 生命周期
    def start_daemon(self, wait=6):
        subprocess.run(
            ["taskkill", "/F", "/IM", "bsk.exe"],
            capture_output=True,
        )
        time.sleep(1)
        cfg = os.path.join(os.path.expanduser("~"), ".bsk", "daemon.json")
        if os.path.exists(cfg):
            try:
                os.remove(cfg)
            except OSError:
                pass
        subprocess.Popen(
            [BSK, "daemon", "start", "--foreground"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=0x00000008 | 0x00000200,  # DETACHED_PROCESS | NEW_PROCESS_GROUP
        )
        time.sleep(wait)
        for _ in range(15):
            rc, out = _run("status", "--json", timeout=20)
            if "instance_id" in out:
                return True
            time.sleep(2)
        print("[warn] 守护进程未连上浏览器")
        return False

    def start_session(self):
        rc, out = _run("session", "start", "--json", timeout=60)
        m = re.search(r'"session_id"\s*:\s*"([^"]+)"', out)
        if not m:
            print("[error] session start 失败:", out[:400])
            return False
        self.sid = m.group(1)
        print("[session]", self.sid)
        return True

    def nav(self, url, wait=4):
        # navigate 也会校验 context：文档换页后旧 context 立刻失效。
        # 实测换页后整条 session 的 control state 都会作废，只能另起 session。
        args = ["navigate", url, "--session", self.sid]
        if self.sync():
            args += ["--context", self.ctx]
        rc, out = _run(*args, timeout=120)
        if rc != 0:
            self.ctx = None
            self.obs = None
            self.start_session()
            rc, out = _run("navigate", url, "--session", self.sid, timeout=120)
        self.ctx = None
        self.obs = None
        print(f"[nav] {url} -> rc={rc} {out.strip().splitlines()[0] if out.strip() else ''}")
        time.sleep(wait)
        return rc == 0

    def sync(self):
        rc, out = _run("cooperate", "sync", "--session", self.sid, "--json", timeout=90)
        try:
            d = json.loads(out[out.index("{"):out.rindex("}") + 1])
        except Exception:
            print("[error] sync 解析失败:", out[:400])
            return False
        self.ctx = d.get("context_id")
        self.obs = d.get("observation_id")
        return bool(self.ctx)

    def eval(self, expr, fresh=True, timeout=90):
        if fresh:
            if not self.sync():
                return None
        if not self.ctx:
            return None
        args = ["evaluate", "--session", self.sid, "--context", self.ctx]
        if self.obs:
            args += ["--observation", self.obs]
            self.obs = None  # 一次性
        rc, out = _run(*args, expr, timeout=timeout)
        return out.strip()

    def click(self, sel, fresh=True):
        if fresh and not self.sync():
            return None
        args = ["click", "--session", self.sid, "--context", self.ctx, "--selector", sel]
        rc, out = _run(*args, timeout=90)
        print(f"[click] {sel} -> rc={rc} {out.strip()[:200]}")
        time.sleep(1.2)
        return rc == 0

    def fill(self, sel, val, fresh=True):
        if fresh and not self.sync():
            return None
        args = [
            "fill", "--session", self.sid,
            "--context", self.ctx,
            "--selector", sel,
            "--value", val,
        ]
        rc, out = _run(*args, timeout=90)
        print(f"[fill] {sel} -> rc={rc} {out.strip()[:160]}")
        time.sleep(0.8)
        return rc == 0

    def shot(self, name):
        path = os.path.join(ROOT, name)
        rc, out = _run("screenshot", "--session", self.sid, "--out", path, timeout=90)
        print(f"[shot] {path} rc={rc}")
        return path


# ---------------------------------------------------------------------- 命令
def cmd_check(b):
    """确认两站登录态"""
    b.nav("https://github.com")
    print("github:", b.eval(
        "JSON.stringify({url:location.href,"
        "user:(document.querySelector('meta[name=user-login]')||{}).content||null})"))
    b.nav("https://gitee.com")
    print("gitee :", b.eval(
        "JSON.stringify({url:location.href,"
        "signIn:[...document.querySelectorAll('a')].some(a=>/登录|Sign in/i.test(a.textContent))})"))


def cmd_gh_tokens(b):
    """打开 GitHub 新建 token 页面并截图"""
    b.nav("https://github.com/settings/tokens/new", wait=5)
    print("url:", b.eval("location.href"))
    print("form:", b.eval(
        "JSON.stringify({note:!!document.querySelector('#oauth_access_description'),"
        "repo:!!document.querySelector('input[value=repo]'),"
        "exp:!!document.querySelector('#oauth_access_expires_at'),"
        "buttons:[...document.querySelectorAll('button')].map(x=>x.textContent.trim()).slice(-6)})"))
    b.shot("_gh_token_new.png")


def cmd_gh_tokens_list(b):
    b.nav("https://github.com/settings/tokens", wait=5)
    print("url:", b.eval("location.href"))
    print("tokens:", b.eval(
        "JSON.stringify([...document.querySelectorAll('a[href*=\"/settings/tokens/\"]')].map(a=>a.textContent.trim()))"))
    b.shot("_gh_token_list.png")


def cmd_gitee_tokens(b):
    b.nav("https://gitee.com/personal_access_tokens", wait=5)
    print("url:", b.eval("location.href"))
    b.shot("_gitee_token_new.png")


def cmd_eval(b):
    expr = sys.argv[2] if len(sys.argv) > 2 else "location.href"
    print(b.eval(expr))


def cmd_shot(b):
    url = sys.argv[2] if len(sys.argv) > 2 else ""
    name = sys.argv[3] if len(sys.argv) > 3 else "_shot_page.png"
    if url:
        b.nav(url, wait=4)
    b.shot(name)


def main():
    if len(sys.argv) < 2:
        print("usage: web.py <check|gh-tokens|gh-tokens-list|gitee-tokens|eval|shot>")
        return 1
    cmd = sys.argv[1]
    if cmd == "check":
        pass
    b = Bsk()
    if not b.start_daemon():
        return 1
    if not b.start_session():
        return 1
    fn = {
        "check": cmd_check,
        "gh-tokens": cmd_gh_tokens,
        "gh-tokens-list": cmd_gh_tokens_list,
        "gitee-tokens": cmd_gitee_tokens,
        "eval": cmd_eval,
        "shot": cmd_shot,
    }.get(cmd)
    if not fn:
        print("未知命令:", cmd)
        return 1
    fn(b)
    return 0


if __name__ == "__main__":
    sys.exit(main())
