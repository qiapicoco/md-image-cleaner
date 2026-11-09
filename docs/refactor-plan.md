# 重构方案：从 PyQt5 到原生小体积 + 多编辑器插件形态

> 版本目标：v2.0.0（换实现、加形态，按三段式版本规则走主版本进位）
> 状态：**已完成**（2026-11-09 落地，验证结果见 §9 完成情况）
> 说明：本文是当时的决策记录，保留原文以便回看「为什么这么选」，部分预算数字与最终结果有出入，以 README 为准。

---

## 0. 结论速览

| 问题 | 结论 |
|---|---|
| 换语言能压到 1 MB 以内吗 | **能，而且有余量**。预计 exe **0.35–0.5 MB**，安装包 **0.3–0.45 MB** |
| 选什么语言 | **C++17 + 纯 Win32/GDI+ 自绘**，用 zig cc 静态链接（本机已有该工具链，且有成功先例） |
| 为什么不选 Rust/Tauri/Go | 它们要么自带运行时，要么要 WebView2，**下限就已经超过 1 MB**，目标直接判死 |
| 能 100% 不改变显示效果吗 | 布局、尺寸、颜色、字号、文案、交互可 1:1；**像素级无法保证绝对相同**（Qt 样式引擎 vs 自绘），用截图 diff 把偏差压到肉眼不可辨 |
| 插件优先能做到吗 | **Obsidian / VSCode 是原生插件**；**Typora 官方无插件 API**，改走 `obgnail/typora_plugin` 的**用户级插件目录**（框架由用户自装，不碰 Typora 本体） |
| 安装包怎么做 | 直接复用台账项目的 NSIS 模板：用户级安装、默认装非 C 盘、中文向导、卸载保留数据 |

### 已确认决策（2026-11-09）

| # | 决策项 | 结论 |
|---|---|---|
| 1 | 技术路线 | **C++17 + 纯 Win32/GDI+ 自绘**，zig cc 静态链接。体积优先，接受手绘 UI 的工作量 |
| 2 | 插件形态 | Obsidian + VSCode **同批做**（共用 `core.ts`）；Typora 额外发一个**注入式插件文件夹**，依赖用户已安装 `obgnail/typora_plugin` 框架 |
| 3 | 命名 | 英文 `MD Image Cleaner`／目录名 `MDImageCleaner`／中文名「Markdown 未引用图片清理」／发行者 `qiapicoco` |

**四种交付形态**：

| 形态 | 产物 | 体积 | 适用 |
|---|---|---|---|
| 绿色版 exe | `MDImageCleaner.exe` | 0.35–0.5 MB | Typora、任何本地 md |
| 安装包 | `MDImageCleaner_v2.0.0_安装版.exe` | 0.22–0.3 MB | 长期使用、要快捷方式和卸载入口 |
| Obsidian 插件 | `main.js` + `manifest.json` + `styles.css` | ≈40 KB | Obsidian 库内直接调用 |
| VSCode 扩展 | `.vsix` | ≈50 KB | VSCode 编辑器内调用 |
| Typora 注入插件 | 插件文件夹（`index.js` + `style.css`） | ≈15 KB | 已装 obgnail 框架的用户，零外部程序 |

---

## 1. 现状盘点

### 1.1 目录结构

```
typora-assets-image-cleaner/
├── typora_assets_cleaner.py     25.8 KB / 643 行   ← 全部实现（单文件）
├── typora_assets_cleaner.spec   PyInstaller 配置（onefile + upx）
├── icon.ico                     62.7 KB（单帧 256×256 32bpp BMP，未压缩）
├── Typora_清理未引用图片工具.exe  28.7 MB（28,096,922 B）
├── README.md / README.assets/   文档与截图
├── build/ dist/                 构建中间产物
└── .idea/                       PyCharm 工程
```

### 1.2 依赖

| 依赖 | 用途 | 打包影响 |
|---|---|---|
| PyQt5（QtWidgets / QtCore / QtGui） | 全部 UI、图片解码、样式表 | Qt5Core/Gui/Widgets + 平台插件 ≈ 25 MB |
| Python 3.x 解释器 | 运行时 | ≈ 4 MB（含 stdlib 子集） |
| shutil / os / re / time | 文件移动、正则、scandir | 标准库，可忽略 |

**体积成因**：PyInstaller onefile 把解释器 + Qt 三个 DLL + `qwindows.dll` 平台插件 + 微软雅黑回退逻辑全部塞进一个 exe，即使 `upx=True` 也只压到 28.7 MB。**体积与代码量几乎无关，90% 是运行时**——这正是换语言能砍掉 98% 的原因。

### 1.3 功能点清单（共 14 项）

