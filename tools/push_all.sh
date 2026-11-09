#!/bin/sh

# SPDX-License-Identifier: MIT
# Copyright (c) 2026 qiapicoco
# MD Image Cleaner - https://github.com/qiapicoco/md-image-cleaner

# 一次把 master 和附注 tag 推到 GitHub 与 Gitee。
# 凭据走 Windows 凭据管理器（git-credential-manager），首次配好后不再提示。
set -e
cd "$(dirname "$0")/.."

echo "==> GitHub"
git push origin master --follow-tags

echo "==> Gitee"
git push gitee master --follow-tags

echo "==> done"
