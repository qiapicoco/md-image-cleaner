# -*- coding: utf-8 -*-

# SPDX-License-Identifier: MIT
# Copyright (c) 2026 qiapicoco
# MD Image Cleaner - https://github.com/qiapicoco/typora-assets-image-cleaner

"""
构建脚本：zig cc 交叉编译 Windows 原生程序（无运行时依赖），带体积门禁。

用法：
    python build.py test        编译核心自测程序（控制台版）
    python build.py app         编译发布版 GUI（体积门禁 600 KB）
    python build.py icon        重新生成图标（app.ico 多帧 PNG 压缩）
"""
import os
import shutil
import struct
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")
RES = os.path.join(HERE, "res")
DIST = os.path.join(HERE, "dist")

SIZE_LIMIT = 600 * 1024

ZIG_CANDIDATES = [
    os.environ.get("ZIG"),
    os.path.join(HERE, "..", "_toolchain", "ziglang", "zig.exe"),
    shutil.which("zig"),
]

# 只链接系统 DLL：user32/gdi32/gdiplus/shell32/comdlg32/shlwapi/ole32
LIBS = ["-lshell32", "-luser32", "-lgdi32", "-lcomdlg32", "-lgdiplus",
        "-lshlwapi", "-lole32", "-luuid", "-lmsimg32"]

COMMON = [
    "-target", "x86_64-windows-gnu",
    "-O2", "-std=c++17",
    "-fno-exceptions", "-fno-rtti",
    "-finput-charset=UTF-8", "-fexec-charset=UTF-8",
    "-Wall", "-Wextra",
    "-Wno-unused-parameter", "-Wno-unused-function", "-Wno-cast-function-type",
    "-Wl,--strip-all",
    "-static", "-static-libgcc",
]


def find_zig():
    for c in ZIG_CANDIDATES:
        if c and os.path.isfile(c):
            return c
    sys.exit("[错误] 找不到 zig.exe。设置环境变量 ZIG 指向它，或放到 _toolchain/ziglang/zig.exe")


def run(cmd, cwd=None):
    print("  " + " ".join('"%s"' % c if " " in c else c for c in cmd))
    r = subprocess.run(cmd, cwd=cwd)
    if r.returncode != 0:
        sys.exit("[错误] 编译失败")


def build_test(zig):
    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, "core_test.exe")
    cmd = [zig, "c++"] + COMMON + [
        "-Wl,--subsystem,console",
        "-o", out, os.path.join(HERE, "test", "core_test.cpp"),
    ] + LIBS
    run(cmd)
    print("      体积 %.1f KB → %s" % (os.path.getsize(out) / 1024, out))


def compile_res(zig):
    rc = os.path.join(RES, "app.rc")
    res = os.path.join(RES, "app.res")
    if not os.path.isfile(os.path.join(RES, "app.ico")):
        print("[提示] 缺少 app.ico，先执行 python build.py icon")
        return None
    run([zig, "rc", "/c", "65001", rc, res], cwd=RES)
    return res if os.path.isfile(res) else None


def build_app(zig):
    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, "MDImageCleaner.exe")
    rc = compile_res(zig)
    cmd = [zig, "c++"] + COMMON + [
        "-Wl,--subsystem,windows",
        "-o", out, os.path.join(SRC, "main.cpp"),
    ]
    if rc and os.path.isfile(rc):
        cmd.append(rc)
    cmd += LIBS
    run(cmd)

    size = os.path.getsize(out)
    print("\n" + "=" * 52)
    print("  产物   : %s" % out)
    print("  体积   : %.1f KB (%.2f MB)" % (size / 1024, size / 1048576))
    print("  上限   : %.0f KB" % (SIZE_LIMIT / 1024))
    if size > SIZE_LIMIT:
        print("  [失败] 超出体积门禁")
        sys.exit(1)
    print("  [通过] 体积达标，余量 %.1f KB" % ((SIZE_LIMIT - size) / 1024))
    print("=" * 52)


# ---------------------------------------------------------------- 图标
def build_icon():
    """把一张 1024px 的 PNG 转成多帧 ico：16/24/32/48/64/128/256，大尺寸用 PNG 压缩"""
    from PIL import Image
    src = os.path.join(RES, "logo.png")
    if not os.path.isfile(src):
        sys.exit("[错误] 缺少 res/logo.png")
    img = Image.open(src).convert("RGBA")
    sizes = [256, 128, 64, 48, 32, 24, 16]
    frames = []
    for s in sizes:
        f = img.resize((s, s), Image.LANCZOS)
        frames.append(f)

    out = os.path.join(RES, "app.ico")
    # 手写 ICO：<=64 用 32bpp BMP，>=128 用 PNG
    import io
    blobs = []
    for f in frames:
        w = f.size[0]
        if True:   # 全部 PNG 压缩：Win7+ 原生支持任意尺寸的 PNG 图标帧
            b = io.BytesIO()
            f.save(b, "PNG", optimize=True)
            blobs.append(b.getvalue())
        else:
            # BMP (BITMAPINFOHEADER + BGRA 自下而上)
            px = f.load()
            rows = []
            for y in range(w - 1, -1, -1):
                row = bytearray()
                for x in range(w):
                    r, g, b_, a = px[x, y]
                    row += bytes((b_, g, r, a))
                rows.append(bytes(row))
            data = b"".join(rows)
            hdr = struct.pack("<IiiHHIIiiII", 40, w, w * 2, 1, 32, 0,
                              len(data), 0, 0, 0, 0)
            blobs.append(hdr + data + bytes(w * 4))  # AND mask

    n = len(frames)
    offset = 6 + n * 16
    dirs = b""
    for f, blob in zip(frames, blobs):
        s = f.size[0]
        dirs += struct.pack("<BBBBHHII", s % 256, s % 256, 0, 0, 1, 32,
                            len(blob), offset)
        offset += len(blob)
    with open(out, "wb") as fh:
        fh.write(struct.pack("<HHH", 0, 1, n) + dirs + b"".join(blobs))
    print("  图标已生成: %s  %.1f KB（%d 帧）" % (out, os.path.getsize(out) / 1024, n))


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "app"
    if what == "icon":
        build_icon()
    elif what == "test":
        build_test(find_zig())
    else:
        build_app(find_zig())