| # | 功能 | 代码位置 |
|---|---|---|
| 1 | 选择 `.md` 文件（过滤器 `Markdown文件 (*.md)`） | `select_and_clean` |
| 2 | 推导 assets 目录 = md 同名 + `.assets` | `CleaningThread.__init__` |
| 3 | 正则提取引用（`![](...)` 与 `[](...)` 两种） | `find_used_images` |
| 4 | 扩展名白名单过滤（8 种） | 同上 |
| 5 | 扫描 assets 目录得到全部图片 | `get_all_images` |
| 6 | 差集得到未引用图片 | `run` |
| 7 | 后台线程执行，进度条 + 日志实时刷新 | `CleaningThread` 信号 |
| 8 | 未引用图片移动到 `assets/deleted_images/`（不删） | `run` |
| 9 | 图片预览网格（400×400 卡片 + 文件名 + 状态） | `ImagePreviewWidget` |
| 10 | 窗口缩放时网格列数自动重排 | `resizeEvent` |
| 11 | 双击预览图用系统程序打开 | `mouseDoubleClickEvent` |
| 12 | 「打开 .assets 文件夹」按钮 | `open_assets_folder` |
| 13 | 底部统计（未引用 N / 已引用 N） | `stats_signal` |
| 14 | 完成弹窗 + 状态栏提示 | `cleaning_finished` |

### 1.4 行为契约（重构后必须逐字一致）

**日志文案**（`QTextEdit.append`，注意每条自带 `\n`，append 会再加一个换行 → 实际两行间距）：

```
开始分析文件: {md 文件名}
警告: 在Markdown文件中未找到引用的图片
错误: 在 {assets 路径} 中未找到图片文件
在 {assets 路径} 中找到 {N} 张图片
其中 {N} 张图片未在Markdown中引用
没有需要清理的图片
开始清理未引用的图片...
创建备份文件夹: {deleted_images 路径}
已移动: {文件名} -> deleted_images
文件不存在: {文件名} (已被移动?)
错误: 无法移动 {文件名}: {异常文本}
（空行）清理完成！耗时: {x.xx} 秒
共移动 {N} 张未引用的图片到备份文件夹
致命错误: {异常文本}
错误: 文件 {md 路径} 未找到
错误: 读取文件时发生异常: {异常文本}
错误: 文件夹 {assets 路径} 不存在
错误: 扫描文件夹时发生异常: {异常文本}
```

**进度条节奏**（数值, 文案）：

```
(5, 准备分析...) → (15, 正在查找引用图片...) → (20, 正在分析图片引用...)
→ (25, 找到 N 张未引用的图片) → 预览阶段 25→40 (正在准备预览...) → (40, 预览准备完成)
→ (45, 准备清理...) → 清理阶段 50→95 (已清理 i/N) → (98, 正在整理结果...) → (100, 清理完成)
结束统一置 progress_text = 就绪
```

**界面文案**：

```
窗口标题         Typora清理未引用图片
左侧大标题       Typora未引用图片清理工具（微软雅黑 20pt Bold）
说明（超链接）   此工具可帮助您清理Typora Markdown文件对应的.assets文件夹中未被引用的图片
                → https://gitee.com/qiapicoco/typora-assets-image-cleaner
主按钮           选择Markdown文件并清理（14pt）
进度标签         进度: / 就绪
分组框           操作日志 / 图片预览（12pt Bold）
顶部按钮         打开.assets文件夹（禁用态直到 assets 存在）
路径标签         未选择文件 / 当前文件: {相对路径}
统计标签         图片统计: 未引用 0 张，已引用 0 张
预览状态         已使用（绿）/ 未使用（红）14px Bold
状态栏           正在分析: {文件名} / 清理完成，共处理 N 张图片 / 清理过程中发生错误
弹窗 1           [清理完成] 清理完成！\n共移动 N 张未引用图片到备份文件夹。
弹窗 2           [清理失败] 清理过程中发生错误，请查看日志获取详细信息。
弹窗 3           [错误] 无法打开图片: {异常}
弹窗 4           [文件不存在] 图片文件不存在: {路径}
```

**逻辑细节（易漏，必须保留）**：

1. 引用提取只取 `os.path.basename`，不解析相对路径上级目录。
2. 两条正则**都**会匹配，`[](...)` 会顺带匹配 `![](...)`，结果靠 `set` 去重。
3. `已引用` 的统计数 = **去重后的引用名个数**，不等于 assets 里真实存在的已引用文件数（引用不存在的图片也会被算进去）。
4. `deleted_images` 只在**第一次真的需要移动**时创建；已存在则复用，不清理旧内容。
5. 已引用图片若在 assets 中不存在，预览仍会生成卡片（图片区显示 400×400 灰块 `#c8c8c8`）。
6. 路径显示用相对**进程当前工作目录**的路径，跨盘 `ValueError` 时回落绝对路径。
7. 预览网格列数 = `max(1, (容器宽 - 30) // 420)`，间距 30/25，外边距 15。
8. 窗口 `setGeometry(300, 300, 1200, 750)`，分栏最终比例 **577 : 423**（代码里先设 382/618 又改 577/423，生效的是后者）。

