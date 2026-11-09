/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 qiapicoco
 * MD Image Cleaner - https://github.com/qiapicoco/typora-assets-image-cleaner
 */

// 核心自测程序：把 CLI 逻辑编成控制台版，供 core/check.py 调用
#include <windows.h>
#include <shellapi.h>
#include "../src/cli.h"

int main() {
    int argc = 0;
    LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    int r = mdclean::CliMain(argc, argv);
    LocalFree(argv);
    return r < 0 ? 0 : r;
}
