# -*- coding: utf-8 -*-

# SPDX-License-Identifier: MIT
# Copyright (c) 2026 qiapicoco
# MD Image Cleaner - https://github.com/qiapicoco/md-image-cleaner

"""关闭指定标题的模态对话框（用于自动化截图）。"""
import ctypes
import sys
import time

u = ctypes.windll.user32
u.FindWindowW.restype = ctypes.c_void_p

title = sys.argv[1] if len(sys.argv) > 1 else "清理完成"
wait = float(sys.argv[2]) if len(sys.argv) > 2 else 0
if wait:
    time.sleep(wait)

hwnd = u.FindWindowW(None, title)
if not hwnd:
    print("dialog not found:", title)
    sys.exit(1)
# 优先点对话框里的按钮（BM_CLICK 比 WM_COMMAND 可靠）
child = u.FindWindowExW(ctypes.c_void_p(hwnd), None, "Button", None)
if child:
    u.SendMessageW(ctypes.c_void_p(child), 0x00F5, 0, 0)   # BM_CLICK
    time.sleep(0.2)
hwnd2 = u.FindWindowW(None, title)
if hwnd2:
    u.PostMessageW(ctypes.c_void_p(hwnd2), 0x0010, 0, 0)   # WM_CLOSE 兜底
    time.sleep(0.2)
print("closed dialog:", title, "still:", bool(u.FindWindowW(None, title)))
