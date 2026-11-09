# -*- coding: utf-8 -*-

# SPDX-License-Identifier: MIT
# Copyright (c) 2026 qiapicoco
# MD Image Cleaner - https://github.com/qiapicoco/md-image-cleaner

"""
打包安装程序（NSIS）

用法：python desktop/installer/build_installer.py
产物：desktop/dist/MDImageCleaner_v<版本>_安装版.exe

流程：生成界面图 → 补 BOM / 统一语言包字体 → makensis → 校验产物
版本号从 res/app.rc 的 FILEVERSION 里读，不用手改两处；
改了 exe 版本后，先 python desktop/build.py，再跑这个脚本即可。
"""
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DESKTOP = os.path.dirname(HERE)
ROOT = os.path.dirname(DESKTOP)
NSI = os.path.join(HERE, "installer.nsi")
RC = os.path.join(DESKTOP, "res", "app.rc")
ICON = os.path.join(DESKTOP, "res", "app.ico")
DIST = os.path.join(DESKTOP, "dist")
EXE = os.path.join(DIST, "MDImageCleaner.exe")

ART_SCRIPT = os.path.join(HERE, "make_setup_art.py")
ART_FILES = [os.path.join(HERE, "setup_side.bmp"),
             os.path.join(HERE, "setup_header.bmp"),
             os.path.join(HERE, "setup_wizard.bmp")]

# 安装包只用现成的 NSIS，不额外下载。按顺序找。
NSIS_CANDS = [
    os.environ.get("MAKENSIS"),
    os.path.join(ROOT, "_toolchain", "nsis", "Bin", "makensis.exe"),
    "C:/Program Files (x86)/NSIS/makensis.exe",
    "C:/Program Files/NSIS/makensis.exe",
    shutil.which("makensis"),
]


def find_makensis():
    for p in NSIS_CANDS:
        if os.path.isfile(p):
            return p
    return None


def find_nlf(nsis):
    base = os.path.dirname(os.path.dirname(nsis))
    p = os.path.join(base, "Contrib", "Language files", "SimpChinese.nlf")
    return p if os.path.isfile(p) else None


def read_version():
    if not os.path.isfile(RC):
        return None
    txt = open(RC, encoding="utf-8", errors="replace").read()
    m = re.search(r"FILEVERSION\s+(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)", txt)
    if not m:
        return None
    a, b, c, d = (int(x) for x in m.groups())
    return "%d.%d.%d" % (a, b, c), "%d.%d.%d.%d" % (a, b, c, d)


def ensure_art():
    need = not all(os.path.isfile(p) for p in ART_FILES)
    if not need and os.path.isfile(ART_SCRIPT):
        newest = max(os.path.getmtime(p) for p in (ICON, ART_SCRIPT))
        need = newest > min(os.path.getmtime(p) for p in ART_FILES)
    if not need:
        return True
    print("[1/4] 生成安装界面图 …")
    r = subprocess.run([sys.executable, ART_SCRIPT], cwd=HERE)
    if r.returncode != 0:
        print("[错误] 生成界面图失败")
        return False
    return True


def ensure_bom():
    """NSIS 只认带 BOM 的 UTF-8"""
    raw = open(NSI, "rb").read()
    if raw.startswith(b"\xef\xbb\xbf"):
        return
    open(NSI, "wb").write(b"\xef\xbb\xbf" + raw)


def ensure_font(nsis):
    """语言包默认宋体 9，小字号下中文会叠；换成微软雅黑 9"""
    nlf = find_nlf(nsis)
    if not nlf:
        return
    raw = open(nlf, "rb").read()
    bom = b"\xef\xbb\xbf" if raw.startswith(b"\xef\xbb\xbf") else b""
    txt = raw[len(bom):].decode("utf-8", "replace")
    new = re.sub(r"\n(?:宋体|微软雅黑|SimSun)\r?\n\d+\r?\n", "\n微软雅黑\r\n9\r\n", txt, count=1)
    if new != txt:
        open(nlf, "wb").write(bom + new.encode("utf-8"))
        print("      语言包字体：统一为微软雅黑 9")


def patch_nsi(short, long_):
    raw = open(NSI, "rb").read()
    bom = b"\xef\xbb\xbf" if raw.startswith(b"\xef\xbb\xbf") else b""
    txt = raw[len(bom):].decode("utf-8")
    txt = re.sub(r'(!define\s+APPVER\s+)"[^"]*"', r'\1"%s"' % short, txt)
    txt = re.sub(r'(VIProductVersion\s+)"[^"]*"', r'\1"%s"' % long_, txt)
    txt = re.sub(r'(OutFile\s+")..\\\\dist\\\\[^"]*"',
                 r'\1..\\dist\\MDImageCleaner_v%s_安装版.exe"' % short, txt)
    open(NSI, "wb").write(bom + txt.encode("utf-8"))


def main():
    ver = read_version()
    if not ver:
        print("[错误] 读不到 res/app.rc 里的 FILEVERSION")
        return 1
    short, long_ = ver

    if not os.path.isfile(EXE):
        print("[错误] 找不到 desktop/dist/MDImageCleaner.exe，先跑 python desktop/build.py")
        return 1

    nsis = find_makensis()
    if not nsis:
        print("[错误] 找不到 makensis.exe：装一个 NSIS 3.x（装到默认路径即可），"
              "或用环境变量 MAKENSIS 指向它")
        return 1

    if not ensure_art():
        return 1

    print("[2/4] 校对脚本编码与界面字体 …")
    ensure_bom()
    ensure_font(nsis)
    patch_nsi(short, long_)

    print("[3/4] 版本 %s，开始打包 …" % short)
    r = subprocess.run([nsis, "installer.nsi"], cwd=HERE)
    if r.returncode != 0:
        print("[错误] makensis 打包失败")
        return 1

    out = os.path.join(DIST, "MDImageCleaner_v%s_安装版.exe" % short)
    if not os.path.isfile(out):
        print("[错误] 没生成 %s" % out)
        return 1

    print("[4/4] 完成：%s" % out)
    print("      体积 %.2f MB（%.0f KB）" % (os.path.getsize(out) / 1048576.0,
                                            os.path.getsize(out) / 1024.0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
