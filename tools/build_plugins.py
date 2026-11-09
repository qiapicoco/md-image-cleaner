# -*- coding: utf-8 -*-

# SPDX-License-Identifier: MIT
# Copyright (c) 2026 qiapicoco
# MD Image Cleaner - https://github.com/qiapicoco/typora-assets-image-cleaner

"""
把 shared/md-cleaner-core.js 内联进三个插件，产出可直接安装的成品。

用法：python tools/build_plugins.py

产物：
  obsidian-plugin/main.js        Obsidian 插件（main.js + manifest.json + styles.css 三个文件丢进插件目录）
  vscode-extension/extension.js  VSCode 扩展入口
  vscode-extension/md-image-cleaner-2.0.0.vsix   可直接「从 VSIX 安装」
  typora-plugin/mdImageCleaner.js                typora_plugin 的自定义插件

为什么要内联：Obsidian 插件只加载单个 main.js，VSCode 扩展虽然能 require 别的文件，
但 .vsix 里多一层相对路径容易在打包时踩坑；统一内联，三个产物都是"单文件可读、可审查"。
"""
import io
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CORE = os.path.join(ROOT, "shared", "md-cleaner-core.js")

MARK = "/* ==== shared/md-cleaner-core.js 内联开始（勿手改，改 shared/ 里的源文件） ==== */"

# 产物统一带版权头（MIT），方便别人单独拿走一个 main.js 也知道出处与许可
BANNER = """\
/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 qiapicoco
 * MD Image Cleaner - https://github.com/qiapicoco/typora-assets-image-cleaner
 *
 * 本文件由 tools/build_plugins.py 生成，请改 %s，不要手改产物。
 */
"""


def read(p):
    return io.open(p, encoding="utf-8").read()


def write(p, s):
    d = os.path.dirname(p)
    if d and not os.path.isdir(d):
        os.makedirs(d)
    io.open(p, "w", encoding="utf-8", newline="\n").write(s)


def core_source():
    src = read(CORE)
    if "module.exports = factory();" not in src:
        raise SystemExit("[错误] core 里找不到 UMD 尾巴，内联逻辑可能要更新")
    # UMD 在 CJS 环境里只写 module.exports、不写全局，所以这里补一个局部变量绑定，
    # 让插件的业务代码可以直接用 MDCleanerCore.xxx
    bind = (
        "\n/* ==== 内联结束 ==== */\n"
        "var MDCleanerCore = (typeof module === \"object\" && module.exports)\n"
        "    ? module.exports\n"
        "    : (typeof self !== \"undefined\" ? self.MDCleanerCore : this.MDCleanerCore);\n\n"
    )
    return MARK + "\n" + src + bind


def build_obsidian(core):
    src = read(os.path.join(ROOT, "obsidian-plugin", "src", "plugin.js"))
    out = os.path.join(ROOT, "obsidian-plugin", "main.js")
    write(out, BANNER % "obsidian-plugin/src/plugin.js" + core + src)
    return out


def build_vscode(core):
    src = read(os.path.join(ROOT, "vscode-extension", "src", "extension.js"))
    out = os.path.join(ROOT, "vscode-extension", "extension.js")
    write(out, BANNER % "vscode-extension/src/extension.js" + core + src)
    return out


def build_typora(core):
    src = read(os.path.join(ROOT, "typora-plugin", "src", "plugin.js"))
    out = os.path.join(ROOT, "typora-plugin", "mdImageCleaner.js")
    write(out, BANNER % "typora-plugin/src/plugin.js" + core + src)
    return out


def build_vsix():
    """手搓 .vsix：本质是个 zip，省掉 npm 依赖和联网。"""
    ext = os.path.join(ROOT, "vscode-extension")
    pkg = json.loads(read(os.path.join(ext, "package.json")))
    ver = pkg["version"]
    out = os.path.join(ext, "dist", "md-image-cleaner-%s.vsix" % ver)
    if not os.path.isdir(os.path.dirname(out)):
        os.makedirs(os.path.dirname(out))

    content_types = """<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension=".json" ContentType="application/json"/>
  <Default Extension=".js" ContentType="application/javascript"/>
  <Default Extension=".md" ContentType="text/markdown"/>
  <Default Extension=".png" ContentType="image/png"/>
  <Default Extension=".txt" ContentType="text/plain"/>
  <Default Extension=".vsixmanifest" ContentType="text/xml"/>
</Types>"""

    manifest = """<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"
                 xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="{id}" Version="{ver}" Publisher="{pub}"/>
    <DisplayName>{name}</DisplayName>
    <Description xml:space="preserve">{desc}</Description>
    <Tags>markdown,image,assets,clean</Tags>
    <Categories>Other</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <License>extension/LICENSE.txt</License>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="{engine}"/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value=""/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace"/>
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
  </Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
  </Assets>
</PackageManifest>
""".format(id=pkg["name"], ver=ver, pub=pkg["publisher"], name=pkg["displayName"],
           desc=pkg["description"].replace("&", "&amp;").replace("<", "&lt;"),
           engine=pkg["engines"]["vscode"])

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("extension.vsixmanifest", manifest)
        z.write(os.path.join(ext, "package.json"), "extension/package.json")
        z.write(os.path.join(ext, "extension.js"), "extension/extension.js")
        # 开源协议随包分发：直接把仓库根目录的 LICENSE 塞进 vsix
        license_src = os.path.join(ROOT, "LICENSE")
        if os.path.isfile(license_src):
            z.write(license_src, "extension/LICENSE.txt")
        for extra in ("README.md", "icon.png"):
            p = os.path.join(ext, extra)
            if os.path.isfile(p):
                z.write(p, "extension/" + extra)
    return out


def main():
    core = core_source()
    outs = [build_obsidian(core), build_vscode(core), build_typora(core)]

    print("[1/3] 语法检查 …")
    node = shutil.which("node")
    if node:
        for p in outs:
            r = subprocess.run([node, "--check", p], capture_output=True, text=True)
            if r.returncode != 0:
                print("[错误] 语法检查失败：%s\n%s" % (p, r.stderr))
                return 1
        print("      ok（%d 个文件）" % len(outs))
    else:
        print("      跳过（没装 node）")

    print("[2/3] 打包 .vsix …")
    vsix = build_vsix()
    outs.append(vsix)

    print("[3/3] 完成：")
    for p in outs:
        print("      %-46s %7.1f KB" % (os.path.relpath(p, ROOT), os.path.getsize(p) / 1024.0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
