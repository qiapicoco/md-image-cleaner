# -*- coding: utf-8 -*-

# SPDX-License-Identifier: MIT
# Copyright (c) 2026 qiapicoco
# MD Image Cleaner - https://github.com/qiapicoco/typora-assets-image-cleaner

"""截图工具：按窗口标题定位窗口，截取客户区，存 PNG（可同时打印窗口矩形与 DPI）。"""
import ctypes
import ctypes.wintypes as wt
import sys
import time

try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    pass

u = ctypes.windll.user32
g = ctypes.windll.gdi32

u.GetWindowRect.argtypes = [wt.HWND, ctypes.POINTER(wt.RECT)]
u.GetClientRect.argtypes = [wt.HWND, ctypes.POINTER(wt.RECT)]
u.ClientToScreen.argtypes = [wt.HWND, ctypes.POINTER(wt.POINT)]
u.FindWindowW.restype = wt.HWND


def find(title):
    h = u.FindWindowW(None, title)
    return h if h else 0


def client_rect(hwnd):
    r = wt.RECT()
    u.GetClientRect(hwnd, ctypes.byref(r))
    pt = wt.POINT(0, 0)
    u.ClientToScreen(hwnd, ctypes.byref(pt))
    return pt.x, pt.y, r.right, r.bottom


def grab(hwnd, out):
    from PIL import ImageGrab
    x, y, w, h = client_rect(hwnd)
    ImageGrab.grab(bbox=(x, y, x + w, y + h), all_screens=True).save(out)
    print(f"saved {out}  client=({x},{y},{w},{h})")


if __name__ == "__main__":
    title = sys.argv[1]
    out = sys.argv[2]
    wait = float(sys.argv[3]) if len(sys.argv) > 3 else 0
    if wait:
        time.sleep(wait)
    h = find(title)
    if not h:
        print("window not found:", title)
        sys.exit(1)
    u.SetForegroundWindow(h)
    time.sleep(0.4)
    grab(h, out)
