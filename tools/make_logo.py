# -*- coding: utf-8 -*-

# SPDX-License-Identifier: MIT
# Copyright (c) 2026 qiapicoco
# MD Image Cleaner - https://github.com/qiapicoco/md-image-cleaner

"""生成候选 logo（1024px 绘制后降采样），并输出多尺寸对照图用于挑选。"""
import os

from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "desktop", "res")
S = 1024


def rr(d, box, r, fill, width=0):
    if width:
        d.rounded_rectangle(box, radius=r, outline=fill, width=width)
    else:
        d.rounded_rectangle(box, radius=r, fill=fill)


def variant_a():  # 青底 + 白照片 + 红角标（叉）
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rr(d, (0, 0, S - 1, S - 1), 224, (0, 198, 167, 255))
    # 照片卡
    rr(d, (176, 208, 848, 752), 64, (255, 255, 255, 255))
    # 山
    d.polygon([(240, 688), (430, 430), (556, 600), (632, 512), (784, 688)],
              fill=(0, 150, 128, 255))
    # 太阳
    d.ellipse((610, 300, 706, 396), fill=(255, 190, 90, 255))
    # 角标
    d.ellipse((640, 640, 928, 928), fill=(255, 107, 107, 255))
    d.ellipse((640, 640, 928, 928), outline=(255, 255, 255, 255), width=22)
    d.line([(716, 784), (852, 784)], fill=(255, 255, 255, 255), width=56)
    d.line([(784, 716), (784, 852)], fill=(255, 255, 255, 255), width=56)
    d.line([(736, 736), (832, 832)], fill=(255, 107, 107, 255), width=0)
    return im


def variant_b():  # 青底 + 白照片 + 红角标（对勾）
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rr(d, (0, 0, S - 1, S - 1), 224, (0, 198, 167, 255))
    rr(d, (176, 208, 848, 752), 64, (255, 255, 255, 255))
    d.polygon([(240, 688), (430, 430), (556, 600), (632, 512), (784, 688)],
              fill=(0, 150, 128, 255))
    d.ellipse((610, 300, 706, 396), fill=(255, 190, 90, 255))
    d.ellipse((636, 636, 932, 932), fill=(255, 107, 107, 255))
    d.ellipse((636, 636, 932, 932), outline=(255, 255, 255, 255), width=22)
    d.line([(712, 790), (766, 846), (860, 726)], fill=(255, 255, 255, 255),
           width=54, joint="curve")
    return im


def variant_c():  # 青底 + 白扫帚（清理隐喻）
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rr(d, (0, 0, S - 1, S - 1), 224, (0, 198, 167, 255))
    # 柄
    d.line([(760, 208), (470, 560)], fill=(255, 255, 255, 255), width=86)
    # 刷头
    d.polygon([(392, 520), (556, 606), (420, 800), (300, 700)],
              fill=(255, 255, 255, 255))
    for i in range(5):
        x = 330 + i * 34
        d.line([(x, 650), (x - 40, 780)], fill=(255, 255, 255, 255), width=16)
    # 灰尘点
    for (cx, cy, r) in [(700, 760, 26), (790, 690, 18), (620, 830, 16)]:
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 107, 107, 255))
    return im


def variant_d():  # 白底青线（浅色系统里更清爽）：照片 + 缺口
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rr(d, (0, 0, S - 1, S - 1), 224, (255, 255, 255, 255))
    rr(d, (0, 0, S - 1, S - 1), 224, (0, 198, 167, 255), width=96)
    d.polygon([(230, 720), (430, 430), (566, 610), (646, 505), (794, 720)],
              fill=(0, 198, 167, 255))
    d.ellipse((596, 282, 700, 386), fill=(255, 190, 90, 255))
    d.line([(760, 250), (900, 390)], fill=(255, 107, 107, 255), width=64)
    d.line([(900, 250), (760, 390)], fill=(255, 107, 107, 255), width=64)
    return im


VARIANTS = {"a": variant_a, "b": variant_b, "c": variant_c, "d": variant_d}


def contact_sheet():
    sizes = [256, 128, 64, 32, 16]
    pad = 16
    rows = len(VARIANTS)
    W = pad + sum(s + pad for s in sizes)
    H = rows * (256 + pad) + pad
    sheet = Image.new("RGB", (W, H), (245, 245, 245))
    for r, (name, fn) in enumerate(VARIANTS.items()):
        big = fn()
        big.save(os.path.join(OUT, f"logo_{name}.png"))
        y = pad + r * (256 + pad)
        x = pad
        sheet.paste(big.resize((256, 256), Image.LANCZOS), (x, y))
        x += 256 + pad
        for s in sizes[1:]:
            small = big.resize((s, s), Image.LANCZOS)
            sheet.paste(small, (x, y + (256 - s) // 2))
            x += s + pad
    sheet.save(os.path.join(OUT, "_contact_sheet.png"))
    print("saved", os.path.join(OUT, "_contact_sheet.png"))


if __name__ == "__main__":
    contact_sheet()
