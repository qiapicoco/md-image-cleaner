# -*- coding: utf-8 -*-

# SPDX-License-Identifier: MIT
# Copyright (c) 2026 qiapicoco
# MD Image Cleaner - https://github.com/qiapicoco/md-image-cleaner

"""一键取图：启动 exe（可带 --open），等窗口出现后截图，再关闭。

用法：python tools/snap.py 输出.png [md路径] [等待秒]
"""
import ctypes
import ctypes.wintypes as wt
import os
import subprocess
import sys
import time

TITLE = "Typora清理未引用图片"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXE = os.path.join(ROOT, "desktop", "dist", "MDImageCleaner.exe")

u = ctypes.windll.user32
u.FindWindowW.restype = wt.HWND
u.FindWindowW.argtypes = [wt.LPCWSTR, wt.LPCWSTR]


def find():
    return u.FindWindowW(None, TITLE)


def wait_window(timeout=10.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        h = find()
        if h and u.IsWindowVisible(h):
            return h
        time.sleep(0.15)
    return 0


def close(h):
    u.PostMessageW(h, 0x0010, 0, 0)  # WM_CLOSE


def main():
    out = sys.argv[1]
    md = sys.argv[2] if len(sys.argv) > 2 else ""
    wait = float(sys.argv[3]) if len(sys.argv) > 3 else 2.0

    before = set()
    # 记录已存在的同类窗口，避免关错
    existing = find()
    if existing:
        close(existing)
        time.sleep(0.6)

    args = [EXE]
    if md:
        args += ["--open", md]
    subprocess.Popen(args, cwd=ROOT)
    h = wait_window()
    if not h:
        print("窗口未出现")
        return 1
    time.sleep(wait)
    # 有 --open 时跑完会弹「清理完成」模态框，先点掉再截图
    if md:
        for _ in range(20):
            subprocess.call([sys.executable, os.path.join(ROOT, "tools", "kill_dialog.py"),
                             "清理完成", "0"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            time.sleep(0.3)
            break
        time.sleep(0.6)
    rc = subprocess.call([sys.executable, os.path.join(ROOT, "tools", "shot.py"), TITLE, out])
    close(h)
    time.sleep(0.4)
    return rc


if __name__ == "__main__":
    sys.exit(main())
