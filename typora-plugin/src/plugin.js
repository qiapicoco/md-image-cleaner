/* =============================================================================
 * Typora 插件（obgnail/typora_plugin 的自定义插件形态）
 *
 * 由 tools/build_plugins.py 内联 md-cleaner-core.js 后产出
 * plugin/custom/plugins/mdImageCleaner.js，装法见 typora-plugin/README.md。
 *
 * 兼容性约束（typora_plugin 跑在 Chrome 84 / Node 12 上）：
 *   · 不用 ?. ?? 等新语法
 *   · 不用 flex 的 gap
 *   · 不用原生 button/select（会被主题改花），一律 div + class
 * ========================================================================== */
class mdImageCleaner extends BaseCustomPlugin {
    hint = () => "清理当前笔记的未引用图片";

    hotkey = () => ["ctrl+alt+m"];

    style = () => `
      .mdic-mask {
        position: fixed; left: 0; top: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, .38); z-index: 99999;
      }
      .mdic-win {
        position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
        width: 720px; max-width: 92vw; max-height: 84vh;
        background: #fff; border-radius: 8px; box-shadow: 0 12px 48px rgba(0,0,0,.3);
        font-family: "微软雅黑", "Microsoft YaHei", sans-serif; color: #333;
        display: flex; flex-direction: column; overflow: hidden;
      }
      .mdic-title {
        padding: 12px 16px; font-size: 15px; font-weight: 700;
        border-bottom: 1px solid #e9ecef; background: #f8f9fa;
      }
      .mdic-stat { padding: 8px 16px; font-size: 13px; color: #555; }
      .mdic-body { padding: 4px 12px 12px 12px; overflow-y: auto; background: #f0f0f0; }
      .mdic-card {
        display: inline-block; vertical-align: top; width: 150px; margin: 8px 6px;
        padding: 8px; background: #fff; border: 1px solid #ddd; border-radius: 8px;
        position: relative; text-align: center;
      }
      .mdic-card.mdic-used { opacity: .8; }
      .mdic-thumb { width: 134px; height: 134px; line-height: 134px; text-align: center; overflow: hidden; }
      .mdic-thumb img { max-width: 100%; max-height: 134px; vertical-align: middle; }
      .mdic-name { margin-top: 5px; font-size: 12px; word-break: break-all; line-height: 1.3; }
      .mdic-tag { margin-top: 3px; font-size: 13px; font-weight: 700; }
      .mdic-bad { color: #ff0000; }
      .mdic-ok { color: #008000; }
      .mdic-cb {
        position: absolute; top: 10px; right: 10px; width: 18px; height: 18px;
        border: 2px solid #00c6a7; border-radius: 4px; background: #fff; cursor: pointer;
      }
      .mdic-cb.mdic-on { background: #00c6a7; }
      .mdic-cb.mdic-on::after {
        content: ""; position: absolute; left: 5px; top: 1px; width: 4px; height: 9px;
        border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg);
      }
      .mdic-bar { padding: 10px 16px; border-top: 1px solid #e9ecef; text-align: right; }
      .mdic-count { float: left; font-size: 13px; color: #555; line-height: 30px; }
      .mdic-btn {
        display: inline-block; margin-left: 8px; padding: 6px 16px; border-radius: 4px;
        font-size: 13px; cursor: pointer; user-select: none;
      }
      .mdic-btn-primary { background: #00c6a7; color: #fff; }
      .mdic-btn-primary:hover { background: #00a38d; }
      .mdic-btn-plain { background: #e9ecef; color: #333; }
      .mdic-btn-disabled { opacity: .5; cursor: default; }
    `;

    callback = async (anchorNode) => {
        try {
            await this.run();
        } catch (e) {
            this.toast("MD Image Cleaner 出错：" + (e && e.message ? e.message : e), true);
            console.error(e);
        }
    };

    /* ---------------------------------------------------------------- 工具 */

    fs() {
        // typora_plugin 的插件文件是 node require 载入的，这里能拿到内置模块
        return require("fs");
    }

    pathMod() {
        return require("path");
    }

    /** 三层兜底拿当前文件绝对路径 */
    currentFilePath() {
        try {
            if (this.utils && typeof this.utils.getFilePath === "function") {
                var p1 = this.utils.getFilePath();
                if (p1) return p1;
            }
        } catch (e) { /* 继续往下试 */ }
        try {
            if (typeof File !== "undefined") {
                if (File.filePath) return File.filePath;
                if (File.bundle && File.bundle.filePath) return File.bundle.filePath;
            }
        } catch (e) { /* 继续 */ }
        return "";
    }

    toast(msg, isError) {
        try {
            if (this.utils && this.utils.notification && this.utils.notification.show) {
                this.utils.notification.show(msg);
                return;
            }
        } catch (e) { /* 退回 console */ }
        console.log("[MD Image Cleaner] " + msg);
        if (isError) alert(msg);
    }

    /* ---------------------------------------------------------------- 主流程 */

    async run() {
        const fs = this.fs();
        const path = this.pathMod();

        const mdPath = this.currentFilePath();
        if (!mdPath) {
            this.toast("先把这个笔记保存成文件，再用这个命令。", true);
            return;
        }
        if (!/\.(md|markdown)$/i.test(mdPath)) {
            this.toast("当前文件不是 Markdown。", true);
            return;
        }

        const assetsPath = MDCleanerCore.assetsDirFor(mdPath);
        let st = null;
        try { st = fs.statSync(assetsPath); } catch (e) { st = null; }
        if (!st || !st.isDirectory()) {
            this.toast("没找到同名资源夹：" + path.basename(assetsPath));
            return;
        }

        const files = fs.readdirSync(assetsPath, { withFileTypes: true })
            .filter(function (d) { return d.isFile(); })
            .map(function (d) { return d.name; })
            .filter(MDCleanerCore.isImageName);

        if (!files.length) {
            this.toast("资源夹里没有图片。");
            return;
        }

        const text = fs.readFileSync(mdPath, "utf8");
        const r = MDCleanerCore.analyze(text, files, { enhanced: true });
        this.showPanel(mdPath, assetsPath, r);
    }

