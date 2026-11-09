# 开发期工具（不参与构建）

这些脚本是重构过程中用来「把新版界面调到和原版像素一致」的，跑一次就够，
或者只在改 UI 时才需要。放在这里是为了不污染 `tools/` 的主构建路径。

日常构建、测试、发版只需要 `tools/` 下那四个：`build_plugins.py`、
`test_plugins.js`、`push_all.sh`、`web.py`。

## 脚本清单

| 脚本 | 用途 |
| --- | --- |
| `probe_original.py` | 启动原版 PyQt5 界面并自动打开指定 md（跳过文件对话框），用来取参考截图 |
| `shot.py` | 按窗口标题定位窗口，截客户区存 PNG，并打印窗口矩形与 DPI |
| `snap.py` | 一键取图：启动 exe（可带 `--open`）、等窗口出现、截图、关闭 |
| `reset_shot.py` | 把 `core/fixtures/basic` 复制到 `core/_shot/basic`，删掉旧的 `deleted_images` |
| `kill_dialog.py` | 关闭指定标题的模态对话框（自动化截图时挡窗口） |
| `diff.py` | 像素对拍：比较两张同尺寸截图，输出差异率、热力图、分块定位 |
| `measure.py` | 界面度量：把关键元素坐标量出来，用于对齐原版像素 |
| `make_logo.py` | 生成候选 logo（1024px 绘制后降采样）与多尺寸对照图，logo 已定稿，仅存档 |

## 典型用法

改完界面后验证没有偏移：

```bash
# 1. 取参考图（原版）
python tools/dev/probe_original.py

# 2. 取新版图
python tools/dev/snap.py docs/new_empty.png

# 3. 对拍
python tools/dev/diff.py docs/ref_original_empty.png docs/new_empty.png
```

依赖 Pillow（`python -m pip install Pillow`）。`probe_original.py` 另外需要
PyQt5 和原版的依赖，只在需要重新取参考图时用得上。

> 所有脚本都按「仓库根 = 上三级目录」定位，不依赖当前工作目录。
