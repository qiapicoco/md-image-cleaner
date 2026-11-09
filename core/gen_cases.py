# -*- coding: utf-8 -*-
"""
黄金用例生成器 —— 用【原版 PyQt5 代码】作为 oracle，产出基准 JSON。

做法：
  1. 打桩 PyQt5（原版模块 import 时就依赖它），把 legacy/typora_assets_cleaner.py
     当作普通 Python 模块加载；
  2. 把 core/fixtures/<case> 复制到临时目录，调用 CleaningThread.run() 真实跑一遍；
  3. 记录：引用集合、全部图片、未引用、统计、日志、进度、跑完后的目录状态；
  4. 把 fixture 根路径归一化成 <FIXTURE>，耗时归一化成 <T>，写进 core/cases/<case>.json。

C++ 版只要产出同样结构、同样归一化的 JSON，逐字段比对即可。
"""
import importlib.util
import json
import os
import re
import shutil
import sys
import types

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(ROOT)
FIXTURES = os.path.join(ROOT, "fixtures")
CASES = os.path.join(ROOT, "cases")
LEGACY = os.path.join(PROJ, "legacy", "typora_assets_cleaner.py")
RUN = os.path.join(ROOT, "_run")


# ---------------------------------------------------------------- PyQt5 打桩
class _Sig:
    def __init__(self):
        self._cbs = []

    def connect(self, cb):
        self._cbs.append(cb)

    def emit(self, *args):
        for cb in self._cbs:
            cb(*args)


class _Dummy:
    def __init__(self, *a, **k):
        pass

    def __getattr__(self, n):
        return _Dummy()

    def __call__(self, *a, **k):
        return _Dummy()


def _install_stubs():
    class QThread:
        def __init__(self, *a, **k):
            pass

    def pyqtSignal(*a, **k):
        return _Sig()

    def make(name, **attrs):
        m = types.ModuleType(name)
        m.__getattr__ = lambda n: _Dummy()
        for k, v in attrs.items():
            setattr(m, k, v)
        sys.modules[name] = m
        return m

    pkg = make("PyQt5")
    pkg.__path__ = []
    make("PyQt5.QtWidgets",
         QApplication=_Dummy, QMainWindow=_Dummy, QPushButton=_Dummy,
         QVBoxLayout=_Dummy, QHBoxLayout=_Dummy, QTextEdit=_Dummy,
         QFileDialog=_Dummy, QWidget=_Dummy, QLabel=_Dummy,
         QProgressBar=_Dummy, QMessageBox=_Dummy, QSplitter=_Dummy,
         QScrollArea=_Dummy, QGroupBox=_Dummy, QGridLayout=_Dummy,
         QSizePolicy=_Dummy)
    make("PyQt5.QtCore", Qt=_Dummy, QThread=QThread, pyqtSignal=pyqtSignal,
         QDir=_Dummy, QUrl=_Dummy)
    make("PyQt5.QtGui", QPixmap=_Dummy, QFont=_Dummy, QColor=_Dummy,
         QDesktopServices=_Dummy)


