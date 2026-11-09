# -*- coding: utf-8 -*-
"""界面度量：把关键元素的位置量出来，用于让新版对齐原版像素。

用法：python tools/measure.py docs/ref_original_empty.png
"""
import sys

from PIL import Image


def load(p):
    im = Image.open(p).convert("RGB")
    return im, im.load(), im.size


def nearc(c, t, tol=4):
    return all(abs(c[i] - t[i]) <= tol for i in range(3))


def bbox(px, W, H, pred, region=None):
    x0, y0, x1, y1 = region or (0, 0, W, H)
    xs, ys = [], []
    for y in range(y0, y1):
        for x in range(x0, x1):
            if pred(px[x, y]):
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return (min(xs), min(ys), max(xs), max(ys))


def ink(px, W, H, region, thr=170):
    return bbox(px, W, H, lambda c: sum(c) / 3 < thr, region)


def main(path):
    im, px, (W, H) = load(path)
    print(f"图像 {W}x{H}")
    items = [
        ("顶栏 #e9ecef", lambda c: nearc(c, (233, 236, 239), 2), (0, 0, W, 200)),
        ("红按钮", lambda c: nearc(c, (255, 107, 107), 8), None),
        ("绿按钮", lambda c: nearc(c, (0, 198, 167), 8), None),
        ("进度条边框", lambda c: nearc(c, (206, 212, 218), 3), (18, 250, W, 320)),
        ("统计栏", lambda c: nearc(c, (248, 249, 250), 1), (0, 640, W, H)),
        ("预览底色 #f0f0f0", lambda c: nearc(c, (240, 240, 240), 1), (600, 80, W, 700)),
    ]
    for name, pred, reg in items:
        print(f"  {name:18s} {bbox(px, W, H, pred, reg)}")
    texts = [
        ("顶栏文字", (16, 30, 1000, 70)),
        ("标题", (20, 96, 660, 140)),
        ("说明行", (20, 145, 660, 180)),
        ("绿按钮文字", (240, 210, 460, 252)),
        ("进度标签", (18, 270, 60, 300)),
        ("进度文字", (650, 270, 700, 300)),
        ("日志组标题", (20, 310, 200, 340)),
        ("预览组标题", (695, 108, 900, 132)),
        ("统计文字", (20, 670, 400, 706)),
        ("红按钮文字", (1040, 30, 1175, 62)),
    ]
    for name, reg in texts:
        print(f"  {name:12s} 墨迹={ink(px, W, H, reg)}")


if __name__ == "__main__":
    main(sys.argv[1])