**原版存在的一处不确定性**：`list(set(used_images))` 在 Python 3 里受哈希随机化影响，**每次运行「已使用」卡片的顺序都可能不同**。重构后改为「按 md 中出现顺序去重保序」——语义等价（集合相同），但预览顺序变稳定。这算唯一一处"行为变化"，属于修 bug，需确认接受。

---

## 2. 语言选型

### 2.1 候选对比

| 方案 | 体积（实测/估算） | < 1 MB | UI 还原度 | 自绘工作量 | 依赖风险 |
|---|---|---|---|---|---|
| **C++17 + 纯 Win32 + GDI+ 自绘** | **0.35–0.5 MB** | ✅ 富余 | 高（可控到像素） | 大（≈3000 行） | 无（全系统 DLL） |
| Rust + windows-sys + GDI+ 自绘 | 0.3–0.45 MB | ✅ | 高 | 大 | 需装 rustup |
| Rust + egui / eframe | 4–7 MB | ❌ | 中（字体渲染、控件风格不同） | 小 | 自带 wgpu |
| Tauri（WebView2） | 2.5–4 MB | ❌ | **最高**（HTML/CSS 可 1:1 复刻） | 最小 | 需 WebView2 运行时 |
| Go + walk | 4–6 MB | ❌ | 中 | 中 | Go 运行时 |
| C# WinForms + NativeAOT | 8–15 MB | ❌ | 中 | 中 | .NET 运行时 |
| 精简 PyQt5（剔 QtNetwork/QtQml 等） | 12–18 MB | ❌ | 完美（同一套代码） | 零 | 仍是 Qt |

### 2.2 推荐：C++17 + Win32/GDI+ 自绘（zig cc 静态链接）

**取舍理由**（按权重排序）：

1. **体积下限由它决定，别的方案达不到**。静态链 CRT + 只用 `user32/gdi32/gdiplus/shell32/comdlg32`，没有解释器、没有 GC、没有 WebView。要 ≤1 MB，这是唯一路线。
2. **本机已有现成工具链和成功先例**：`zig cc -target x86_64-windows-gnu -O2 -static --strip-all --subsystem,windows`，台账项目用它做出了 1.14 MB 的 exe（功能比本项目多得多：托盘常驻、多页 GUI、JSON 持久化、UIA 读屏）。本项目功能面小 80%，落在 0.4 MB 量级是合理预期。
3. **`gui_paint.h` / `taskbar.h` 的自绘原语可以直接搬**：圆角矩形、边框、文字排版、滚动区、按钮 hover、进度条、DPI 缩放宏 `S()` 已经写好并调过。这是省下最多时间的一点。
4. **图片解码零成本**：GDI+ 是系统 DLL，天生支持 png/jpg/jpeg/bmp/gif/tiff——正是白名单里的 7 种。只有 `.webp` 需要系统装过 WebP 扩展；解不出来时走**原版已有的灰块兜底逻辑**，行为一致、不崩。
5. Rust 同为 0.4 MB 量级且更安全，但要先装 rustup（≈1 GB）、且没有现成自绘代码可复用，**在"复用度"上输给 C++**。若后续想逐步迁移到 Rust，核心逻辑层是纯函数，迁移成本被架构隔离掉了。

**代价（必须提前接受）**：Qt 的 `QSS` 样式表在 Win32 里没有对应物，所有控件都要手绘 + 手动处理鼠标/键盘/焦点/滚动。这是本项目 70% 的工作量所在。

### 2.3 体积估算分解

| 组成 | 估算 | 说明 |
|---|---|---|
| 精简 CRT + 启动代码（`-nostartfiles` 不用，保留 mingw 启动） | 120 KB | `-fno-exceptions -fno-rtti` 已砍掉 libstdc++ 大半 |
| Win32/GDI/GDI+ 调用 + 自绘控件框架 | 150 KB | 按钮/分组框/进度条/滚动区/只读文本框/splitter |
| 业务逻辑（解析、扫描、差集、移动、日志） | 50 KB | 纯 C 风格字符串处理 |
| 中文字体度量与排版 | 30 KB | 微软雅黑，`CreateFontW` |
| 图标资源 | **12 KB**（优化后） | 现在 icon.ico 62.7 KB 是单帧未压缩 BMP；改成 PNG 压缩的 16/32/48/256 多帧后 ≈12 KB |
| 版本信息 / manifest | 3 KB | |
| **合计** | **≈ 365 KB** | |
| UPX（可选，`--lzma`） | **≈ 180–220 KB** | 台账 1.14 MB 未压 → 装了 UPX 后同量级可压到 40% |

