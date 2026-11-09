/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 qiapicoco
 * MD Image Cleaner - https://github.com/qiapicoco/typora-assets-image-cleaner
 *
 * 本文件由 tools/build_plugins.py 生成，请改 vscode-extension/src/extension.js，不要手改产物。
 */
/* ==== shared/md-cleaner-core.js 内联开始（勿手改，改 shared/ 里的源文件） ==== */
/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 qiapicoco
 * MD Image Cleaner - https://github.com/qiapicoco/typora-assets-image-cleaner
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
 * MD Image Cleaner - https://github.com/qiapicoco/typora-assets-image-cleaner
 */

/* =============================================================================
 * VSCode 扩展主体（由 tools/build_plugins.py 内联 md-cleaner-core.js 后产出 extension.js）
 * ========================================================================== */
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

/** 取当前要处理的 .md 文件：优先活动编辑器，其次资源管理器里右键的那个 */
function pickFile(uri) {
    if (uri && uri.fsPath && uri.fsPath.toLowerCase().endsWith(".md")) return uri.fsPath;
    const ed = vscode.window.activeTextEditor;
    if (ed && ed.document.languageId === "markdown") return ed.document.uri.fsPath;
    return null;
}

/** 读正文 + 列资源夹，算出分析结果。失败返回 null（已弹提示） */
async function collect(mdPath) {
    const assetsPath = MDCleanerCore.assetsDirFor(mdPath);
    let stat = null;
    try { stat = await fs.promises.stat(assetsPath); } catch (e) { stat = null; }
    if (!stat || !stat.isDirectory()) {
        vscode.window.showWarningMessage(`没找到同名资源夹：${path.basename(assetsPath)}（只处理「笔记.md + 笔记.assets」结构）`);
        return null;
    }
    const entries = await fs.promises.readdir(assetsPath, { withFileTypes: true });
    const files = entries.filter((e) => e.isFile()).map((e) => e.name).filter(MDCleanerCore.isImageName);
    if (!files.length) {
        vscode.window.showInformationMessage("资源夹里没有图片。");
        return null;
    }
    const text = await fs.promises.readFile(mdPath, "utf8");
    const enhanced = vscode.workspace.getConfiguration("mdImageCleaner").get("enhanced", true);
    const r = MDCleanerCore.analyze(text, files, { enhanced });
    return { mdPath, assetsPath, unused: r.unused, used: r.used, total: r.total };
}

/** 只统计，不弹窗 */
async function checkOnly(uri) {
    const mdPath = pickFile(uri);
    if (!mdPath) {
        vscode.window.showWarningMessage("请先打开一个 Markdown 文件。");
        return;
    }
    const ctx = await collect(mdPath);
    if (!ctx) return;
    if (!ctx.unused.length) {
        vscode.window.showInformationMessage(`未引用 0 张，已引用 ${ctx.used.length} 张 —— 没有可清理的。`);
        return;
    }
    const pick = await vscode.window.showInformationMessage(
        `未引用 ${ctx.unused.length} 张，已引用 ${ctx.used.length} 张。要打开预览吗？`,
        "打开预览", "算了");
    if (pick === "打开预览") openPreview(ctx);
}

async function clean(uri) {
    const mdPath = pickFile(uri);
    if (!mdPath) {
        vscode.window.showWarningMessage("请先打开一个 Markdown 文件。");
        return;
    }
    const ctx = await collect(mdPath);
    if (ctx) openPreview(ctx);
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
}

