/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 qiapicoco
 * MD Image Cleaner - https://github.com/qiapicoco/md-image-cleaner
 *
 * 本文件由 tools/build_plugins.py 生成，请改 obsidian-plugin/src/plugin.js，不要手改产物。
 */
/* ==== shared/md-cleaner-core.js 内联开始（勿手改，改 shared/ 里的源文件） ==== */
/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 qiapicoco
 * MD Image Cleaner - https://github.com/qiapicoco/md-image-cleaner
 */

/* =============================================================================
 * md-cleaner-core.js —— MD Image Cleaner 的纯逻辑核心（JS 版）
 *
 * 这份文件是三个插件（Obsidian / VSCode / Typora）的唯一逻辑来源：
 *   · 不做任何 IO，不碰 UI，只吃字符串、吐字符串
 *   · 由 tools/build_plugins.py 内联进各插件的产物里，不要直接改产物
 *
 * 两种判定模式：
 *   compat   —— 与桌面版（及原 PyQt5 版）逐字节一致：只认 ![..](..) 与 [..](..)
 *   enhanced —— 额外认 Obsidian 的 ![[xx.png]] 与 HTML 的 <img src="...">，
 *               避免把 wiki 嵌入 / HTML 引用的图片误判成"未引用"（插件默认用这个）
 * ========================================================================== */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.MDCleanerCore = factory();
    }
})(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    // 与桌面版 core.h 的 IsImageExt 完全一致：就这 8 种。
    // 没加 ico/tif —— 桌面版认不出它们，插件也保持一致，避免同一份笔记在不同形态下结果不同。
    var IMAGE_EXT = ["png", "jpg", "jpeg", "bmp", "svg", "tiff", "webp", "gif"];

    function extOf(name) {
        var i = name.lastIndexOf(".");
        return i < 0 ? "" : name.slice(i + 1).toLowerCase();
    }

    function isImageName(name) {
        return IMAGE_EXT.indexOf(extOf(name)) >= 0;
    }

    // 等价 os.path.basename / C++ BaseName：两种分隔符都认
    function baseName(p) {
        var i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
        return i < 0 ? p : p.slice(i + 1);
    }

    function dirName(p) {
        var i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
        return i < 0 ? "" : p.slice(0, i);
    }

    function stripExt(p) {
        var b = baseName(p);
        var i = b.lastIndexOf(".");
        return i <= 0 ? p : p.slice(0, p.length - (b.length - i));
    }

    // Markdown 路径 → 资源目录：笔记.md → 笔记.assets
    function assetsDirFor(mdPath) {
        return stripExt(mdPath) + ".assets";
    }

    /* -------------------------------------------------------------------------
     * 兼容模式：逐字节复刻桌面版 MatchPattern
     * 规则：从 prefix（"![" 或 "["）开始，同一行内找 "]" + "("，再取到下一个 ")"
     *       匹配成功后从 ")" 之后继续（所以 "[a](b)" 里的 "[" 不会重复命中）
     * ---------------------------------------------------------------------- */
    function matchPattern(s, prefix, out) {
        var n = s.length, plen = prefix.length, i = 0;
        while (i < n) {
            if (i + plen <= n && s.substr(i, plen) === prefix) {
                var matched = false;
                var j = i + plen;
                while (j < n && s[j] !== "\n") {
                    if (s[j] === "]" && j + 1 < n && s[j + 1] === "(") {
                        var capStart = j + 2, k = capStart;
                        while (k < n && s[k] !== ")" && s[k] !== "\n") k++;
                        if (k < n && s[k] === ")") {
                            out.push(s.slice(capStart, k));
                            i = k + 1;
                            matched = true;
                            break;
                        }
                    }
                    j++;
                }
                if (matched) continue;
            }
            i++;
        }
    }

    // 把一段链接目标清成"文件名"：
    //   <a.png>            → a.png
    //   a.png "标题"        → a.png
    //   ./sub/a%20b.png     → a b.png
    //   C:\x\a.png          → a.png
    function toFileName(target) {
        var t = String(target || "").trim();
        if (t.charAt(0) === "<") {
            var e = t.indexOf(">");
            if (e > 0) t = t.slice(1, e);
        }
        // 去掉 Markdown 的 title：a.png "标题" / a.png 'title'
        t = t.replace(/\s+["'(].*$/, "");
        if (t.indexOf("%") >= 0) {
            try { t = decodeURIComponent(t); } catch (err) { /* 保持原样 */ }
        }
        if (t.indexOf("?") >= 0) t = t.slice(0, t.indexOf("?"));
        if (t.indexOf("#") >= 0) t = t.slice(0, t.indexOf("#"));
        return baseName(t);
    }

    /* -------------------------------------------------------------------------
     * 增强模式追加的两种引用
     * ---------------------------------------------------------------------- */
    function matchWiki(s, out) {
        // ![[xx.png]] / ![[xx.png|300]] / ![[xx.png#anchor]]
        var re = /!\[\[([^\]\n]+)\]\]/g, m;
        while ((m = re.exec(s)) !== null) out.push(m[1]);
    }

    function matchHtmlImg(s, out) {
        var re = /<img\b[^>]*?\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi, m;
        while ((m = re.exec(s)) !== null) {
            out.push(m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]));
        }
    }

    /**
     * 从正文里抽出被引用的图片文件名列表（去重、保持首次出现顺序）
     * @param {string} text  Markdown 正文
     * @param {object} [opt] { enhanced: boolean }  默认 enhanced = false（兼容模式）
     * @returns {string[]}
     */
    function usedImageNames(text, opt) {
        var enhanced = !!(opt && opt.enhanced);
        var raw = [];
        matchPattern(text, "![", raw);
        matchPattern(text, "[", raw);
        if (enhanced) {
            matchWiki(text, raw);
            matchHtmlImg(text, raw);
        }
        var names = [];
        for (var i = 0; i < raw.length; i++) {
            var name = toFileName(raw[i]);
            if (!isImageName(name)) continue;
            if (names.indexOf(name) < 0) names.push(name);
        }
        return names;
    }

    /**
     * 比对：资源夹里的文件 vs 正文引用的文件名
     * 大小写不敏感（Windows 上 a.PNG 与 a.png 是同一个文件）
     * @returns {{used: string[], unused: string[]}}  均为资源夹里的原始文件名
     */
    function partition(allFiles, usedNames) {
        var usedLower = usedNames.map(function (n) { return n.toLowerCase(); });
        var used = [], unused = [];
        for (var i = 0; i < allFiles.length; i++) {
            var f = allFiles[i];
            if (usedLower.indexOf(f.toLowerCase()) >= 0) used.push(f);
            else unused.push(f);
        }
        return { used: used, unused: unused };
    }

    /**
     * 完整分析一步到位（纯函数，不碰磁盘）
     * @param {string} text       Markdown 正文
     * @param {string[]} files    资源夹里的文件名列表（调用方负责只传图片）
     * @param {object} [opt]      { enhanced }
     */
    function analyze(text, files, opt) {
        var images = files.filter(isImageName);
        var usedNames = usedImageNames(text, opt);
        var p = partition(images, usedNames);
        return {
            used: p.used,               // 资源夹里"被引用到了"的文件
            unused: p.unused,           // 资源夹里"没被引用"的文件 → 待移动
            usedNames: usedNames,       // 正文里抽出来的图片名（可能包含磁盘上并不存在的）
            referenced: usedNames.length, // 界面"已引用 N 张"用的就是它（与原版一致）
            total: images.length
        };
    }

    /**
     * 目标路径去重：deleted_images 里已有同名文件时，加 (1)(2) 后缀，
     * 绝不覆盖 —— 原版 Python 用 shutil.move 会直接盖掉，插件这边刻意更安全
     * @param {string} name      要移动的文件名
     * @param {function} exists  (candidateName) => boolean
     */
    function uniqueName(name, exists) {
        if (!exists(name)) return name;
        var i = name.lastIndexOf(".");
        var stem = i <= 0 ? name : name.slice(0, i);
        var ext = i <= 0 ? "" : name.slice(i);
        for (var n = 1; n < 10000; n++) {
            var cand = stem + "(" + n + ")" + ext;
            if (!exists(cand)) return cand;
        }
        return stem + "(" + Date.now() + ")" + ext;
    }

    return {
        IMAGE_EXT: IMAGE_EXT,
        isImageName: isImageName,
        baseName: baseName,
        dirName: dirName,
        stripExt: stripExt,
        assetsDirFor: assetsDirFor,
        toFileName: toFileName,
        usedImageNames: usedImageNames,
        partition: partition,
        analyze: analyze,
        uniqueName: uniqueName
    };
});