**结论：即使不启用 UPX，也在 0.4 MB 左右；启用后 0.2 MB 量级。1 MB 目标有 2–5 倍富余。**

### 2.4 安装包体积

NSIS `SetCompressor /SOLID lzma` 对 0.4 MB 的 exe 压缩率约 55–60% → **安装包 0.22–0.3 MB**。
（台账实测：1.14 MB exe → 0.64 MB 安装包，含额外说明文件。）

---

## 3. 显示效果 1:1 怎么落地

### 3.1 度量基准

- 基准分辨率 **96 DPI**，窗口 **1200×750 @ (300,300)**。
- 所有像素值写进代码时用 `S(n) = MulDiv(n, dpi, 96)`，保证 125%/150% 缩放下等比放大（对应 Qt5 的高 DPI 自动缩放行为）。
- Qt 的 pt → px：`px = pt × 96 / 72`（四舍五入）。

### 3.2 字体映射表

| 用途 | Qt 设定 | px（GDI `lfHeight`） |
|---|---|---|
| 全局基准 | 微软雅黑 11pt | `-15` |
| 主标题 | 微软雅黑 20pt Bold | `-27` + `FW_BOLD` |
| 主按钮 | 微软雅黑 14pt | `-19` |
| 说明文字 / 进度 | 微软雅黑 12pt | `-16` |
| 日志正文 | 微软雅黑 13pt | `-17` |
| 统计标签 | 微软雅黑 13pt | `-17` |
| 文件名 | 微软雅黑 12pt | `-16` |
| 预览状态 | 14px Bold | `-14` + `FW_BOLD` |

字体名用 `微软雅黑`（`CreateFontW`），退化链：微软雅黑 → 思源黑体 → 宋体。

### 3.3 颜色 token（从 QSS 提取，一处不改）

