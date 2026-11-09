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