def load_legacy():
    _install_stubs()
    spec = importlib.util.spec_from_file_location("legacy_tac", LEGACY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ---------------------------------------------------------------- fixture 定义
def _png(path, rgb, w, h):
    from PIL import Image
    Image.new("RGB", (w, h), rgb).save(path, "PNG")


def _jpg(path, rgb, w, h):
    from PIL import Image
    Image.new("RGB", (w, h), rgb).save(path, "JPEG", quality=70)


def build_fixture(name, md, images, extras=None, subdirs=None):
    """images: [(文件名, 类型png/jpg/gif, rgb, w, h)]"""
    root = os.path.join(FIXTURES, name)
    if os.path.isdir(root):
        shutil.rmtree(root)
    os.makedirs(root)
    assets = os.path.join(root, name + ".assets")
    os.makedirs(assets)
    for item in images:
        fn, kind, rgb, w, h = item
        p = os.path.join(assets, fn)
        if kind == "png":
            _png(p, rgb, w, h)
        elif kind == "jpg":
            _jpg(p, rgb, w, h)
        elif kind == "gif":
            _png(p, rgb, w, h)
            os.replace(p, p)  # 占位：gif 用 png 字节也能被原版按扩展名计入
    for fn, text in (extras or {}).items():
        with open(os.path.join(assets, fn), "w", encoding="utf-8") as f:
            f.write(text)
    for d in (subdirs or []):
        os.makedirs(os.path.join(assets, d), exist_ok=True)
    with open(os.path.join(root, name + ".md"), "w", encoding="utf-8", newline="\n") as f:
        f.write(md)
    return root


# 六组用例 ---------------------------------------------------------------
FIXTURE_SPECS = {}


def _spec(name, md, images, extras=None, subdirs=None):
    FIXTURE_SPECS[name] = dict(md=md, images=images, extras=extras, subdirs=subdirs)


_spec("basic",
      """# 基础用例

正文引用两张：

![](basic.assets/2024_photo_01.png)

第二个：![](basic.assets/2024_photo_02.jpg)

还有一个普通链接：

[看这张](basic.assets/2024_photo_03.png)
""",
      [("2024_photo_01.png", "png", (220, 60, 60), 240, 160),
       ("2024_photo_02.jpg", "jpg", (60, 140, 220), 160, 240),
       ("2024_photo_03.png", "png", (60, 180, 120), 300, 120),
       ("2024_photo_04.png", "png", (240, 200, 60), 120, 300),
       ("2024_photo_05.png", "png", (150, 90, 200), 200, 200),
       ("2024_photo_06.png", "png", (90, 90, 90), 80, 80)])

_spec("allused",
      """# 全部被引用

![](allused.assets/a.png)
![](allused.assets/b.png)
""",
      [("a.png", "png", (200, 100, 100), 200, 140),
       ("b.png", "png", (100, 100, 200), 140, 200)])

_spec("noref",
      """# 没有任何图片引用

这段文字里没有图片，只有普通链接 [官网](https://example.com)。

""",
      [("x1.png", "png", (210, 120, 60), 200, 150),
       ("x2.png", "png", (60, 160, 210), 150, 200)])

_spec("emptyassets", """# 空 assets 目录\n""", [])

_spec("noassets", """# 没有 assets 目录\n""", [])

_spec("weird",
      """# 混合语法用例

正常引用：![](weird.assets/图片 1 号.png)

标准链接引用：[图](weird.assets/UPPER.PNG)

Obsidian wiki 语法（原版【识别不到】）：![[wiki_only.png]]

HTML img 标签（原版【识别不到】）：<img src="weird.assets/html_only.png">

引用一个不存在的图片：![](weird.assets/不存在.png)

引用远程图片：![](https://example.com/remote.jpg)

引用子目录里的图片：![](weird.assets/sub/nested.png)
""",
      [("图片 1 号.png", "png", (200, 80, 140), 200, 200),
       ("UPPER.PNG", "png", (80, 200, 140), 180, 120),
       ("wiki_only.png", "png", (140, 140, 240), 160, 160),
       ("html_only.png", "png", (240, 240, 100), 120, 180)],
      extras={"notes.txt": "这不是图片，应被忽略\n"},
      subdirs=["sub"])


# ---------------------------------------------------------------- 归一化 & 采集
def normalize(text, fixture_root):
    text = text.replace(fixture_root, "<FIXTURE>")
    text = re.sub(r"耗时: [0-9.]+ 秒", "耗时: <T> 秒", text)
    return text


def list_files(d):
    if not os.path.isdir(d):
        return []
    return sorted(f for f in os.listdir(d) if os.path.isfile(os.path.join(d, f)))


def run_case(mod, case):
    src = os.path.join(FIXTURES, case)
    work = os.path.join(RUN, case)
    if os.path.isdir(work):
        shutil.rmtree(work)
    os.makedirs(RUN, exist_ok=True)
    shutil.copytree(src, work)
    md = os.path.join(work, case + ".md")

    th = mod.CleaningThread(md)
    logs, progress, previews, stats = [], [], [], []

    th.update_signal = _Sig()
    th.progress_signal = _Sig()
    th.finish_signal = _Sig()
    th.found_image_signal = _Sig()
    th.stats_signal = _Sig()

    th.update_signal.connect(lambda s: logs.append(s))
    th.progress_signal.connect(lambda v, t: progress.append([v, t]))
    th.found_image_signal.connect(lambda p, u: previews.append(
        [normalize(os.path.basename(p), work), bool(u)]))
    th.stats_signal.connect(lambda a, b: stats.append([a, b]))
    finished = []
    th.finish_signal.connect(lambda n: finished.append(n))

    th.run()

    assets = os.path.join(work, case + ".assets")
    deleted = os.path.join(assets, "deleted_images")
    data = {
        "case": case,
        "md": case + ".md",
        "assets": case + ".assets",
        "logs": [normalize(s, work) for s in logs],
        "progress": progress,
        "previews": previews,
        "stats": stats[-1] if stats else [0, 0],
        "finished": finished[-1] if finished else None,
        "finalAssets": list_files(assets),
        "finalDeleted": list_files(deleted),
    }
    os.makedirs(CASES, exist_ok=True)
    out = os.path.join(CASES, case + ".json")
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return data


def main():
    only = sys.argv[1:] or None
    for name, s in FIXTURE_SPECS.items():
        build_fixture(name, s["md"], s["images"], s["extras"], s["subdirs"])
    # noassets 用例：删掉 assets 目录
    na = os.path.join(FIXTURES, "noassets", "noassets.assets")
    if os.path.isdir(na):
        shutil.rmtree(na)

    mod = load_legacy()
    for name in FIXTURE_SPECS:
        if only and name not in only:
            continue
        d = run_case(mod, name)
        print(f"[ok] {name:12s} unused={len(d['finalDeleted']):2d} "
              f"kept={len(d['finalAssets']):2d} logs={len(d['logs'])} "
              f"stats={d['stats']} finished={d['finished']}")


if __name__ == "__main__":
    main()
