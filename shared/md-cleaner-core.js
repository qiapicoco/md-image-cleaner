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
