# -*- coding: utf-8 -*-
"""重置截图用 fixture（把 core/fixtures/basic 复制到 core/_shot/basic，删掉旧的 deleted_images）。"""
import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "core", "fixtures", "basic")
DST = os.path.join(ROOT, "core", "_shot", "basic")


def main():
    if os.path.isdir(DST):
        shutil.rmtree(DST)
    shutil.copytree(SRC, DST)
    assets = os.path.join(DST, "basic.assets")
    n = len([f for f in os.listdir(assets) if os.path.isfile(os.path.join(assets, f))])
    print(f"已重置 {DST}  图片 {n} 张")


if __name__ == "__main__":
    main()
