# MD Image Cleaner · VSCode 扩展

找出笔记同名 `.assets` 文件夹里**没被引用**的图片，侧边开一个预览面板，勾选后移动到 `deleted_images`。

**只移动，不删除。** 移错了把图片拖回去即可。

## 安装

### 方式一：装 .vsix（不用命令行工具）

1. 拿到 `dist/md-image-cleaner-2.0.0.vsix`
2. VSCode 里 `Ctrl+Shift+P` → `Extensions: Install from VSIX...` → 选这个文件
3. 重载窗口

### 方式二：开发模式跑

```bash
# 把本目录当扩展目录打开，F5 启动扩展宿主
code vscode-extension
```

### 方式三：自己打包 .vsix

```bash
python tools/build_plugins.py
```

脚本手搓 zip 结构，**不需要** `npm install -g vsce`，也不联网。

## 用法

Markdown 文件打开的状态下：

- 编辑器右上角会出现一个小图标（`editor/title` 按钮），点它
- 或在资源管理器里右键 `.md` 文件 → **预览并清理未引用图片**
- 或命令面板（`Ctrl+Shift+P`）：
  - `MD Image Cleaner: 预览并清理未引用图片`
  - `MD Image Cleaner: 只统计不移动`（安全）

预览面板里 **未使用** 的图片默认全勾，点「移动 N 张」执行。

## 设置

| 配置项 | 默认 | 说明 |
| --- | --- | --- |
| `mdImageCleaner.enhanced` | `true` | 额外识别 `![[图.png]]` 和 `<img src="图.png">` |
| `mdImageCleaner.deletedFolder` | `deleted_images` | 移动到哪个子目录 |

## 前置条件

只处理 **「笔记.md + 笔记.assets」** 同名资源夹结构（Typora 默认、以及很多 Markdown 插件的约定）。
没有 `.assets` 文件夹时会提示，不会瞎猜路径。

## 安全细节

- 扩展名白名单与桌面版一致：`.png .jpg .jpeg .bmp .svg .tiff .webp .gif`
- 目标重名自动加 `(1) (2)`，不覆盖
- 拒绝 `../` 之类的路径穿越（只接受纯文件名）
- 全程本地，不联网
