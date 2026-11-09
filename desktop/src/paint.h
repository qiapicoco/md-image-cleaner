// paint.h —— GDI/GDI+ 自绘原语（无第三方依赖，只用系统 DLL）
#pragma once

#include <windows.h>
#include <gdiplus.h>
#include <string>
#include <vector>

namespace ui {

// ---------------------------------------------------------------- 颜色（与原版 QSS 逐值对应）
const COLORREF kWhite      = RGB(255, 255, 255);
const COLORREF kText       = RGB(0x33, 0x33, 0x33);
const COLORREF kBlack      = RGB(0, 0, 0);
const COLORREF kTopBarBg   = RGB(0xE9, 0xEC, 0xEF);  // 顶部信息栏
const COLORREF kBtnRed     = RGB(0xFF, 0x6B, 0x6B);  // 打开.assets文件夹
const COLORREF kBtnRedHot  = RGB(0xFF, 0x4E, 0x4E);
const COLORREF kBtnTeal    = RGB(0x00, 0xC6, 0xA7);  // 选择Markdown文件并清理
const COLORREF kBtnTealHot = RGB(0x00, 0xA3, 0x8D);
const COLORREF kGroupBd    = RGB(0xDE, 0xE2, 0xE6);  // 分组框 / 日志框边框
const COLORREF kLogBg      = RGB(0xF8, 0xF9, 0xFA);  // 日志底色 / 统计栏
const COLORREF kProgBorder = RGB(0xCE, 0xD4, 0xDA);  // 进度条边框
const COLORREF kProgChunk  = RGB(0x21, 0x96, 0xF3);
const COLORREF kCardBd     = RGB(0xDD, 0xDD, 0xDD);
const COLORREF kPrevBg     = RGB(0xF0, 0xF0, 0xF0);  // 预览区底色
const COLORREF kFallback   = RGB(0xC8, 0xC8, 0xC8);  // 解码失败兜底灰块
const COLORREF kLink       = RGB(0x00, 0x00, 0xFF);
const COLORREF kRed        = RGB(0xFF, 0x00, 0x00);
const COLORREF kGreen      = RGB(0x00, 0x80, 0x00);
const COLORREF kStatsText  = RGB(0x55, 0x55, 0x55);
const COLORREF kSbTrack    = RGB(0xF0, 0xF0, 0xF0);
const COLORREF kSbThumb    = RGB(0xC8, 0xC8, 0xC8);
const COLORREF kSbArrow    = RGB(0x60, 0x60, 0x60);

// ---------------------------------------------------------------- 圆角路径
inline void AddRound(Gdiplus::GraphicsPath& p, float x, float y, float w, float h, float r) {
    if (r <= 0.5f) { p.AddRectangle(Gdiplus::RectF(x, y, w, h)); return; }
    float d = r * 2.0f;
    if (d > w) d = w;
    if (d > h) d = h;
    p.AddArc(x, y, d, d, 180.0f, 90.0f);
    p.AddArc(x + w - d, y, d, d, 270.0f, 90.0f);
    p.AddArc(x + w - d, y + h - d, d, d, 0.0f, 90.0f);
    p.AddArc(x, y + h - d, d, d, 90.0f, 90.0f);
    p.CloseFigure();
}

inline Gdiplus::Color Gc(COLORREF c, BYTE a = 255) {
    return Gdiplus::Color(a, GetRValue(c), GetGValue(c), GetBValue(c));
}

inline void FillRound(HDC dc, const RECT& rc, int rad, COLORREF fill) {
    Gdiplus::Graphics g(dc);
    g.SetSmoothingMode(Gdiplus::SmoothingModeAntiAlias);
    // PixelOffsetModeHalf：填充边界落在整像素上，避免整块底色右下溢 1px
    g.SetPixelOffsetMode(Gdiplus::PixelOffsetModeHalf);
    Gdiplus::GraphicsPath p;
    AddRound(p, (float)rc.left, (float)rc.top,
             (float)(rc.right - rc.left), (float)(rc.bottom - rc.top), (float)rad);
    Gdiplus::SolidBrush b(Gc(fill));
    g.FillPath(&b, &p);
}

inline void FrameRound(HDC dc, const RECT& rc, int rad, COLORREF c, float w = 1.0f) {
    Gdiplus::Graphics g(dc);
    g.SetSmoothingMode(Gdiplus::SmoothingModeAntiAlias);
    // PixelOffsetModeHalf 让 0.5 偏移的 1px 描边落在整像素上，得到锐利细线
    g.SetPixelOffsetMode(Gdiplus::PixelOffsetModeHalf);
    Gdiplus::GraphicsPath p;
    float i = w / 2.0f;
    AddRound(p, rc.left + i, rc.top + i,
             (float)(rc.right - rc.left) - w, (float)(rc.bottom - rc.top) - w, (float)rad);
    Gdiplus::Pen pen(Gc(c), w);
    g.DrawPath(&pen, &p);
}

inline void BoxRound(HDC dc, const RECT& rc, int rad, COLORREF fill, COLORREF bd, float w = 1.0f) {
    FillRound(dc, rc, rad, fill);
    FrameRound(dc, rc, rad, bd, w);
}

inline void FillRect(HDC dc, const RECT& rc, COLORREF c) {
    HBRUSH b = CreateSolidBrush(c);
    ::FillRect(dc, &rc, b);
    DeleteObject(b);
}

inline void LineH(HDC dc, int x1, int x2, int y, COLORREF c) {
    RECT r = {x1, y, x2, y + 1};
    FillRect(dc, r, c);
}

// ---------------------------------------------------------------- 文字
inline HFONT MakeFont(int px, bool bold, bool underline = false,
                      const wchar_t* face = L"微软雅黑") {
    return CreateFontW(-px, 0, 0, 0, bold ? FW_BOLD : FW_NORMAL, FALSE, underline, FALSE,
                       DEFAULT_CHARSET, OUT_TT_PRECIS, CLIP_DEFAULT_PRECIS,
                       CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, face);
}

inline void DrawStr(HDC dc, HFONT f, const std::wstring& s, const RECT& rc,
                    COLORREF col, UINT flags) {
    if (s.empty()) return;
    HFONT old = (HFONT)SelectObject(dc, f);
    SetTextColor(dc, col);
    SetBkMode(dc, TRANSPARENT);
    RECT r = rc;
    DrawTextW(dc, s.c_str(), (int)s.size(), &r, flags);
    SelectObject(dc, old);
}

// ---------------------------------------------------------------- 换行
// GDI 的 DT_WORDBREAK 对「中文 + 长路径」会吞字，这里自己做 Unicode 断行，
// 规则近似 Qt 的 WrapAtWordBoundaryOrAnywhere：优先在空格/汉字间断，
// 单个超长词放不下时允许任意处断开；避头尾标点不放在行首。
inline bool IsCJK(wchar_t c) {
    return (c >= 0x2E80 && c <= 0x9FFF) || (c >= 0x3000 && c <= 0x303F) ||
           (c >= 0xF900 && c <= 0xFAFF) || (c >= 0xFF00 && c <= 0xFFEF) ||
           (c >= 0x2000 && c <= 0x206F);
}
inline bool NoBreakBefore(wchar_t c) {
    switch (c) {
        case L'\u3002': case L'\uFF0C': case L'\u3001': case L'\uFF1B': case L'\uFF1A':
        case L'\uFF01': case L'\uFF1F': case L'\uFF09': case L'\u300B': case L'\u300D':
        case L'\u300F': case L'\u3011': case L'\uFF3D': case L'\uFF5D': case L'\uFF1E':
        case L',': case '.': case ';': case ':': case '!': case '?': case '%':
        case ')': case ']': case '}': case L'\u2026':
            return true;
    }
    return false;
}
inline bool NoBreakAfter(wchar_t c) {
    switch (c) {
        case L'\uFF08': case L'\u300A': case L'\u300C': case L'\u300E': case L'\u3010':
        case L'\uFF3B': case L'\uFF5B': case '(': case '[': case '{':
            return true;
    }
    return false;
}
inline bool CanBreak(wchar_t a, wchar_t b) {
    if (a == L' ' || b == L' ') return true;
    if (NoBreakBefore(b) || NoBreakAfter(a)) return false;
    if (IsCJK(a) || IsCJK(b)) return true;
    if ((a == L'/' || a == L'\\' || a == L'-' || a == L'_') && !NoBreakBefore(b)) return true;
    return false;
}

inline int CharWidth(HDC dc, wchar_t c) {
    SIZE sz = {0, 0};
    GetTextExtentPoint32W(dc, &c, 1, &sz);
    return sz.cx;
}

inline int LineHeight(HDC dc, HFONT f) {
    HFONT old = (HFONT)SelectObject(dc, f);
    TEXTMETRICW tm;
    GetTextMetricsW(dc, &tm);
    SelectObject(dc, old);
    return tm.tmHeight;
}

inline std::vector<std::wstring> WrapLines(HDC dc, HFONT f, const std::wstring& s, int width) {
    std::vector<std::wstring> out;
    if (width < 8) width = 8;
    HFONT old = (HFONT)SelectObject(dc, f);

    size_t p = 0;
    while (true) {
        size_t nl = s.find(L'\n', p);
        std::wstring para = s.substr(p, (nl == std::wstring::npos) ? std::wstring::npos : nl - p);
        if (!para.empty() && para.back() == L'\r') para.pop_back();

        if (para.empty()) {
            out.push_back(std::wstring());
        } else {
            size_t i = 0;
            while (i < para.size()) {
                int w = 0;
                size_t j = i, lastBreak = 0;
                bool hasBreak = false;
                while (j < para.size()) {
                    int cw = CharWidth(dc, para[j]);
                    if (w + cw > width && j > i) break;
                    w += cw;
                    ++j;
                    if (j < para.size() && CanBreak(para[j - 1], para[j])) {
                        lastBreak = j;
                        hasBreak = true;
                    }
                }
                if (j >= para.size()) {
                    out.push_back(para.substr(i));
                    break;
                }
                size_t cut = (hasBreak && lastBreak > i) ? lastBreak : j;
                out.push_back(para.substr(i, cut - i));
                i = cut;
                while (i < para.size() && para[i] == L' ') ++i;
            }
        }
        if (nl == std::wstring::npos) break;
        p = nl + 1;
    }
    SelectObject(dc, old);
    return out;
}

inline int MeasureHeight(HDC dc, HFONT f, const std::wstring& s, int width, UINT extra = 0) {
    if (s.empty()) return 0;
    HFONT old = (HFONT)SelectObject(dc, f);
    RECT r = {0, 0, width, 0};
    DrawTextW(dc, s.c_str(), (int)s.size(), &r,
              DT_CALCRECT | DT_WORDBREAK | DT_NOPREFIX | extra);
    SelectObject(dc, old);
    return r.bottom - r.top;
}

inline int TextWidth(HDC dc, HFONT f, const std::wstring& s) {
    if (s.empty()) return 0;
    HFONT old = (HFONT)SelectObject(dc, f);
    SIZE sz = {0, 0};
    GetTextExtentPoint32W(dc, s.c_str(), (int)s.size(), &sz);
    SelectObject(dc, old);
    return sz.cx;
}

// ---------------------------------------------------------------- 控件样式
struct ButtonStyle {
    RECT rc;
    std::wstring label;
    HFONT font;
    COLORREF bg, bgHot, fg;
    int radius;
    bool enabled, hot;
};

inline void DrawButton(HDC dc, const ButtonStyle& b) {
    RECT r = b.rc;
    FillRound(dc, r, b.radius, (b.hot && b.enabled) ? b.bgHot : b.bg);
    DrawStr(dc, b.font, b.label, r, b.fg,
            DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
}

// 分组框：圆角边框 + 顶部标题（标题处断开上边框，与 Qt QGroupBox 一致）
inline void DrawGroup(HDC dc, const RECT& rc, int rad, const std::wstring& title,
                      HFONT titleFont, COLORREF pageBg, int titleX, int titleCenterY) {
    RECT r = rc;
    FrameRound(dc, r, rad, kGroupBd, 1.0f);
    if (!title.empty()) {
        int tw = TextWidth(dc, titleFont, title);
        RECT gap = {titleX - 3, r.top - 1, titleX + tw + 3, r.top + 2};
        FillRect(dc, gap, pageBg);
        RECT tr = {titleX, titleCenterY - 12, titleX + tw + 8, titleCenterY + 12};
        DrawStr(dc, titleFont, title, tr, kText, DT_LEFT | DT_VCENTER | DT_SINGLELINE);
    }
}

// ---------------------------------------------------------------- 滚动条
inline RECT SbThumbRect(const RECT& track, int content, int view, int scroll) {
    int h = track.bottom - track.top;
    if (content <= view || content <= 0) return RECT{0, 0, 0, 0};
    int btn = 17;
    int span = h - btn * 2;
    int thumb = span * view / content;
    if (thumb < 24) thumb = 24;
    if (thumb > span) thumb = span;
    int maxScroll = content - view;
    if (maxScroll < 1) maxScroll = 1;
    int pos = btn + (span - thumb) * scroll / maxScroll;
    RECT t = {track.left, track.top + pos, track.right, track.top + pos + thumb};
    return t;
}

inline void DrawTriangle(HDC dc, int cx, int cy, int dir, COLORREF c) {
    POINT p[3];
    if (dir < 0) { p[0] = POINT{cx - 4, cy + 2}; p[1] = POINT{cx + 4, cy + 2}; p[2] = POINT{cx, cy - 3}; }
    else         { p[0] = POINT{cx - 4, cy - 2}; p[1] = POINT{cx + 4, cy - 2}; p[2] = POINT{cx, cy + 3}; }
    HBRUSH br = CreateSolidBrush(c);
    HPEN pen = CreatePen(PS_SOLID, 1, c);
    HBRUSH ob = (HBRUSH)SelectObject(dc, br);
    HPEN op = (HPEN)SelectObject(dc, pen);
    Polygon(dc, p, 3);
    SelectObject(dc, ob);
    SelectObject(dc, op);
    DeleteObject(br);
    DeleteObject(pen);
}

inline void DrawVScroll(HDC dc, const RECT& track, int content, int view, int scroll) {
    FillRect(dc, track, kSbTrack);
    if (content <= view) return;
    DrawTriangle(dc, (track.left + track.right) / 2, track.top + 8, -1, kSbArrow);
    DrawTriangle(dc, (track.left + track.right) / 2, track.bottom - 9, 1, kSbArrow);
    RECT t = SbThumbRect(track, content, view, scroll);
    FillRound(dc, t, 3, kSbThumb);
    FrameRound(dc, t, 3, RGB(0xB8, 0xB8, 0xB8), 1.0f);
}

}  // namespace ui
