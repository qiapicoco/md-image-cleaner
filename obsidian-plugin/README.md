# MD Image Cleaner · Obsidian 插件

找出笔记同名 `.assets` 文件夹里**没被引用**的图片，先给你看缩略图，确认后再移动到 `deleted_images`。

**只移动，不删除。** 移错了，把图片从 `deleted_images` 拖回去就恢复了。

## 安装

### 方式一：手动拷贝（推荐，不用等上架）

1. 在你的仓库里建目录：

   ```
   你的仓库/.obsidian/plugins/md-image-cleaner/
   ```

2. 把本目录下的这三个文件拷进去：

   ```
   main.js
   manifest.json
   styles.css
   ```

3. Obsidian → 设置 → 第三方插件 → 关闭「安全模式」→ 点「重新加载插件」→ 在列表里打开 **MD Image Cleaner**

### 方式二：从源码构建

```bash
python tools/build_plugins.py     # 在项目根目录执行
```

`main.js` 就是 `shared/md-cleaner-core.js` + `obsidian-plugin/src/plugin.js` 内联后的产物。

## 用法

笔记打开的状态下，任选一种：

- 命令面板（`Ctrl+P`）→ `MD Image Cleaner: 预览并清理当前笔记的未引用图片`
- 左侧文件列表里右键这个 `.md` → **清理未引用图片**
- 命令面板 → `MD Image Cleaner: 只统计不移动`（安全，不动文件）

弹窗里会列出：

- **未使用**（红色）——默认全部勾上，去掉不想动的
- **已使用**（绿色）——只作对照，不会被移动

点「移动 N 张到 deleted_images」执行。

## 设置

| 项 | 默认 | 说明 |
| --- | --- | --- |
| 识别 Obsidian / HTML 图片引用 | 开 | `![[图.png]]` 与 `<img src="图.png">` 也算“已引用”。**强烈建议开着**，否则 wiki 嵌入的图片会被当成未引用 |
| 备份文件夹名 | `deleted_images` | 相对 `.assets` 的目录名 |
| 预览里显示已使用的图片 | 开 | 关掉只看要清理的 |

## 前置条件

本插件只处理 **「笔记.md + 笔记.assets」** 这种同名资源夹结构。用 Obsidian 默认的「附件统一放一个目录」时没有 `.assets`，
插件会提示找不到资源夹，不会瞎猜路径——想用的话把附件设置改成「当前笔记的同名文件夹」。

## 安全细节

- 只认这 8 种扩展名：`.png .jpg .jpeg .bmp .svg .tiff .webp .gif`（和桌面版一致）
- 移动目标重名时自动加 `(1) (2)` 后缀，**绝不覆盖**已存在的备份
- 只操作当前笔记对应的那一个 `.assets` 文件夹，不碰别处
- 全程本地，不联网
