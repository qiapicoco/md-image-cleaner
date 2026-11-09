/* 由 tools/build_plugins.py 生成，请改 src/plugin.js */
/* ==== shared/md-cleaner-core.js 内联开始（勿手改，改 shared/ 里的源文件） ==== */
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
