# MD Image Cleaner · Typora 插件

跑在 [obgnail/typora_plugin](https://github.com/obgnail/typora_plugin) 上的自定义插件：
在 Typora 里直接预览并清理当前笔记的未引用图片，不用切到桌面程序。

> 为什么依赖 typora_plugin：Typora 官方没有插件机制。typora_plugin 通过注入 `window.html`
> 拿到 Node 能力，是目前事实上的标准做法。**它不在 Typora 安装目录里改任何东西**，
> Typora 升级也不会被覆盖，卸载就是删掉注入的那几行。

## 安装（3 步）

### 1. 装 typora_plugin

按它的 README 操作，把 `plugin/` 目录放进 Typora 的 `resources` 目录（或按它推荐的方式注入）。

### 2. 放插件文件

把本目录的 **`mdImageCleaner.js`** 拷到：

```
<Typora安装目录>/resources/plugin/custom/plugins/mdImageCleaner.js
```

### 3. 打开开关

编辑 `plugin/global/settings/custom_plugin.user.toml`（没有就新建），在末尾追加：

```toml
[mdImageCleaner]
name = "MD Image Cleaner"
enable = true
hide = false
order = 90
hotkey_string = "ctrl+alt+m"
show_message = "清理当前笔记的未引用图片"
```

保存后重启 Typora（或让它热重载插件）。

## 用法

- 快捷键 `Ctrl+Alt+M`
- 或者正文里右键 → 常用插件 → **MD Image Cleaner**

弹出一个面板：未使用的图片默认全勾，点「移动 N 张到 deleted_images」执行。
点遮罩空白处或「取消」关闭。

**前提**：笔记要先存盘（没存盘拿不到文件路径，会提示你）。

## 它做了什么

1. 取当前 `.md` 的绝对路径 → 推出同名 `xxx.assets` 文件夹
2. 读正文，抽出所有被引用的图片名：
   - `![](xxx.assets/a.png)`、`[图](xxx.assets/a.png)`
   - `![[a.png]]`（wiki 嵌入）
   - `<img src="xxx.assets/a.png">`（HTML 标签）
3. 资源夹里存在、但没被引用的图片 → 列为「未使用」
4. 你确认后 `fs.renameSync` 到 `xxx.assets/deleted_images/`

**只移动不删除**，重名自动加 `(1)(2)`，绝不覆盖。

## 兼容性

- 目标运行时是 typora_plugin 里的 Chrome 84 / Node 12：代码没用 `?.` `??` 之类的新语法
- UI 全部用 `div` + class，不用原生 `button`/`select`（避免被主题改花）
- 图片用 `file://` 直接加载，不走网络

## 如果提示「拿不到文件路径」

不同版本的 typora_plugin 暴露当前文件路径的方式略有差异，插件按这个顺序尝试：

1. `this.utils.getFilePath()`
2. `File.filePath`
3. `File.bundle.filePath`

三个都拿不到就会提示。此时把 `src/plugin.js` 里的 `currentFilePath()`
改成本机版本的取法即可（提 issue 也行，我按你的版本适配）。

## 从源码构建

```bash
python tools/build_plugins.py     # 在项目根目录执行
```

产物 `typora-plugin/mdImageCleaner.js` = `shared/md-cleaner-core.js` + `typora-plugin/src/plugin.js`。