    showPanel(mdPath, assetsPath, result) {
        const self = this;
        const path = this.pathMod();
        const fs = this.fs();
        const unused = result.unused;
        const used = result.used;
        const picked = {};

        const mask = document.createElement("div");
        mask.className = "mdic-mask";

        const win = document.createElement("div");
        win.className = "mdic-win";

        const title = document.createElement("div");
        title.className = "mdic-title";
        title.textContent = "MD Image Cleaner · " + path.basename(mdPath);
        win.appendChild(title);

        const stat = document.createElement("div");
        stat.className = "mdic-stat";
        stat.textContent = "图片统计：未引用 " + unused.length + " 张，已引用 " + used.length + " 张";
        win.appendChild(stat);

        const body = document.createElement("div");
        body.className = "mdic-body";

        const fileUrl = function (p) {
            var u = p.replace(/\\/g, "/");
            if (u.charAt(0) !== "/") u = "/" + u;
            return "file://" + encodeURI(u).replace(/#/g, "%23").replace(/\?/g, "%3F");
        };

        const addCard = function (name, isUnused) {
            const card = document.createElement("div");
            card.className = "mdic-card" + (isUnused ? "" : " mdic-used");

            const thumb = document.createElement("div");
            thumb.className = "mdic-thumb";
            const img = document.createElement("img");
            img.src = fileUrl(path.join(assetsPath, name));
            thumb.appendChild(img);
            card.appendChild(thumb);

            const nm = document.createElement("div");
            nm.className = "mdic-name";
            nm.textContent = name;
            card.appendChild(nm);

            const tag = document.createElement("div");
            tag.className = "mdic-tag " + (isUnused ? "mdic-bad" : "mdic-ok");
            tag.textContent = isUnused ? "未使用" : "已使用";
            card.appendChild(tag);

            if (isUnused) {
                picked[name] = true;
                const cb = document.createElement("div");
                cb.className = "mdic-cb mdic-on";
                cb.onclick = function () {
                    if (picked[name]) {
                        delete picked[name];
                        cb.className = "mdic-cb";
                    } else {
                        picked[name] = true;
                        cb.className = "mdic-cb mdic-on";
                    }
                    sync();
                };
                card.appendChild(cb);
            }
            body.appendChild(card);
        };

        unused.forEach(function (n) { addCard(n, true); });
        used.forEach(function (n) { addCard(n, false); });
        win.appendChild(body);

        const bar = document.createElement("div");
        bar.className = "mdic-bar";

        const countEl = document.createElement("div");
        countEl.className = "mdic-count";
        bar.appendChild(countEl);

        const btnCancel = document.createElement("div");
        btnCancel.className = "mdic-btn mdic-btn-plain";
        btnCancel.textContent = "取消";
        btnCancel.onclick = function () { document.body.removeChild(mask); };
        bar.appendChild(btnCancel);

        const btnGo = document.createElement("div");
        btnGo.className = "mdic-btn mdic-btn-primary";
        btnGo.onclick = function () {
            const names = Object.keys(picked);
            if (!names.length) return;
            btnGo.className = "mdic-btn mdic-btn-primary mdic-btn-disabled";
            btnGo.textContent = "正在移动…";
            try {
                const moved = self.moveFiles(fs, path, assetsPath, names, "deleted_images");
                self.toast("已移动 " + moved + " 张到 deleted_images");
                document.body.removeChild(mask);
            } catch (e) {
                btnGo.className = "mdic-btn mdic-btn-primary";
                btnGo.textContent = "重试";
                countEl.textContent = "失败：" + (e && e.message ? e.message : e);
            }
        };
        bar.appendChild(btnGo);
        win.appendChild(bar);

        function sync() {
            const n = Object.keys(picked).length;
            countEl.textContent = "已选 " + n + " / " + unused.length + " 张";
            btnGo.textContent = n ? "移动 " + n + " 张到 deleted_images" : "移动";
            btnGo.className = "mdic-btn mdic-btn-primary" + (n ? "" : " mdic-btn-disabled");
        }
        sync();

        mask.appendChild(win);
        mask.onclick = function (ev) {
            if (ev.target === mask) document.body.removeChild(mask);
        };
        document.body.appendChild(mask);
    }

    moveFiles(fs, path, assetsPath, names, delFolder) {
        const delDir = path.join(assetsPath, delFolder);
        if (!fs.existsSync(delDir)) fs.mkdirSync(delDir);
        const exists = function (n) {
            return fs.existsSync(path.join(delDir, n));
        };
        let moved = 0;
        for (let i = 0; i < names.length; i++) {
            const name = names[i];
            if (path.basename(name) !== name) continue;   // 防目录穿越
            const src = path.join(assetsPath, name);
            if (!fs.existsSync(src)) continue;
            const target = MDCleanerCore.uniqueName(name, exists);
            fs.renameSync(src, path.join(delDir, target));
            moved++;
        }
        return moved;
    }
}

module.exports = { plugin: mdImageCleaner };