| 元素 | 值 |
|---|---|
| 窗口背景 | `#FFFFFF` |
| 顶部信息栏 | `#E9ECEF`，圆角 8px，内边距 12px，下外边距 15px |
| 「打开.assets文件夹」按钮 | `#FF6B6B` / hover `#FF4E4E`，圆角 5px，灰字 `#FFFFFF` |
| 「选择Markdown文件并清理」 | `#00C6A7` / hover `#00A38D`，圆角 6px，高 50px，内边距 12×28 |
| 分组框边框 | `#DEE2E6`，圆角 6px，标题区左上 10px |
| 日志框 | 背景 `#F8F9FA`，边框 `#DEE2E6`，圆角 6px，内边距 12px |
| 进度条 | 边框 `#CED4DA`，圆角 4px，高 20px；chunk `#2196F3` |
| 预览卡片 | 白底，边框 `#DDDDDD` 2px，圆角 8px，内边距 5px，尺寸 400×400 |
| 已使用 / 未使用 | `green`(#008000) / `red`(#FF0000)，14px Bold |
| 统计栏 | 背景 `#F8F9FA`，圆角 6px，上外边距 15px，文字 `#555555` Bold |
| 兜底灰块 | `#C8C8C8` |
| 文字主色 | `#333333` |

### 3.4 自绘控件清单

| 控件 | 需要实现的行为 |
|---|---|
| 圆角按钮 | 3 态（常态/hover/禁用）、圆角、内边距、居中文字、手型光标 |
| 分组框 | 1px 边框 + 缺口标题 + 透明背景 |
| 进度条 | 外框 + chunk + 百分比文字（`setTextVisible(True)`） |
| 只读日志框 | 多行文字 + 自动滚到底 + 竖直滚动条 + 内边距 12 |
| 图片预览卡片 | 400×400 图片框 + 文件名（换行、最多 400 宽）+ 状态色字 + 双击回调 |
| 滚动容器 | 平滑滚轮、滚动条、子项网格布局、resize 重排 |
| 分栏器 | 左右拖拽，最小宽度约束，鼠标形状切换 |
| 统计栏 / 状态栏 | 静态文字条 |
| 消息框 | `MessageBoxW`（图标、按钮、中文标题与原版一致） |

### 3.5 验收手段

1. **截图 diff**：写一个脚本，在固定测试工程下跑原版和新版，各截 3 张（空态 / 分析完成态 / 弹窗态），逐像素比对，输出差异图和差异率。
2. **可接受阈值**：差异像素占比 < 2%，且差异**只允许**出现在：文字抗锯齿边缘、圆角描边、滚动条滑块。布局错位（>2px 的整体偏移）视为不合格。
3. **黄金用例**：5 组目录（正常 / 无引用 / 无 assets / 空目录 / 含中文与空格名），比对移动清单 + 日志全文 + 统计数字。

### 3.6 老实说：做不到绝对 100% 的地方

| 项 | 差异 | 处理 |
|---|---|---|
| 文字抗锯齿 | Qt 用 DirectWrite/GDI 灰度抗锯齿，GDI `DrawText` 略有不同 | 用 `ClearType` 关闭/开启两版对比取更接近者 |
| 圆角描边 | QSS 用 Qt 自己的抗锯齿，自绘用 GDI+ | 用 GDI+ `DrawPath` 抗锯齿，视觉一致 |
| 滚动条 | QSS 未定制 → 系统原生；Win32 同为系统原生 | 天然一致 |
| 高 DPI | Qt5 缩放策略 vs 自绘 `S()` | 96 DPI 完全一致，125% 下需实测微调 |
| 字体回退 | Qt 有 fallback 链，GDI 由系统负责 | 微软雅黑存在时无差异 |

**判断**：在 96 DPI（绝大多数用户）下可以做到"看不出差别"；像素级逐一相同做不到，也不值得为它多花一周。**验收标准建议定为「肉眼不可辨 + 布局零错位」**。

---

## 4. 新仓库结构

```
typora-assets-image-cleaner/
├── core/                          ← 语言无关的行为规格与测试向量（唯一真源）
│   ├── SPEC.md                    行为契约（即本文 §1.4，逐条编号）
│   ├── cases/                     5 组黄金用例（输入 md + 期望 JSON）
│   └── runner/                    对照脚本（跑任一实现，输出归一化 JSON）
├── desktop/                       ← 桌面版（体积优先）
│   ├── src/
│   │   ├── main.cpp               入口、窗口过程、布局、事件分发
│   │   ├── ui_paint.h             自绘原语（从台账 gui_paint.h 裁剪）
│   │   ├── ui_widgets.h           按钮/分组框/进度条/滚动区/卡片
│   │   ├── core_scan.h            纯函数：解析 + 扫描 + 差集
│   │   ├── core_move.h            纯函数：移动 + 日志生成
│   │   └── log_text.h             全部文案常量（一处集中，方便比对）
│   ├── res/
│   │   ├── app.ico                多帧 PNG 压缩（12 KB）
│   │   ├── app.rc / app.manifest  DPI 感知 + 版本信息
│   │   └── setup_header.bmp / setup_side.bmp
│   ├── build.py                   zig cc 一键构建 + **体积门禁 600 KB**
│   └── installer.nsi              NSIS 安装包（复用台账模板）
├── obsidian-plugin/               ← 插件形态 1
│   ├── manifest.json main.ts styles.css
│   ├── esbuild.config.mjs         → main.js（单文件，≈40 KB）
│   └── src/core.ts                与 C++ 同源的纯函数实现
├── vscode-extension/              ← 插件形态 2
│   ├── package.json extension.ts  → ≈50 KB
│   └── src/core.ts                复用 obsidian-plugin/src/core.ts
├── legacy/                        ← 原 PyQt5 版整包保留，作为回归 oracle
└── docs/
```

**关键设计：核心是纯函数**。签名固定为：

```
分析( md 文本, 目录快照 ) -> { 引用集合[], 全部图片[], 未引用[], 已引用[] }
执行( 未引用[], 目标目录 ) -> { 移动成功[], 失败[], 日志行[] }
```

不做 IO、不碰 UI。于是 C++ 版和 TS 版可以各写一遍（各约 250 行），用 `core/cases/` 同一套 JSON 校验，**保证两边输出逐字节一致**，且插件体积不被拖大。

---

## 5. 多编辑器适配

### 5.1 引用语法差异

| 编辑器 | 图片引用写法 | 存放位置 |
|---|---|---|
| Typora（默认） | `![](name.assets/x.png)`、`<img src="...">` | 同级 `md名.assets/` |
| Typora（自定义） | 同上 | 偏好设置里可改成 `./assets/` 或任意目录 |
| Obsidian | `![[x.png]]`（wiki）、`![](path/x.png)` | vault 内任意，由「附件默认位置」决定 |
| VSCode Markdown | `![](./img/x.png)` | 任意相对路径 |
| Logseq / Joplin | `![](../assets/x.png)` | 各自 assets 目录 |

原版只认 `![]()` 和 `[]()` 两种，**`![[x.png]]` 完全识别不到**——这意味着同一份 md 在 Obsidian 里用原版跑，会把所有图片都判成"未引用"并全部移走，**这是个会导致数据丢失的隐患**。

### 5.2 兼容模式 / 增强模式（双层策略）

| 模式 | 行为 | 用途 |
|---|---|---|
| **兼容模式**（默认，exe 启动即此态） | 与原版**逐字节一致**：只认两种 markdown 链接、只取 basename、只扫同级 `.assets` | 满足"不改变任何功能行为"，老用户零感知 |
| **增强模式**（需显式勾选） | 额外识别 `![[wiki]]`、`<img src>`、`<a href>`；支持自定义 assets 目录名；可选"只扫被引用目录" | 多编辑器通用，插件形态默认开启 |

安全兜底（两种模式都生效）：**只要检出 wiki 链接语法而当前是兼容模式，就直接中止并提示"这份文件用了 `[[]]` 语法，请切换增强模式"**，绝不误移。

### 5.3 各编辑器落地方式

| 编辑器 | 形态 | 说明 |
|---|---|---|
| Obsidian | **原生插件**（推荐主推） | 命令面板 + 文件右键菜单 + 侧边栏面板；走 `vault.adapter.rename` |
| VSCode | **原生扩展** | 命令面板 + 资源管理器右键；`workspace.fs.rename` |
| Typora | **独立 exe / 安装包** | 无插件 API，只能外部程序 |
| Logseq / Joplin | 后续可选 | 同为 JS 插件，可复用 TS core |
| 任意 | **CLI + 右键菜单** | `mdclean.exe --check file.md`，注册资源管理器右键「清理未引用图片」 |

Typora 的补充说明：官方无插件 API，但社区框架 `obgnail/typora_plugin` 提供了一个**用户级插件目录**（`~/.typora/plugin/`，以框架当版本文档为准）。框架本身由用户自行安装、并由用户承担"修改 Typora 程序文件"的责任；**我们只发布一个符合其插件规范的文件夹**，用户丢进去即可，不改 Typora 本体、不会随版本升级失效。细节见 §6.3。

---

## 6. 插件形态细节

### 6.1 Obsidian 插件（首选，2 天）

```
obsidian-plugin/
├── manifest.json      { id, name, version, minAppVersion, description, author, isDesktopOnly: true }
├── main.js            构建产物（单文件，无外部依赖）
└── styles.css         面板样式（沿用原版配色 token）
```

功能映射：

| 原版 | 插件内 |
|---|---|
| 选择 md 文件 | 当前活动文件（`app.workspace.getActiveFile()`） |
| 分析 + 预览网格 | 侧边栏 `ItemView` 面板，同卡片布局 |
| 进度条 | 面板顶部细进度条 |
| 操作日志 | 面板内滚动日志区 |
| 静态统计 | 面板底部统计行 |
| 移动文件 | `app.fileManager.renameFile` → 丢进 `.trash` 或 `assets/_deleted/` |

触发入口：命令 `清理当前笔记的未引用图片`、`仅检查不移动`；右键文件菜单；可选绑快捷键。
设置项：assets 目录名、是否启用 wiki 语法、是否直接进系统回收站、移动前二次确认。

安装方式：`<vault>/.obsidian/plugins/md-asset-cleaner/` 放 3 个文件 → 设置里启用。
分发：GitHub Release 提供 3 个文件；进阶可提 PR 进官方社区插件市场（需审核）。

### 6.2 VSCode 扩展（1 天）

`package.json` 声明 `commands` / `menus.explorer/context`，`extension.ts` 复用同一份 `core.ts`，打包 `.vsix` 约 50 KB。安装：`code --install-extension xxx.vsix` 或在市场发布。

### 6.3 Typora 注入式插件（依赖用户已装 obgnail/typora_plugin）

**定位**：这是"让 Typora 用户也能不离开编辑器"的补充分支，不是主路径。主路径仍是绿色 exe。

```
typora-plugin/
├── index.js        导出框架约定的钩子（html / style / init / process / hotkey）
├── style.css       面板样式（沿用原版配色 token）
└── README.md       一句话说明：需先安装 obgnail/typora_plugin
```

- **触发**：右键菜单加「清理未引用图片」、快捷键（默认不占用，用户自配）、仅检查模式。
- **文件操作**：该框架会为渲染进程恢复 node 能力（其文件管理类插件依赖此点），因此插件可直接用 `fs` 完成扫描与移动，**不需要调用外部 exe**，体积 ≈15 KB。
  *若目标框架版本收紧了权限，则降级为 `child_process` 调 `MDImageCleaner.exe --apply <md>` 的 CLI 模式——所以 P1 阶段顺手把核心逻辑暴露成 CLI 接口，两条路都留活口。*
- **安全边界**：与桌面版共用同一套纯函数核心（`core/cases/` 校验），移动目标仍是 `assets/deleted_images/`，不直接删文件。
- **分发**：压成 `md-asset-cleaner-typora.zip`，README 首行写明"需先安装 obgnail/typora_plugin"。框架升级若改插件接口，只需改 `index.js` 的适配层，核心不动。

---

## 7. 安装包与分发（照抄台账项目做法）

### 7.1 NSIS 模板参数

| 项 | 取值 | 来源 |
|---|---|---|
| 编译器 | NSIS 3.x Unicode（`Unicode true`） | 台账 `_toolchain/nsis` |
| 界面 | MUI2 + SimpChinese | 同上 |
| 权限 | `RequestExecutionLevel user`（**不弹 UAC**） | 同上 |
| 快捷方式范围 | `SetShellVarContext current`（仅当前用户） | 同上 |
| 默认安装目录 | 扫描 D–Z 找第一个**固定磁盘** → `X:\MDImageCleaner`；无则 `%LOCALAPPDATA%\Programs\MDImageCleaner` | `PickInstallDir` |
| 发行者 | `qiapicoco` | 用户指定 |
| 压缩 | `SetCompressor /SOLID lzma` + dict 32 | 同上 |
| 页序 | 欢迎 → 目录 → 安装 → 完成（可勾选立即运行 / 打开说明） | 同上 |
| 卸载 | 确认 → 卸载 → 完成；**默认保留数据**，`/S` 静默卸载一律保留 | 同上 |
| 外观 | 自定义 header/side 位图 + 图标 + 品牌行 | `make_setup_art.py` 可复用 |
| 安装前检查 | 用 `FindWindow` 认窗口类名，程序在跑就先请它退出 | `QuitIfRunning` |

**与原版的一个差异点**：本工具**不写任何数据到安装目录**（无配置、无历史），所以"数据保留"逻辑只需针对 `deleted_images/`（它在用户自己的 md 旁边，本来就不在安装目录里）。卸载可以更干脆。

### 7.2 产物与体积

| 产物 | 预计体积 |
|---|---|
| `MDImageCleaner.exe`（绿色单文件） | 0.35–0.5 MB（UPX 后 0.2–0.25 MB） |
| `MDImageCleaner_v2.0.0_安装版.exe` | 0.22–0.3 MB |
| `md-image-cleaner-obsidian.zip`（3 个文件） | 40 KB |
| `md-image-cleaner-2.0.0.vsix` | 50 KB |
| `md-image-cleaner-typora.zip`（注入插件） | 15 KB |

### 7.3 分发渠道

1. **Gitee / GitHub Release**：三个产物一起放，README 写明"Typora 用户下 exe，Obsidian 用户下 zip"。
2. **版本号**：exe 文件属性 + 关于窗口 + 安装包 `VIProductVersion` 四处一致（你定的规矩）。
3. **可选**：用 WorkBuddy 的发布页做落地页（`workbuddy.link/p/...` 那种在线页），上面挂下载按钮 + 使用说明 + 截图。**不替代安装包**，只做入口。

---

## 8. 执行步骤

| 阶段 | 内容 | 产物 | 验收 | 预计 |
|---|---|---|---|---|
| **P0 现状固化** | 原版整包移入 `legacy/`；抽取 §1.4 为 `core/SPEC.md`；用原版跑 5 组样本生成基准 JSON | 规格 + 5 组用例 | 用例可重复跑出同一结果 | 0.5 天 |
| **P1 核心逻辑** | C++ 纯函数：正则等价实现、扫描、差集、移动、日志文案 | `core_scan.h` `core_move.h` `log_text.h` | 5 组用例输出与基准 JSON 完全一致 | 1 天 |
| **P2 UI 自绘** | 窗口骨架 → 顶栏 → 左栏 → 预览网格 → 分栏器 → 滚动区 → 弹窗 → 状态栏；工作线程 + `PostMessage` | `main.cpp` `ui_*.h` | 手动走通全流程；缩放重排正常 | 3–4 天 |
| **P3 打包门禁** | `build.py`（zig cc）+ 图标重做 + UPX + **体积断言 ≤600 KB** | 绿色 exe | 双击即跑、无控制台窗口 | 0.5 天 |
| **P4 安装包** | 复用台账 `installer.nsi`，改名称/图标/位图 | setup.exe | 装/升/卸全流程过一遍 | 0.5 天 |
| **P5 截图对拍** | 截图脚本 + diff 报告，逐项调偏移 | 差异报告 | 差异率 <2%，无布局错位 | 0.5–1 天 |
| **P6 插件 ①** | TS 纯函数核心 + Obsidian 插件（面板/命令/右键菜单） | `main.js` | 与 C++ 版同一套用例输出一致 | 2 天 |
| **P7 插件 ②③** | VSCode 扩展 + Typora 注入插件（共用 `core.ts`） | `.vsix` / 插件 zip | 同上 | 1.5 天 |

**总计约 10–12 个工作日**。P0–P4 是"体积目标"闭环（约 6 天），P5 是对齐验收，P6–P7 是形态扩展。

### 里程碑建议

- **M1（第 5 天）**：绿色 exe 能跑通全流程，体积 <0.5 MB —— 这时就能坐实"1 MB 内"。
- **M2（第 6 天）**：安装包可装可卸，控制面板可见。
- **M3（第 9 天）**：Obsidian 插件装进真实库可用。
- **M4（第 10.5 天）**：VSCode 扩展 + Typora 注入插件可用。
- **M5（第 12 天）**：截图 diff 通过，正式发 v2.0.0。

---

## 9. 风险与回退

| 风险 | 影响 | 应对 |
|---|---|---|
| 自绘 UI 与 Qt 有肉眼可见差异 | 不满足"显示效果一致" | P5 对拍 + 预留 1 天修偏移；极端情况降到 Tauri（放弃 1 MB） |
| 微软雅黑缺失/被替换 | 文字错位 | 字体回退链 + 按实际 `GetTextExtent` 动态排版，不硬编码宽度 |
| GDI+ 解不出 webp | 该图显示灰块 | 与原版兜底一致；可选加 `libwebp`（+150 KB） |
| 增强模式误判导致移走真图片 | **数据丢失** | 一律移到 `deleted_images/` 不删；移动前二次确认；兼容模式下遇 `[[]]` 直接中止 |
| 杀软误报（无签名 exe） | 用户不敢用 | 体积小反而误报少；发布页说明；可选后续签名 |
| 1 MB 目标最终没达到 | 目标落空 | 已有 2–5 倍富余，几乎不可能；真超了就上 UPX |

**回退方案**：`legacy/` 保留原版全量代码与 exe，任何阶段都能退回 PyQt5 版继续发版。

---

## 10. 决策状态

**已确认**：技术路线（C++/Win32 自绘）、插件形态与顺序（三个插件同批）、命名（MD Image Cleaner / `MDImageCleaner` / qiapicoco）。

开工前只剩两个小项，**默认按推荐执行**，要改直接说：

| 项 | 默认做法 | 影响 |
|---|---|---|
| 功能范围 | 严格兼容为默认，**增强模式做成开关、默认关闭** | 关闭时与原版逐字节一致；打开才识别 `[[]]` / `<img>` / 自定义目录 |
| 预览排序 | 「已使用」卡片改为**按 md 中出现顺序**去重保序 | 原版受 Python 哈希随机化影响，每次顺序都可能不同；改后稳定，集合内容完全不变 |


---

## 9. 完成情况（2026-11-09 落地）

| 阶段 | 内容 | 结果 |
|---|---|---|
| P0 | 基准固化 | `core/gen_cases.py` 用原版源码（打桩 PyQt5）产出 6 组基准 JSON |
| P1 | 核心移植 | `desktop/src/core.h` 纯函数核心；`core/check.py` 对拍 **6/6 逐字段一致** |
| P2 | UI 自绘 | `paint.h` / `preview.h` / `main.cpp`，双缓冲 + 自研断行 + DPI 感知 |
| P3 | 打包 | exe **301 KB**（目标 ≤600 KB，原版 28.7 MB），`desktop/build.py` 带体积门禁 |
| P4 | 安装包 | NSIS 3.x + MUI2，**247 KB**，用户级安装、默认非 C 盘、静默 `/S /D=` 可用 |
| P5 | 像素对拍 | 空态差异 **0.50%**，填充态缩略图区除外全部对齐（剩字体抗锯齿相位差） |
| P6 | Obsidian 插件 | `obsidian-plugin/main.js` 20 KB，含预览弹窗、设置页、右键菜单 |
| P7 | VSCode + Typora | `.vsix` 18 KB（含图标与 LICENSE）；Typora 自定义插件 20.8 KB（配合 obgnail/typora_plugin） |

### 实测体积

| 产物 | 体积 |
|---|---|
| `MDImageCleaner.exe` | 301.0 KB |
| `MDImageCleaner_v2.0.0_安装版.exe` | 247 KB |
| `obsidian-plugin/main.js` | 20.2 KB |
| `md-image-cleaner-2.0.0.vsix` | 17.6 KB |
| `typora-plugin/mdImageCleaner.js` | 20.8 KB |

### 与原版的差异（有意为之）

1. **修掉原版竞态**：原版先移文件再读缩略图，导致「未引用」的预览基本全是灰块。
   新版用 `FlushPreview()` 让 UI 先把图读进内存再动文件。
2. **数据安全**：原版认不出 `![[wiki]]` 和 `<img src>`，Obsidian 笔记会被整批误移。
   桌面版为保持「行为完全不变」仍是兼容模式；三个插件默认开启增强模式。
3. **插件不覆盖已有备份**：原版 `shutil.move` 会覆盖同名文件，插件改成加 `(1)(2)` 后缀。

### 未做 / 待办

- 安装包未做代码签名（无证书）
- Typora 插件只做 obgnail/typora_plugin 的自定义插件形态，未做 Typora 本体注入
- 像素对拍未做「弹窗态」一组（模态框由系统绘制，无对拍价值）
