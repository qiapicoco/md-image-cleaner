# -*- coding: utf-8 -*-

# SPDX-License-Identifier: MIT
# Copyright (c) 2026 qiapicoco
# MD Image Cleaner - https://github.com/qiapicoco/md-image-cleaner

"""启动原版界面并自动打开指定 md（跳过文件对话框），用于取参考截图。"""
import importlib.util
import os
import shutil
import sys

os.environ["QT_FONT_DPI"] = "96"          # 与原版 __main__ 保持一致
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CASE = sys.argv[1] if len(sys.argv) > 1 else "basic"

work = os.path.join(BASE, "core", "_shot", CASE)
if os.path.isdir(work):
    shutil.rmtree(work)
os.makedirs(os.path.dirname(work), exist_ok=True)
shutil.copytree(os.path.join(BASE, "core", "fixtures", CASE), work)
MD = os.path.join(work, CASE + ".md")

spec = importlib.util.spec_from_file_location(
    "tac", os.path.join(BASE, "legacy", "typora_assets_cleaner.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

from PyQt5.QtWidgets import QApplication, QFileDialog, QMessageBox  # noqa: E402

m.QFileDialog.getOpenFileName = staticmethod(lambda *a, **k: (MD, ""))
m.QMessageBox.information = staticmethod(lambda *a, **k: QMessageBox.Ok)
m.QMessageBox.critical = staticmethod(lambda *a, **k: QMessageBox.Ok)

app = QApplication(sys.argv[:1])
w = m.MainWindow()
w.show()
w.select_and_clean()
app.exec_()
