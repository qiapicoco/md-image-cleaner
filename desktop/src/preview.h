/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 qiapicoco
 * MD Image Cleaner - https://github.com/qiapicoco/typora-assets-image-cleaner
 */

// preview.h —— 图片缩略图（GDI+ 解码，系统组件，零额外体积）
#pragma once

#include <windows.h>
#include <gdiplus.h>
#include <string>

namespace ui {

struct Card {
    std::wstring name;      // 文件名（显示用）
    std::wstring path;
    bool used = false;
    Gdiplus::Bitmap* bmp = nullptr;
    int w = 0, h = 0;
    int nameH = 22;         // 文件名换行后的高度（缓存，避免每帧测量）
    std::vector<std::wstring> nameLines;  // 已断好行的文件名
    // 命中区（客户区坐标）
    RECT boxRc{0, 0, 0, 0};
};

// 解码并按 keep-aspect 缩放到不超过 maxW×maxH（与原版 QPixmap::scaled 一致：
// 小图也会被放大到贴合尺寸）
inline bool LoadThumb(const std::wstring& path, int maxW, int maxH,
                      Gdiplus::Bitmap** out, int* ow, int* oh) {
    *out = nullptr;
    *ow = *oh = 0;
    Gdiplus::Bitmap* src = Gdiplus::Bitmap::FromFile(path.c_str());
    if (!src) return false;
    if (src->GetLastStatus() != Gdiplus::Ok) { delete src; return false; }
    int sw = (int)src->GetWidth(), sh = (int)src->GetHeight();
    if (sw <= 0 || sh <= 0) { delete src; return false; }

    double s = (double)maxW / (double)sw;
    double s2 = (double)maxH / (double)sh;
    if (s2 < s) s = s2;
    int nw = (int)(sw * s + 0.5);
    int nh = (int)(sh * s + 0.5);
    if (nw < 1) nw = 1;
    if (nh < 1) nh = 1;

    Gdiplus::Bitmap* dst = new Gdiplus::Bitmap(nw, nh, PixelFormat32bppPARGB);
    if (!dst || dst->GetLastStatus() != Gdiplus::Ok) {
        delete dst;
        *out = src;          // 退化：直接用原图
        *ow = sw; *oh = sh;
        return true;
    }
    {
        Gdiplus::Graphics g(dst);
        g.SetInterpolationMode(Gdiplus::InterpolationModeHighQualityBicubic);
        g.SetPixelOffsetMode(Gdiplus::PixelOffsetModeHighQuality);
        g.DrawImage(src, 0, 0, nw, nh);
    }
    delete src;
    *out = dst;
    *ow = nw;
    *oh = nh;
    return true;
}

inline void DrawThumb(HDC dc, Gdiplus::Bitmap* b, int x, int y) {
    if (!b) return;
    Gdiplus::Graphics g(dc);
    g.SetInterpolationMode(Gdiplus::InterpolationModeHighQualityBicubic);
    g.DrawImage(b, x, y, (int)b->GetWidth(), (int)b->GetHeight());
}

inline void FreeCards(std::vector<Card>& cards) {
    for (auto& c : cards) {
        if (c.bmp) { delete c.bmp; c.bmp = nullptr; }
    }
    cards.clear();
}

}  // namespace ui