/** 预览面板：缩略图网格 + 勾选 + 移动 */
function openPreview(ctx) {
    const panel = vscode.window.createWebviewPanel(
        "mdImageCleaner", "MD Image Cleaner", vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: false, localResourceRoots: [vscode.Uri.file(ctx.assetsPath)] }
    );

    const webRoot = panel.webview.asWebviewUri(vscode.Uri.file(ctx.assetsPath)).toString();
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const deletedFolder = vscode.workspace.getConfiguration("mdImageCleaner").get("deletedFolder", "deleted_images");
    const showUsed = vscode.workspace.getConfiguration("mdImageCleaner").get("showUsed", true);

    const card = (name, isUnused) => `
      <div class="card${isUnused ? "" : " used"}">
        <div class="box"><img src="${webRoot}/${encodeURIComponent(name)}" loading="lazy" /></div>
        <div class="name">${escapeHtml(name)}</div>
        <div class="status ${isUnused ? "bad" : "ok"}">${isUnused ? "未使用" : "已使用"}</div>
        ${isUnused ? `<input type="checkbox" class="cb" data-name="${escapeHtml(name)}" checked />` : ""}
      </div>`;

    panel.webview.html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${panel.webview.cspSource} data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; }
  .head { background: var(--vscode-textBlockQuote-background); padding: 10px 12px; border-radius: 6px; }
  .path { font-size: 13px; font-weight: 600; word-break: break-all; }
  .stats { margin-top: 4px; font-size: 13px; opacity: .85; }
  .grid { margin-top: 12px; max-height: 62vh; overflow-y: auto; background: var(--vscode-editorWidget-background); border-radius: 6px; text-align: center; }
  .card { display: inline-block; vertical-align: top; width: 176px; margin: 10px 8px; padding: 8px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border, #ddd); border-radius: 8px; position: relative; }
  .card.used { opacity: .8; }
  .box { height: 158px; line-height: 158px; text-align: center; overflow: hidden; }
  .box img { max-width: 100%; max-height: 158px; vertical-align: middle; }
  .name { margin-top: 6px; font-size: 12px; word-break: break-all; line-height: 1.35; }
  .status { margin-top: 4px; font-size: 13px; font-weight: 700; }
  .bad { color: #ff5252; } .ok { color: #4caf50; }
  .cb { position: absolute; top: 12px; right: 12px; width: 18px; height: 18px; }
  .bar { margin-top: 14px; display: flex; align-items: center; justify-content: flex-end; }
  .bar .count { margin-right: auto; font-size: 13px; opacity: .85; }
  button { margin-left: 8px; padding: 6px 14px; border: none; border-radius: 4px; cursor: pointer;
           background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button:disabled { opacity: .5; cursor: default; }
  .done { color: #4caf50; font-weight: 700; }
</style></head><body>
  <div class="head">
    <div class="path">${escapeHtml(ctx.mdPath)}</div>
    <div class="stats">图片统计：未引用 ${ctx.unused.length} 张，已引用 ${ctx.used.length} 张</div>
  </div>
  ${ctx.total === 0 ? '<p>资源夹里没有图片。</p>' : ""}
  <div class="grid">
    ${ctx.unused.map((n) => card(n, true)).join("")}
    ${showUsed ? ctx.used.map((n) => card(n, false)).join("") : ""}
  </div>
  <div class="bar">
    <span class="count" id="count"></span>
    <button class="secondary" id="cancel">关闭</button>
    <button id="go">移动</button>
  </div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const boxes = () => Array.from(document.querySelectorAll('input.cb'));
  const countEl = document.getElementById('count');
  const goBtn = document.getElementById('go');
  const total = ${ctx.unused.length};
  function sync() {
    const n = boxes().filter(b => b.checked).length;
    countEl.textContent = '已选 ' + n + ' / ' + total + ' 张';
    goBtn.textContent = n ? ('移动 ' + n + ' 张到 ${escapeHtml(deletedFolder)}') : '移动';
    goBtn.disabled = n === 0;
  }
  boxes().forEach(b => b.addEventListener('change', sync));
  document.getElementById('cancel').onclick = () => vscode.postMessage({ type: 'close' });
  goBtn.onclick = () => {
    goBtn.disabled = true;
    goBtn.textContent = '正在移动…';
    vscode.postMessage({ type: 'move', names: boxes().filter(b => b.checked).map(b => b.dataset.name) });
  };
  window.addEventListener('message', (ev) => {
    const m = ev.data;
    if (m.type === 'done') {
      countEl.innerHTML = '<span class="done">已移动 ' + m.moved + ' 张到 ${escapeHtml(deletedFolder)}</span>';
      goBtn.textContent = '完成';
      goBtn.disabled = true;
    } else if (m.type === 'error') {
      countEl.textContent = '失败：' + m.message;
      goBtn.textContent = '重试';
      goBtn.disabled = false;
    }
  });
  sync();
</script>
</body></html>`;

    panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "close") return panel.dispose();
      if (msg.type !== "move") return;
      try {
        const moved = await moveFiles(ctx, msg.names, deletedFolder);
        panel.webview.postMessage({ type: "done", moved });
        vscode.window.showInformationMessage(`MD Image Cleaner：已移动 ${moved} 张到 ${deletedFolder}`);
      } catch (e) {
        panel.webview.postMessage({ type: "error", message: String(e && e.message ? e.message : e) });
      }
    });
}

/** 移动文件：目标重名就加 (1)(2)，绝不覆盖 */
async function moveFiles(ctx, names, deletedFolder) {
    const delDir = path.join(ctx.assetsPath, deletedFolder);
    await fs.promises.mkdir(delDir, { recursive: true });
    const exists = (n) => fs.existsSync(path.join(delDir, n));
    let moved = 0;
    for (const name of names) {
        // 防目录穿越：只接受纯文件名
        if (path.basename(name) !== name) continue;
        const src = path.join(ctx.assetsPath, name);
        if (!fs.existsSync(src)) continue;
        const target = MDCleanerCore.uniqueName(name, exists);
        await fs.promises.rename(src, path.join(delDir, target));
        moved++;
    }
    return moved;
}

function activate(context) {
    context.subscriptions.push(
        vscode.commands.registerCommand("mdImageCleaner.clean", (uri) => clean(uri)),
        vscode.commands.registerCommand("mdImageCleaner.check", (uri) => checkOnly(uri))
    );
}

function deactivate() { }

// __test 只给 tools/test_plugins.js 用，VSCode 加载扩展时不看这个字段
module.exports = { activate, deactivate, __test: { moveFiles, collect, core: MDCleanerCore } };
