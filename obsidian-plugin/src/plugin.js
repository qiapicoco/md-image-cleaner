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
