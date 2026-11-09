# 参与贡献

谢谢愿意花时间。这个项目很小，规矩也少，但下面几条请务必先看一眼。

## 提交之前

```bash
python desktop/build.py            # 编译桌面版（顺带跑体积门禁 600 KB）
python core/check.py               # 桌面版核心 vs 原 Python 版：必须 6/6 一致
node shared/test_core.js           # 插件 JS 核心 vs 同一批基准：必须 7/7
node tools/test_plugins.js         # 插件文件操作：必须 8/8
python tools/build_plugins.py      # 三个插件产物
```

四行全绿再提 PR。任何一条变红，说明判定逻辑跟基准跑偏了——这通常不是「基准错了」，
而是真的改坏了：这个工具会把用户的图片移走，误判的代价是数据丢失。

## 环境要求

| 用途 | 需要 |
| --- | --- |
| 编译桌面版 | [zig](https://ziglang.org/)（当 C++ 编译器用，不用装 Visual Studio）。装在 `PATH` 里，或用环境变量 `ZIG` 指过去 |
| 打安装包 | [NSIS](https://nsis.sourceforge.io/) 3.x（默认路径安装即可，或用 `MAKENSIS` 指定） |
| 跑 JS 对拍 | Node.js 18+ |
| 构建脚本 | Python 3.9+（打图标时才需要 Pillow） |

## 代码规则

1. **判定逻辑只有两处真源**：`desktop/src/core.h`（C++）和 `shared/md-cleaner-core.js`（JS）。
   两边必须同语义，改了一边就要改另一边，并同步更新 `core/cases/` 基准。
2. **产物不要手改**：`obsidian-plugin/main.js`、`typora-plugin/mdImageCleaner.js`、
   `vscode-extension/extension.js` 都是 `tools/build_plugins.py` 生成的，改 `src/` 里的源文件。
3. **核心层不碰 IO**：`core.h` / `md-cleaner-core.js` 只吃字符串吐字符串，方便对拍。
   文件操作放调用层（`main.cpp` / 各插件入口）。
4. **UI 尺寸对齐原版**：桌面版的布局常量以原 PyQt5 版截图为基准（1200×750 @96 DPI），
   改间距请说明依据，别凭手感。
5. **C++ 侧不开异常、不用 RTTI**，只链系统 DLL（见 `desktop/build.py` 的 `LIBS`），
   体积门禁 600 KB 是硬指标，超了 CI 会红。
6. **插件侧兼容老运行时**：Typora 插件跑在 Chrome 84 / Node 12 上，不用 `?.` `??`。

## 提交信息

一行说清做了什么，需要时补正文说明「为什么」。参考已有历史：

```
feat: 插件支持 ![[wiki]] 形式的图片引用
fix: 清理后缩略图变灰块（先移文件后读图的竞态）
docs: 补齐双远端推送说明
```

## 报告问题

请带上：

- 系统版本、编辑器（Typora / Obsidian / VSCode）版本
- 笔记的资源夹结构（是否 `笔记.md` + `笔记.assets`）
- `--check --json` 的输出，或者插件里日志面板的内容
- **不要**贴真实笔记路径以外的隐私内容

## 许可

本项目采用 [MIT](LICENSE)。提交 PR 即表示你同意自己的贡献以同一协议发布，
并在文件头保留 `SPDX-License-Identifier: MIT` 标识。
