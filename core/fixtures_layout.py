# SPDX-License-Identifier: MIT
# Copyright (c) 2026 qiapicoco
# MD Image Cleaner - https://github.com/qiapicoco/md-image-cleaner

"""fixtures 里必须存在的空目录。

git 不跟踪空目录，别人 clone 下来这几个目录会消失，用例语义就变了：
`emptyassets` 会从「资源夹存在但为空」退化成「资源夹不存在」，
`weird` 会丢掉子目录场景。所以两个跑 fixture 的脚本（`check.py`、
`gen_cases.py`）在 copytree 之后都调 `ensure()` 补建一遍。

新增空目录 fixture 时，往 `EMPTY_DIRS` 里加一行即可。
"""

import os

EMPTY_DIRS = {
    "emptyassets": ["emptyassets.assets"],
    "weird": ["weird.assets/sub"],
}


def ensure(case, work):
    """在已复制好的 fixture 副本 `work` 里补建该用例的空目录。"""
    for rel in EMPTY_DIRS.get(case, []):
        os.makedirs(os.path.join(work, *rel.split("/")), exist_ok=True)