/* ==== 内联结束 ==== */
var MDCleanerCore = (typeof module === "object" && module.exports)
    ? module.exports
    : (typeof self !== "undefined" ? self.MDCleanerCore : this.MDCleanerCore);

/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 qiapicoco
 * MD Image Cleaner - https://github.com/qiapicoco/md-image-cleaner
 */

/* =============================================================================
 * Obsidian 插件主体（由 tools/build_plugins.py 内联 md-cleaner-core.js 后产出 main.js）
 * ========================================================================== */
const {
    Plugin,
    Modal,
    Notice,
    PluginSettingTab,
    Setting,
    TFile,
    TFolder,
    normalizePath
} = require("obsidian");

const DEFAULT_SETTINGS = {
    enhanced: true,              // 认 ![[wiki]] 与 <img src>（强烈建议开着）
    deletedFolder: "deleted_images",
    showUsed: true               // 预览里也列出"已使用"的图片
};

/* ------------------------------------------------------------------ 设置页 */
class MDCleanerSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "MD Image Cleaner" });

        new Setting(containerEl)
            .setName("识别 Obsidian / HTML 图片引用")
            .setDesc("开启后，![[图片.png]] 和 <img src=\"图片.png\"> 也算“已引用”，不会被误删。关掉则和桌面版兼容模式完全一致。")
            .addToggle((t) => t
                .setValue(this.plugin.settings.enhanced)
                .onChange(async (v) => {
                    this.plugin.settings.enhanced = v;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("备份文件夹名")
            .setDesc("未引用的图片会被移到这里（相对 .assets 文件夹）。默认 deleted_images。")
            .addText((t) => t
                .setPlaceholder("deleted_images")
                .setValue(this.plugin.settings.deletedFolder)
                .onChange(async (v) => {
                    this.plugin.settings.deletedFolder = v.trim() || "deleted_images";
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("预览里显示已使用的图片")
            .setDesc("关掉后只看未引用的那几张，卡片少一些。")
            .addToggle((t) => t
                .setValue(this.plugin.settings.showUsed)
                .onChange(async (v) => {
                    this.plugin.settings.showUsed = v;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl("p", {
            text: "只移动、不删除。移错了到 " + this.plugin.settings.deletedFolder + " 里把图片拖回去就行。",
            cls: "mdic-hint"
        });
    }
}

/* ------------------------------------------------------------------ 预览弹窗 */
class PreviewModal extends Modal {
    constructor(app, plugin, ctx) {
        super(app);
        this.plugin = plugin;
        this.ctx = ctx;              // { file, assetsPath, unused[], used[] }
        this.checked = new Set(ctx.unused);
    }

    onOpen() {
        const { contentEl, titleEl } = this;
        titleEl.setText("MD Image Cleaner");

        const c = this.ctx;
        const head = contentEl.createDiv({ cls: "mdic-head" });
        head.createEl("div", { text: c.file.path, cls: "mdic-path" });
        head.createEl("div", {
            text: `图片统计：未引用 ${c.unused.length} 张，已引用 ${c.used.length} 张`,
            cls: "mdic-stats"
        });

        if (!c.unused.length) {
            contentEl.createEl("p", { text: "这个资源夹里的图片都在用，没有可清理的。", cls: "mdic-empty" });
            const bar = contentEl.createDiv({ cls: "mdic-bar" });
            bar.createEl("button", { text: "关闭" }).onclick = () => this.close();
            return;
        }

        const list = contentEl.createDiv({ cls: "mdic-grid" });
        const renderCard = (name, isUnused) => {
            const card = list.createDiv({ cls: "mdic-card" + (isUnused ? "" : " mdic-card-used") });
            const box = card.createDiv({ cls: "mdic-box" });
            const img = box.createEl("img");
            img.src = this.app.vault.adapter.getResourcePath(c.assetsPath + "/" + name);
            img.loading = "lazy";
            card.createDiv({ text: name, cls: "mdic-name" });
            card.createDiv({
                text: isUnused ? "未使用" : "已使用",
                cls: "mdic-status " + (isUnused ? "mdic-bad" : "mdic-ok")
            });
            if (isUnused) {
                const cb = card.createEl("input", { type: "checkbox", cls: "mdic-cb" });
                cb.checked = this.checked.has(name);
                cb.onchange = () => {
                    if (cb.checked) this.checked.add(name);
                    else this.checked.delete(name);
                    this.syncBar();
                };
            }
        };

        c.unused.forEach((n) => renderCard(n, true));
        if (this.plugin.settings.showUsed) c.used.forEach((n) => renderCard(n, false));

        const bar = contentEl.createDiv({ cls: "mdic-bar" });
        this.barText = bar.createEl("span", { cls: "mdic-count" });
        const btnAll = bar.createEl("button", { text: "全选/全不选" });
        btnAll.onclick = () => {
            const boxes = list.querySelectorAll("input.mdic-cb");
            const allOn = this.checked.size === c.unused.length;
            this.checked.clear();
            if (!allOn) c.unused.forEach((n) => this.checked.add(n));
            boxes.forEach((b) => { b.checked = !allOn; });
            this.syncBar();
        };
        const btnCancel = bar.createEl("button", { text: "取消" });
        btnCancel.onclick = () => this.close();

        this.btnGo = bar.createEl("button", { text: "移动", cls: "mod-cta" });
        this.btnGo.onclick = () => this.doMove();

        this.syncBar();
    }

    syncBar() {
        const total = this.ctx.unused.length;
        const n = this.checked.size;
        this.barText.setText(`已选 ${n} / ${total} 张`);
        this.btnGo.setText(n ? `移动 ${n} 张到 ${this.plugin.settings.deletedFolder}` : "移动");
        this.btnGo.disabled = n === 0;
    }

    async doMove() {
        const names = Array.from(this.checked);
        if (!names.length) return;
        this.btnGo.disabled = true;
        this.btnGo.setText("正在移动…");
        try {
            const moved = await this.plugin.moveUnused(this.ctx, names);
            new Notice(`MD Image Cleaner：已移动 ${moved} 张到 ${this.plugin.settings.deletedFolder}`);
            this.close();
        } catch (e) {
            console.error(e);
            new Notice("MD Image Cleaner 移动失败：" + (e && e.message ? e.message : e));
            this.btnGo.disabled = false;
            this.btnGo.setText("重试");
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}

/* ------------------------------------------------------------------ 主体 */
class MDImageCleanerPlugin extends Plugin {
    async onload() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        this.addSettingTab(new MDCleanerSettingTab(this.app, this));

        this.addCommand({
            id: "preview-and-clean",
            name: "预览并清理当前笔记的未引用图片",
            checkCallback: (checking) => {
                const file = this.activeMd();
                if (!file) return false;
                if (!checking) this.run(file).catch((e) => {
                    console.error(e);
                    new Notice("MD Image Cleaner 出错：" + (e && e.message ? e.message : e));
                });
                return true;
            }
        });

        this.addCommand({
            id: "analyze-only",
            name: "只统计不移动",
            checkCallback: (checking) => {
                const file = this.activeMd();
                if (!file) return false;
                if (!checking) this.report(file).catch((e) => console.error(e));
                return true;
            }
        });

        // 右侧文件菜单里也放一条，不用记命令名
        this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
            if (!(file instanceof TFile) || file.extension !== "md") return;
            menu.addItem((item) => item
                .setTitle("清理未引用图片")
                .setIcon("image-minus")
                .onClick(() => this.run(file)));
        }));
    }

    onunload() { }

    activeMd() {
        const f = this.app.workspace.getActiveFile();
        return f && f.extension === "md" ? f : null;
    }

    async run(file) {
        const ctx = await this.collect(file);
        if (!ctx) return;
        new PreviewModal(this.app, this, ctx).open();
    }

    async report(file) {
        const ctx = await this.collect(file);
        if (!ctx) return;
        new Notice(`未引用 ${ctx.unused.length} 张，已引用 ${ctx.used.length} 张` +
            (ctx.unused.length ? "：" + ctx.unused.join("、") : ""));
    }

    /** 读正文 + 列资源夹 → 算出 {file, assetsPath, unused, used} */
    async collect(file) {
        const assetsPath = normalizePath(MDCleanerCore.assetsDirFor(file.path));
        const folder = this.app.vault.getAbstractFileByPath(assetsPath);
        if (!(folder instanceof TFolder)) {
            new Notice(`没找到同名资源夹：${assetsPath}\n（本插件只处理「笔记.md + 笔记.assets」结构）`);
            return null;
        }
        const files = folder.children
            .filter((c) => c instanceof TFile)
            .map((c) => c.name)
            .filter(MDCleanerCore.isImageName);
        if (!files.length) {
            new Notice("资源夹里没有图片。");
            return null;
        }
        const text = await this.app.vault.read(file);
        const r = MDCleanerCore.analyze(text, files, { enhanced: this.settings.enhanced });
        return { file, assetsPath, unused: r.unused, used: r.used };
    }

    /** 移动选中的图片到 deleted_images（存在同名则加 (1)(2)，绝不覆盖） */
    async moveUnused(ctx, names) {
        const vault = this.app.vault;
        const delPath = normalizePath(ctx.assetsPath + "/" + this.settings.deletedFolder);
        if (!vault.getAbstractFileByPath(delPath)) {
            await vault.createFolder(delPath);
        }
        const exists = (n) => !!vault.getAbstractFileByPath(normalizePath(delPath + "/" + n));
        let moved = 0;
        for (const name of names) {
            const src = vault.getAbstractFileByPath(normalizePath(ctx.assetsPath + "/" + name));
            if (!(src instanceof TFile)) continue;
            const target = MDCleanerCore.uniqueName(name, exists);
            await vault.rename(src, normalizePath(delPath + "/" + target));
            moved++;
        }
        return moved;
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

module.exports = MDImageCleanerPlugin;
