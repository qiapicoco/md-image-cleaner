# 更新记录

遵循 [三段式版本号](https://semver.org/lang/zh-CN/)：功能进位次版本，修 bug 进修订号，
换实现/不兼容旧版才动主版本。

## v2.0.0 — 2026-11-09

换实现、加形态。**判定结果与原版逐字段一致**（6 组黄金用例 + 插件 7/7），但体积从 28.7 MB 降到 301 KB。

### 新增

- **Obsidian 插件**：`.obsidian/plugins/md-image-cleaner/`，默认开启增强模式
- **VSCode 扩展**：`md-image-cleaner-2.0.0.vsix`，编辑器内预览面板
- **Typora 插件**：配合 [obgnail/typora_plugin](https://github.com/obgnail/typora_plugin) 的自定义插件，快捷键 `Ctrl+Alt+M`
- 安装包 `MDImageCleaner_v2.0.0_setup.exe`：用户级安装、中文向导、自带卸载
- 命令行：`--check` / `--apply` / `--json` / `--open`，可直接拖 `.md` 到 exe 上

### 变更

- 桌面版由 Python + PyQt5 重写为 **C++17 + 纯 Win32/GDI+ 自绘**（无 MFC / Qt / WebView2），
  exe 301 KB，安装包 247 KB
- 插件默认启用**增强模式**，额外识别 `![[图片.png]]` 与 `<img src="图片.png">`；
  桌面版为保持与旧版行为一致，仍用兼容模式

### 修复

- 未引用图片的缩略图显示为灰块（原版先移动文件再读图，存在竞态）
- 不同 DPI 缩放下界面模糊、1px 描边糊成 2px

### 说明

- `legacy/` 保留原 PyQt5 单文件实现（约 640 行），作为回归基准，长期维护不再更新
- 项目开始使用 [MIT 协议](LICENSE)

## v1.x — 2025-05 至 2025-06

原 PyQt5 版本，单文件 `typora_assets_cleaner.py`，PyInstaller 打包为
`Typora_清理未引用图片工具.exe`（28.7 MB）。仅支持 Typora，仅识别 `![alt](path)` 与 `[text](path)`。
