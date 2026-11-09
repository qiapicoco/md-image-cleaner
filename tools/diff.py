# -*- coding: utf-8 -*-

# SPDX-License-Identifier: MIT
# Copyright (c) 2026 qiapicoco
# MD Image Cleaner - https://github.com/qiapicoco/typora-assets-image-cleaner

"""像素对拍：比较两张同尺寸截图，输出差异率、差异热力图与分块定位。

用法：python tools/diff.py docs/ref_original_empty.png docs/new_empty.png [out_prefix]
"""
import sys

from PIL import Image, ImageChops


def main(a_path, b_path, out="docs/_diff"):
    a = Image.open(a_path).convert("RGB")
    b = Image.open(b_path).convert("RGB")
    if a.size != b.size:
        print(f"尺寸不同: {a.size} vs {b.size}")
        return 2
    W, H = a.size
    d = ImageChops.difference(a, b)
    px = d.load()
    total = W * H
    diff_px = 0
    for y in range(H):
        for x in range(W):
            c = px[x, y]
            if c[0] + c[1] + c[2] > 24:
                diff_px += 1
    ratio = diff_px / total * 100
    print(f"尺寸 {W}x{H}  差异像素 {diff_px}/{total} = {ratio:.2f}%")

    # 热力图：差异放大 4 倍，红底
    hot = Image.new("RGB", (W, H), (255, 255, 255))
    hp = hot.load()
    for y in range(H):
        for x in range(W):
            c = px[x, y]
            v = c[0] + c[1] + c[2]
            if v > 24:
                k = min(255, 80 + v * 2)
                hp[x, y] = (k, 0, 0)
    hot.save(f"{out}_hot.png")

    # 分块统计（60x60 网格），列出差异最集中的块
    bs = 60
    blocks = []
    for by in range(0, H, bs):
        for bx in range(0, W, bs):
            n = 0
            for y in range(by, min(by + bs, H)):
                for x in range(bx, min(bx + bs, W)):
                    c = px[x, y]
                    if c[0] + c[1] + c[2] > 24:
                        n += 1
            if n:
                blocks.append((n, bx, by))
    blocks.sort(reverse=True)
    print("差异最集中的区块（像素数, x, y）：")
    for n, bx, by in blocks[:12]:
        print(f"  {n:5d}  ({bx:4d},{by:4d})")

    # 并排对照
    side = Image.new("RGB", (W, H * 2 + 10), (200, 200, 200))
    side.paste(a, (0, 0))
    side.paste(b, (0, H + 10))
    side.save(f"{out}_side.png")
    return 0 if ratio < 2.0 else 1


if __name__ == "__main__":
    a = sys.argv[1]
    b = sys.argv[2]
    out = sys.argv[3] if len(sys.argv) > 3 else "docs/_diff"
    sys.exit(main(a, b, out))
