# -*- coding: utf-8 -*-

# SPDX-License-Identifier: MIT
# Copyright (c) 2026 qiapicoco
# MD Image Cleaner - https://github.com/qiapicoco/typora-assets-image-cleaner

"""
生成安装向导界面图（NSIS MUI2）

产物（installer.nsi 直接引用）：
  setup_side.bmp    164x500   欢迎页 / 完成页左侧大图（MUI 设计高 314，做高防裁切留白）
  setup_header.bmp  150x57    其余页面顶部小图

MUI2 的尺寸是写死的，不能改；BMP 必须 24 位无 alpha，否则 NSIS 读出来是花的。
配色沿用程序图标：青绿主色 #00C6A7 + 深青底 + 一点删除红。
"""
import os
import re

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(os.path.dirname(HERE), "res")
ICON = os.path.join(RES, "logo.png")
FONT_BD = "C:/Windows/Fonts/msyhbd.ttc"
FONT_RG = "C:/Windows/Fonts/msyh.ttc"

C_TOP = (10, 34, 32)
C_BOT = (14, 58, 52)
C_INK = (255, 255, 255)
C_SUB = (150, 214, 202)
C_DIM = (104, 156, 146)
C_LINE = (44, 96, 88)
C_ACCENT = (0, 198, 167)      # #00C6A7
C_WARN = (255, 107, 107)      # #FF6B6B


def app_version():
    rc = os.path.join(RES, "app.rc")
    try:
        txt = open(rc, encoding="utf-8", errors="replace").read()
        m = re.search(r"FILEVERSION\s+(\d+)\s*,\s*(\d+)\s*,\s*(\d+)", txt)
        if m:
            return ".".join(m.groups())
    except OSError:
        pass
    return "1.0.0"


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def diag_gradient(w, h, c1, c2):
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = (x / max(1, w - 1) * 0.45) + (y / max(1, h - 1) * 0.55)
            px[x, y] = (
                int(c1[0] + (c2[0] - c1[0]) * t),
                int(c1[1] + (c2[1] - c1[1]) * t),
                int(c1[2] + (c2[2] - c1[2]) * t),
            )
    return img


def glow(img, center, radius, strength=90):
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    steps = 26
    for i in range(steps, 0, -1):
        r = radius * i / steps
        a = int(strength * (1 - i / steps) ** 1.6)
        d.ellipse([center[0] - r, center[1] - r, center[0] + r, center[1] + r], fill=a)
    mask = mask.filter(ImageFilter.GaussianBlur(radius * 0.18))
    tint = Image.new("RGB", (w, h), C_ACCENT)
    return Image.composite(tint, img, mask.point(lambda v: int(v * 0.55)))


def round_icon(size, ring=True):
    src = Image.open(ICON).convert("RGBA")
    src = src.resize((size, size), Image.LANCZOS)
    circle = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(circle).ellipse([0, 0, size * 4 - 1, size * 4 - 1], fill=255)
    circle = circle.resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(src, (0, 0), circle)
    if not ring:
        return out
    pad = 5
    canvas = Image.new("RGBA", (size + pad * 2, size + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    d.ellipse([0, 0, size + pad * 2 - 1, size + pad * 2 - 1], outline=(255, 255, 255, 235), width=2)
    canvas.paste(out, (pad, pad), out)
    return canvas


def centered(d, y, text, fnt, fill, width):
    box = d.textbbox((0, 0), text, font=fnt)
    x = (width - (box[2] - box[0])) / 2 - box[0]
    d.text((x, y), text, font=fnt, fill=fill)


def make_side(ver, uninstall=False):
    W, H = 164, 500
    img = diag_gradient(W, H, C_TOP, C_BOT if not uninstall else (30, 34, 36))
    img = glow(img, (128, 58), 96, 70 if uninstall else 110)
    d = ImageDraw.Draw(img)

    d.rectangle([0, 0, W, 3], fill=C_ACCENT if not uninstall else (96, 104, 108))

    ic = round_icon(62)
    img.paste(ic, ((W - ic.width) // 2, 26), ic)
    d = ImageDraw.Draw(img)

    f_name = font(FONT_BD, 15)
    f_cn = font(FONT_BD, 21)
    f_small = font(FONT_RG, 10)
    f_tiny = font(FONT_RG, 9)

    centered(d, 112, "MD Image", f_name, C_INK, W)
    centered(d, 132, "Cleaner", f_cn, C_INK, W)

    cy = 172
    for i in range(34):
        a = int(255 * (1 - abs(i - 17) / 18))
        col = tuple(int(C_LINE[k] + (C_ACCENT[k] - C_LINE[k]) * a / 255) for k in range(3))
        d.point((W // 2 - 17 + i, cy), fill=col)

    if uninstall:
        centered(d, 184, "卸载向导", f_small, C_SUB, W)
        centered(d, 202, "只删程序，不动笔记", f_tiny, C_DIM, W)
    else:
        centered(d, 184, "Markdown 图片清理", f_small, C_SUB, W)
        centered(d, 202, "本地运行 · 不联网", f_tiny, C_DIM, W)

    centered(d, 224, "v%s" % ver, f_tiny, C_SUB, W)

    px = img.load()
    for y in range(H - 40, H):
        k = (y - (H - 40)) / 40.0
        for x in range(W):
            r, g, b = px[x, y]
            px[x, y] = (int(r * (1 - 0.25 * k)), int(g * (1 - 0.25 * k)), int(b * (1 - 0.25 * k)))
    return img.convert("RGB")


def make_header(ver):
    W, H = 150, 57
    img = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(img)
    for x in range(W):
        t = (x / (W - 1)) ** 1.6
        col = (
            int(230 + (255 - 230) * t),
            int(250 + (255 - 250) * t),
            int(246 + (255 - 246) * t),
        )
        d.line([(x, 0), (x, H)], fill=col)
    for x in range(W):
        a = max(0.0, 1 - x / (W * 0.82))
        base = (255, 255, 255)
        col = tuple(int(base[k] + (C_ACCENT[k] - base[k]) * a) for k in range(3))
        d.line([(x, H - 15), (x, H - 14)], fill=col)

    ic = round_icon(38, ring=False)
    img.paste(ic, (W - ic.width - 8, (44 - ic.height) // 2), ic)
    return img


def main():
    ver = app_version()
    for img, name in [(make_side(ver), "setup_side.bmp"),
                      (make_side(ver, uninstall=True), "setup_wizard.bmp"),
                      (make_header(ver), "setup_header.bmp")]:
        p = os.path.join(HERE, name)
        img.save(p, "BMP")
        print("%s  %dx%d  %d 字节" % (name, img.width, img.height, os.path.getsize(p)))
    print("版本 %s" % ver)


if __name__ == "__main__":
    main()
