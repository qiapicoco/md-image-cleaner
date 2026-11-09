/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 qiapicoco
 * MD Image Cleaner - https://github.com/qiapicoco/typora-assets-image-cleaner
 */

/* eslint-disable */
/**
 * VSCode 扩展的"能跑"验证
 *
 * 用法：node tools/test_plugins.js
 *
 * VSCode 扩展在编辑器外 require 会因为没有 vscode 模块直接崩，
 * 这里用 Module._load 塞一个最小桩替身，然后真跑一遍：
 *   1. 模块能被加载（说明顶层代码没有用到运行时才有的东西）
 *   2. collect() 能读 md + 列资源夹、算出未引用
 *   3. moveFiles() 真的把文件移进 deleted_images，且重名不覆盖、防目录穿越
 */
const Module = require("module");
const fs = require("fs");
const os = require("os");
const path = require("path");

/* ---------------- vscode 桩 ---------------- */
const stub = {
    window: {
        activeTextEditor: null,
        showWarningMessage: () => Promise.resolve(),
        showInformationMessage: () => Promise.resolve(),
        createWebviewPanel: () => ({ webview: { asWebviewUri: (u) => u, onDidReceiveMessage: () => { }, cspSource: "", html: "" }, onDidDispose: () => { }, dispose: () => { } })
    },
    workspace: { getConfiguration: () => ({ get: (k, d) => d }) },
    commands: { registerCommand: () => ({ dispose() { } }) },
    Uri: { file: (p) => ({ fsPath: p, toString: () => "file:///" + p }) },
    ViewColumn: { Beside: 2 }
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === "vscode") return stub;
    return origLoad.apply(this, arguments);
};

const ext = require(path.join(__dirname, "..", "vscode-extension", "extension.js"));
const { moveFiles, collect, core } = ext.__test;

/* ---------------- 造一个临时笔记 ---------------- */
const ROOT = path.join(os.tmpdir(), "mdic_test_" + Date.now());
const ASSETS = path.join(ROOT, "note.assets");
fs.mkdirSync(ASSETS, { recursive: true });

function fakePng(name) {
    // 最小 1x1 PNG，够 fs 读、够 isImageName 认出
    const b = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64");
    fs.writeFileSync(path.join(ASSETS, name), b);
}
["used_a.png", "used_b.png", "dead_1.png", "dead_2.png"].forEach(fakePng);
fs.writeFileSync(path.join(ASSETS, "notes.txt"), "不是图片，应被忽略");

const md = path.join(ROOT, "note.md");
fs.writeFileSync(md, [
    "# 测试",
    "![](note.assets/used_a.png)",
    "[看图](note.assets/used_b.png)",
    "![[dead_1.png]]  <- wiki 语法，增强模式下算已引用",
    ""
].join("\n"), "utf8");

let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log("[ ok ] " + name); }
    else { fail++; console.log("[fail] " + name, extra === undefined ? "" : extra); }
}

(async () => {
    // 1) 兼容模式：wiki 引用的 dead_1 会被判成未引用（与桌面版一致）
    const r1 = core.analyze(fs.readFileSync(md, "utf8"),
        fs.readdirSync(ASSETS).filter(core.isImageName), { enhanced: false });
    check("compat: 未引用 = dead_1,dead_2",
        JSON.stringify(r1.unused.sort()) === JSON.stringify(["dead_1.png", "dead_2.png"]), r1.unused);

    // 2) 增强模式：只剩 dead_2
    const r2 = core.analyze(fs.readFileSync(md, "utf8"),
        fs.readdirSync(ASSETS).filter(core.isImageName), { enhanced: true });
    check("enhanced: 未引用 = dead_2",
        JSON.stringify(r2.unused) === JSON.stringify(["dead_2.png"]), r2.unused);

    // 3) collect() 走真实磁盘
    const ctx = await collect(md);
    check("collect: 找到 4 张图片", ctx && ctx.total === 4, ctx && ctx.total);
    // 配置桩返回默认值 true（增强模式开），所以 wiki 引用的 dead_1 算已引用
    check("collect: 未引用 1 张", ctx && ctx.unused.length === 1, ctx && ctx.unused);

    // 4) moveFiles 真移动
    const moved = await moveFiles(ctx, ctx.unused.slice(), "deleted_images");
    check("moveFiles: 移动 1 张", moved === 1, moved);
    const delDir = path.join(ASSETS, "deleted_images");
    check("moveFiles: 目标目录里就位",
        fs.existsSync(path.join(delDir, "dead_2.png")));

    // 5) 重名不覆盖：再造一个 dead_2.png 再移一次
    fakePng("dead_2.png");
    const ctx2 = await collect(md);
    await moveFiles(ctx2, ["dead_2.png"], "deleted_images");
    const names = fs.readdirSync(delDir).sort();
    check("moveFiles: 重名改成 dead_2(1).png，原文件还在",
        names.indexOf("dead_2.png") >= 0 && names.indexOf("dead_2(1).png") >= 0, names);

    // 6) 目录穿越防护
    fakePng("evil.png");
    const before = fs.readdirSync(ASSETS).length;
    await moveFiles({ assetsPath: ASSETS }, ["../evil.png"], "deleted_images");
    check("moveFiles: 拒绝 ../ 穿越", fs.readdirSync(ASSETS).length === before);

    // 清理
    fs.rmSync(ROOT, { recursive: true, force: true });

    console.log("-".repeat(46));
    console.log(`${pass}/${pass + fail} 通过`);
    process.exit(fail ? 1 : 0);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
