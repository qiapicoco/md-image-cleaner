/* eslint-disable */
/**
 * JS 核心 vs Python 版黄金用例 对拍
 *
 * 用法：node shared/test_core.js
 * 读 core/cases/*.json（由 core/gen_cases.py 用原版 Python 逻辑产出），
 * 对每个用例用兼容模式算一遍，与基准里的 previews（name, used）逐项比对。
 */
const fs = require("fs");
const path = require("path");
const core = require("./md-cleaner-core.js");

const ROOT = path.dirname(__dirname);
const CASES = path.join(ROOT, "core", "cases");
const FIX = path.join(ROOT, "core", "fixtures");

function listDir(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => e.name);
}

let pass = 0, fail = 0;
for (const file of fs.readdirSync(CASES).filter((f) => f.endsWith(".json"))) {
    const c = JSON.parse(fs.readFileSync(path.join(CASES, file), "utf8"));
    const mdPath = path.join(FIX, c.case, c.md);
    const assetsPath = path.join(FIX, c.case, c.assets);

    const text = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, "utf8") : "";
    const files = listDir(assetsPath);
    const got = core.analyze(text, files, { enhanced: false });

    // 基准：previews 里 used=false 的属于未引用。
    // 注意 previews 还包含"正文引用了但磁盘上不存在"的图片（used=true），
    // 这里只能拿磁盘上真实存在的文件来比。
    const onDisk = files.filter(core.isImageName);
    const expUnused = c.previews.filter((p) => !p[1]).map((p) => p[0])
        .filter((n) => onDisk.indexOf(n) >= 0).sort();
    const expUsed = c.previews.filter((p) => p[1]).map((p) => p[0])
        .filter((n) => onDisk.indexOf(n) >= 0).sort();
    const gotUnused = got.unused.slice().sort();
    const gotUsed = got.used.slice().sort();

    const okU = JSON.stringify(expUnused) === JSON.stringify(gotUnused);
    const okD = JSON.stringify(expUsed) === JSON.stringify(gotUsed);
    // stats = [未引用(实移动数), 已引用(正文里抽到的图片名个数)]
    const okS = c.stats[0] === got.unused.length && c.stats[1] === got.referenced;

    if (okU && okD && okS) {
        pass++;
        console.log(`[ ok ] ${c.case}`);
    } else {
        fail++;
        console.log(`[fail] ${c.case}`);
        if (!okU) console.log("   未引用 期望", expUnused, "实得", gotUnused);
        if (!okD) console.log("   已引用 期望", expUsed, "实得", gotUsed);
        if (!okS) console.log("   统计   期望", c.stats, "实得", [got.unused.length, got.referenced]);
    }
}

// 增强模式自检：wiki / html 引用的图片不应被判为未引用
const enhText = "![[wiki.png]]\n<img src=\"photo.jpg\">\n![](normal.png)\n";
const enhUsed = core.usedImageNames(enhText, { enhanced: true });
const cmpUsed = core.usedImageNames(enhText, { enhanced: false });
const enhOK = ["wiki.png", "photo.jpg", "normal.png"].every((n) => enhUsed.indexOf(n) >= 0);
const cmpOK = cmpUsed.length === 1 && cmpUsed[0] === "normal.png";
if (enhOK && cmpOK) {
    pass++;
    console.log("[ ok ] enhanced-mode");
} else {
    fail++;
    console.log("[fail] enhanced-mode", { enhUsed, cmpUsed });
}

console.log("-".repeat(46));
console.log(`${pass}/${pass + fail} 通过`);
process.exit(fail ? 1 : 0);
