// main.cpp —— MD Image Cleaner 桌面版（纯 Win32 + GDI/GDI+ 自绘）
// 界面几何全部对齐原版 PyQt5 截图（1200×750 @ 96DPI），见 core/SPEC.md
#define WIN32_LEAN_AND_MEAN
#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#include <windows.h>
#include <windowsx.h>
#include <commdlg.h>
#include <shellapi.h>
#include <shlwapi.h>
#include <string>
#include <vector>
#include <algorithm>

#include "paint.h"
#include "preview.h"
#include "core.h"
#include "cli.h"

using namespace ui;
using mdclean::Num;

// ---------------------------------------------------------------- 尺寸常量
static const int MARGIN          = 15;
static const int TOPBAR_H        = 61;
static const int TOPBAR_BTN_W    = 137;
static const int TOPBAR_BTN_H    = 35;
static const int TITLE_VCY       = 118;
static const int DESC_VCY        = 162;
static const int SEL_BTN_TOP     = 206;
static const int SEL_BTN_H       = 48;
static const int SEL_BTN_W       = 227;
static const int PROG_TOP        = 273;
static const int PROG_H          = 22;
static const int PROG_GAP        = 10;
static const int LOG_GROUP_TOP   = 327;
static const int PREV_GROUP_TOP  = 111;
static const int STATS_H         = 54;
static const int STATUS_H        = 23;
static const int HANDLE_W        = 5;
static const int CARD_BOX        = 414;   // 图片框外框（2px 边框 + 5px 内边距）
static const int CARD_INSET      = 7;     // 上面两者之和
static const int CARD_GAP_X      = 30;
static const int CARD_GAP_Y      = 25;
static const int CARD_PAD        = 10;    // 卡片内部布局边距
static const int SB_W            = 17;
static const int MIN_PANE        = 320;

struct PreviewMsg {
    std::wstring path;
    bool used = false;
};

#define WM_APP_LOG      (WM_APP + 1)
#define WM_APP_PROGRESS (WM_APP + 2)
#define WM_APP_PREVIEW  (WM_APP + 3)
#define WM_APP_STATS    (WM_APP + 4)
#define WM_APP_FINISH   (WM_APP + 5)
#define WM_APP_FLUSH    (WM_APP + 6)

// ---------------------------------------------------------------- 布局
struct Layout {
    RECT topBar, openBtn, fileText;
    RECT title, desc, selBtn;
    RECT progLbl, progBar, progTxt;
    RECT leftGroup, logBox, logText, logSb;
    RECT rightGroup, prevView, prevInner, prevSb;
    RECT statsBar, statsText;
    RECT statusText;
    int splitX = 0;
    int cols = 1;
    int logWrapW = 0;
};

struct App {
    HWND hwnd = nullptr;
    // 字体
    HFONT f13 = nullptr, f13b = nullptr, f14 = nullptr, f14b = nullptr, f16 = nullptr,
          f16b = nullptr, f17 = nullptr, f17b = nullptr, f27b = nullptr,
          f12 = nullptr, f16u = nullptr, f15 = nullptr, f15b = nullptr;
    // 状态
    std::wstring fileText = L"未选择文件";
    std::wstring progressText = L"就绪";
    int progress = 0;
    std::wstring log;
    std::vector<std::wstring> logLines;
    int logLineH = 23;
    int nameLineH = 23;
    int logWrapW = -1;
    size_t logWrapLen = 0;
    std::vector<Card> cards;
    std::wstring stats = L"图片统计: 未引用 0 张，已引用 0 张";
    std::wstring status;
    std::wstring mdPath, assetsDir;
    bool openEnabled = false;
    bool busy = false;
    bool noAssets = true;
    int leftW = 672;
    int logScroll = 0, prevScroll = 0;
    int logContent = 0, prevContent = 0;
    int hot = -1;            // 0 顶部按钮 1 主按钮
    int drag = 0;            // 1 分栏 2 日志滚动 3 预览滚动
    int dragY = 0, dragV = 0, dragThumbTop = 0;
    Layout L;
    HICON icon = nullptr;
};

static App g;

// ---------------------------------------------------------------- 字体
static void CreateFonts(App& a) {
    a.f12  = MakeFont(12, false);
    a.f13  = MakeFont(13, false);
    a.f13b = MakeFont(13, true);
    a.f14  = MakeFont(14, false);
    a.f14b = MakeFont(14, true);
    a.f15  = MakeFont(15, false);
    a.f15b = MakeFont(15, true);
    a.f16  = MakeFont(16, false);
    a.f16b = MakeFont(16, true);
    a.f16u = MakeFont(16, false, true);
    a.f17  = MakeFont(17, false);
    a.f17b = MakeFont(17, true);
    // 原版 QFont("微软雅黑", 20, Bold) → 20pt * 96/72 = 26.67px，Qt 取整为 27px
    a.f27b = MakeFont(27, true);
}

static void DestroyFonts(App& a) {
    HFONT fs[] = {a.f12, a.f13, a.f13b, a.f14, a.f14b, a.f15, a.f15b, a.f16,
                  a.f16b, a.f16u, a.f17, a.f17b, a.f27b};
    for (auto f : fs)
        if (f) DeleteObject(f);
}

// ---------------------------------------------------------------- 布局计算
static void UpdateLogWrap(App& a, HDC dc, int width) {
    if (a.logWrapW == width && a.logWrapLen == a.log.size() && !a.logLines.empty())
        return;
    // 原版 QTextEdit 走的是 QSS 里的 font-size: 13px（不是 setFont 的 13pt）
    a.logLines = WrapLines(dc, a.f13, a.log, width);
    a.logLineH = LineHeight(dc, a.f13);
    a.logWrapW = width;
    a.logWrapLen = a.log.size();
    a.logContent = (int)a.logLines.size() * a.logLineH;
}

static void Relayout(App& a) {
    HDC dc = GetDC(a.hwnd);
    RECT rc;
    GetClientRect(a.hwnd, &rc);
    const int W = rc.right, H = rc.bottom;
    Layout& L = a.L;

    const int contentW = W - MARGIN * 2;
    // 顶部信息栏
    L.topBar = {MARGIN, MARGIN, MARGIN + contentW, MARGIN + TOPBAR_H};
    L.openBtn = {L.topBar.right - 10 - TOPBAR_BTN_W,
                 L.topBar.top + (TOPBAR_H - TOPBAR_BTN_H) / 2,
                 L.topBar.right - 10,
                 L.topBar.top + (TOPBAR_H - TOPBAR_BTN_H) / 2 + TOPBAR_BTN_H};
    L.fileText = {L.topBar.left + 25, L.topBar.top + 2, L.openBtn.left - 12,
                  L.topBar.bottom - 2};

    // 分栏
    int leftW = a.leftW;
    if (leftW < MIN_PANE) leftW = MIN_PANE;
    int maxLeft = contentW - HANDLE_W - MIN_PANE;
    if (leftW > maxLeft) leftW = maxLeft;
    int leftRight = MARGIN + leftW;
    int rightLeft = leftRight + HANDLE_W;
    L.splitX = leftRight;
    int rightRight = W - MARGIN;

    // 左栏固定块
    // 墨迹中心对齐原版实测值 y=118（DT_VCENTER 的行框中心比墨迹中心低 3px，需上移修正）
    L.title = {MARGIN, TITLE_VCY - 25, leftRight, TITLE_VCY + 19};
    L.desc  = {MARGIN, DESC_VCY - 12, leftRight, DESC_VCY + 12};
    int btnW = SEL_BTN_W;
    if (btnW > leftW - 20) btnW = leftW - 20;
    int btnX = MARGIN + (leftW - btnW) / 2;
    L.selBtn = {btnX, SEL_BTN_TOP, btnX + btnW, SEL_BTN_TOP + SEL_BTN_H};

    L.progLbl = {MARGIN, PROG_TOP + 1, MARGIN + 36, PROG_TOP + PROG_H + 1};
    int tw = TextWidth(dc, a.f16, a.progressText);
    int barLeft = MARGIN + 46;
    int barRight = leftRight - PROG_GAP - tw;
    if (barRight < barLeft + 60) barRight = barLeft + 60;
    L.progBar = {barLeft, PROG_TOP, barRight, PROG_TOP + PROG_H};
    L.progTxt = {barRight + PROG_GAP, PROG_TOP + 1, leftRight, PROG_TOP + PROG_H + 1};

    // 底部
    int statsTop = H - STATUS_H - MARGIN - STATS_H;
    L.statsBar = {MARGIN, statsTop, rightRight, statsTop + STATS_H};
    L.statsText = {MARGIN + 25, statsTop + 15, rightRight - 10, statsTop + 41};
    L.statusText = {6, H - STATUS_H, W, H};

    // 左侧分组
    L.leftGroup = {MARGIN, LOG_GROUP_TOP, leftRight, statsTop - 20};
    L.logBox = {MARGIN + 10, LOG_GROUP_TOP + 20, leftRight - 11,
                L.leftGroup.bottom - 11};

    int textW = L.logBox.right - L.logBox.left - 24;
    int viewH = L.logBox.bottom - L.logBox.top - 24;
    UpdateLogWrap(a, dc, textW);
    bool logSb = a.logContent > viewH;
    if (logSb) {
        textW -= SB_W;
        UpdateLogWrap(a, dc, textW);
    }
    L.logWrapW = textW;
    L.logText = {L.logBox.left + 12, L.logBox.top + 12,
                 L.logBox.right - 12 - (logSb ? SB_W : 0), L.logBox.bottom - 12};
    L.logSb = {L.logBox.right - SB_W, L.logBox.top + 1, L.logBox.right - 1,
               L.logBox.bottom - 1};

    // 右侧分组
    L.rightGroup = {rightLeft, PREV_GROUP_TOP, rightRight, L.leftGroup.bottom};
    L.prevView = {rightLeft + 1, PREV_GROUP_TOP + 11, rightRight - 1,
                  L.rightGroup.bottom - 1};
    L.prevSb = {L.prevView.right - SB_W, L.prevView.top, L.prevView.right,
                L.prevView.bottom};
    L.prevInner = {L.prevView.left, L.prevView.top,
                   L.prevView.right - SB_W, L.prevView.bottom};

    // 预览内容高度（列数公式与原版一致：(宽-30)/420）
    L.cols = (L.prevInner.right - L.prevInner.left - 30) / 420;
    if (L.cols < 1) L.cols = 1;
    int y = 9;                       // 顶部留白（对齐原版 131-122）
    int rowH = 0, col = 0;
    a.prevContent = 0;
    for (size_t i = 0; i < a.cards.size(); ++i) {
        int ch = CARD_PAD + CARD_BOX + 8 + a.cards[i].nameH + 19 + CARD_PAD;
        if (ch > rowH) rowH = ch;
        if (++col == L.cols) { y += rowH + CARD_GAP_Y; col = 0; rowH = 0; }
    }
    if (col > 0) y += rowH;
    a.prevContent = y + 15;

    ReleaseDC(a.hwnd, dc);
}

// ---------------------------------------------------------------- 绘制
static void DrawLogArea(App& a, HDC dc) {
    const Layout& L = a.L;
    BoxRound(dc, L.logBox, 6, kLogBg, kGroupBd, 1.0f);

    int viewH = L.logText.bottom - L.logText.top;
    int maxScroll = a.logContent - viewH;
    if (maxScroll < 0) maxScroll = 0;
    if (a.logScroll > maxScroll) a.logScroll = maxScroll;
    if (a.logScroll < 0) a.logScroll = 0;

    int save = SaveDC(dc);
    IntersectClipRect(dc, L.logText.left, L.logText.top, L.logText.right, L.logText.bottom);
    int y = L.logText.top - a.logScroll;
    int lh = a.logLineH;
    for (size_t i = 0; i < a.logLines.size(); ++i, y += lh) {
        if (y + lh < L.logText.top) continue;
        if (y > L.logText.bottom) break;
        if (a.logLines[i].empty()) continue;
        RECT lr = {L.logText.left, y, L.logText.right, y + lh};
        DrawStr(dc, a.f13, a.logLines[i], lr, kText,
                DT_LEFT | DT_TOP | DT_SINGLELINE | DT_NOPREFIX);
    }
    RestoreDC(dc, save);

    if (a.logContent > viewH)
        DrawVScroll(dc, L.logSb, a.logContent, viewH, a.logScroll);
}

static void DrawPreview(App& a, HDC dc) {
    const Layout& L = a.L;
    // 预览区底色
    FillRect(dc, L.prevView, kPrevBg);

    int viewH = L.prevInner.bottom - L.prevInner.top;
    int maxScroll = a.prevContent - viewH;
    if (maxScroll < 0) maxScroll = 0;
    if (a.prevScroll > maxScroll) a.prevScroll = maxScroll;
    if (a.prevScroll < 0) a.prevScroll = 0;

    const int cols = L.cols;
    const int cardW = CARD_BOX + CARD_PAD * 2;

    int save = SaveDC(dc);
    IntersectClipRect(dc, L.prevInner.left, L.prevInner.top,
                      L.prevInner.right, L.prevInner.bottom);

    int x0 = L.prevInner.left + 15;
    int widgetTop = L.prevInner.top + 9 - CARD_PAD;
    int col = 0, rowH = 0, rowTop = widgetTop;
    for (size_t i = 0; i < a.cards.size(); ++i) {
        Card& c = a.cards[i];
        int nameH = c.nameH;
        int cardH = CARD_PAD + CARD_BOX + 8 + nameH + 19 + CARD_PAD;
        if (cardH > rowH) rowH = cardH;

        int cx = x0 + col * (cardW + CARD_GAP_X);
        int cy = rowTop - a.prevScroll;
        RECT box = {cx + CARD_PAD, cy + CARD_PAD, cx + CARD_PAD + CARD_BOX,
                    cy + CARD_PAD + CARD_BOX};
        c.boxRc = box;

        if (box.bottom > L.prevInner.top && box.top < L.prevInner.bottom) {
            BoxRound(dc, box, 8, kWhite, kCardBd, 2.0f);
            RECT inner = {box.left + CARD_INSET, box.top + CARD_INSET,
                          box.left + CARD_INSET + 400, box.top + CARD_INSET + 400};
            if (c.bmp) {
                int ox = inner.left + (400 - c.w) / 2;
                int oy = inner.top + (400 - c.h) / 2;
                DrawThumb(dc, c.bmp, ox, oy);
            } else {
                FillRect(dc, inner, kFallback);
            }
            int nameTop = box.bottom + 6;
            int nlh = a.nameLineH;
            for (size_t k = 0; k < c.nameLines.size(); ++k) {
                RECT nr = {box.left, nameTop + (int)k * nlh,
                           box.left + 400, nameTop + (int)k * nlh + nlh};
                DrawStr(dc, a.f16, c.nameLines[k], nr, kBlack,
                        DT_CENTER | DT_TOP | DT_SINGLELINE | DT_NOPREFIX);
            }
            RECT sr = {box.left, nameTop + nameH + 3, box.right, nameTop + nameH + 22};
            DrawStr(dc, a.f16b, c.used ? L"已使用" : L"未使用", sr,
                    c.used ? kGreen : kRed,
                    DT_CENTER | DT_VCENTER | DT_SINGLELINE);
        }

        if (++col == cols) {
            rowTop += rowH + CARD_GAP_Y;
            col = 0;
            rowH = 0;
        }
    }
    RestoreDC(dc, save);

    if (a.prevContent > viewH)
        DrawVScroll(dc, L.prevSb, a.prevContent, viewH, a.prevScroll);
}

static void Draw(App& a, HDC dc) {
    RECT rc;
    GetClientRect(a.hwnd, &rc);
    FillRect(dc, rc, kWhite);
    const Layout& L = a.L;

    // ---- 顶部信息栏
    FillRound(dc, L.topBar, 8, kTopBarBg);
    DrawStr(dc, a.f13b, a.fileText, L.fileText, kText,
            DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX | DT_END_ELLIPSIS);
    {
        ButtonStyle b;
        b.rc = L.openBtn;
        b.label = L"打开.assets文件夹";
        b.font = a.f13;
        b.bg = kBtnRed;
        b.bgHot = kBtnRedHot;
        b.fg = a.openEnabled ? kWhite : RGB(0xF2, 0xF2, 0xF2);
        b.radius = 5;
        b.enabled = a.openEnabled;
        b.hot = (a.hot == 0);
        DrawButton(dc, b);
    }

    // ---- 左栏
    DrawStr(dc, a.f27b, L"Typora未引用图片清理工具", L.title, kBlack,
            DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
    DrawStr(dc, a.f16u,
            L"此工具可帮助您清理Typora Markdown文件对应的.assets文件夹中未被引用的图片",
            L.desc, kLink, DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
    {
        ButtonStyle b;
        b.rc = L.selBtn;
        b.label = L"选择Markdown文件并清理";
        b.font = a.f14;
        b.bg = kBtnTeal;
        b.bgHot = kBtnTealHot;
        b.fg = kWhite;
        b.radius = 6;
        b.enabled = !a.busy;
        b.hot = (a.hot == 1);
        DrawButton(dc, b);
    }

    // 进度
    DrawStr(dc, a.f16, L"进度:", L.progLbl, kBlack,
            DT_LEFT | DT_VCENTER | DT_SINGLELINE);
    {
        RECT bar = L.progBar;
        FillRound(dc, bar, 4, kWhite);
        int innerW = (bar.right - bar.left - 2);
        int pct = a.progress < 0 ? 0 : (a.progress > 100 ? 100 : a.progress);
        int fillW = innerW * pct / 100;
        if (fillW > 0) {
            Gdiplus::Graphics g(dc);
            g.SetSmoothingMode(Gdiplus::SmoothingModeAntiAlias);
            Gdiplus::GraphicsPath p;
            AddRound(p, (float)(bar.left + 1), (float)(bar.top + 1),
                     (float)innerW, (float)(bar.bottom - bar.top - 2), 3.0f);
            g.SetClip(&p);
            Gdiplus::SolidBrush b(Gc(kProgChunk));
            g.FillRectangle(&b, bar.left + 1, bar.top + 1, fillW, bar.bottom - bar.top - 2);
            g.ResetClip();
        }
        FrameRound(dc, bar, 4, kProgBorder, 1.0f);
        std::wstring pctText = Num(a.progress) + L"%";
        RECT pr = {bar.left, bar.top - 2, bar.right, bar.bottom - 2};
        DrawStr(dc, a.f12, pctText, pr, kBlack, DT_LEFT | DT_VCENTER | DT_SINGLELINE);
    }
    DrawStr(dc, a.f16, a.progressText, L.progTxt, kBlack,
            DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);

    // ---- 分栏手柄（QSplitter 的 handle，原版是 #f0f0f0 的 5px 竖条）
    {
        RECT sp = {L.splitX, MARGIN + TOPBAR_H + 21, L.splitX + HANDLE_W,
                   L.leftGroup.bottom};
        FillRect(dc, sp, kPrevBg);
    }

    // ---- 分组框
    DrawGroup(dc, L.leftGroup, 6, L"操作日志", a.f16b, kWhite,
              L.leftGroup.left + 15, L.leftGroup.top - 3);
    DrawGroup(dc, L.rightGroup, 6, L"图片预览", a.f16b, kWhite,
              L.rightGroup.left + 16, L.rightGroup.top - 3);

    DrawLogArea(a, dc);
    DrawPreview(a, dc);

    // ---- 统计栏
    FillRound(dc, L.statsBar, 6, kLogBg);
    DrawStr(dc, a.f17b, a.stats, L.statsText, kStatsText,
            DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);

    // ---- 状态栏
    DrawStr(dc, a.f12, a.status, L.statusText, kBlack,
            DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
}

// ---------------------------------------------------------------- 工作线程
struct UiSink : mdclean::JobSink {
    HWND hwnd = nullptr;
    void OnLog(const std::wstring& s) override {
        PostMessageW(hwnd, WM_APP_LOG, 0, (LPARAM) new std::wstring(s));
    }
    void OnProgress(int v, const std::wstring& t) override {
        PostMessageW(hwnd, WM_APP_PROGRESS, (WPARAM)v, (LPARAM) new std::wstring(t));
    }
    void OnPreview(const std::wstring& path, bool used) override {
        PreviewMsg* m = new PreviewMsg();
        m->path = path;
        m->used = used;
        PostMessageW(hwnd, WM_APP_PREVIEW, used ? 1 : 0, (LPARAM)m);
    }
    void OnStats(int u, int s) override {
        PostMessageW(hwnd, WM_APP_STATS, (WPARAM)u, (LPARAM)s);
    }
    void OnFinish(int n) override { PostMessageW(hwnd, WM_APP_FINISH, (WPARAM)n, 0); }
    // 等 UI 把缩略图全部读进内存再动文件 —— 修掉原版"预览变灰块"的竞态
    void FlushPreview() override {
        HANDLE ev = CreateEventW(nullptr, TRUE, FALSE, nullptr);
        if (!ev) return;
        PostMessageW(hwnd, WM_APP_FLUSH, 0, (LPARAM)ev);
        WaitForSingleObject(ev, 60000);
        CloseHandle(ev);
    }
};

static DWORD WINAPI WorkerProc(LPVOID param) {
    App* a = (App*)param;
    UiSink sink;
    sink.hwnd = a->hwnd;
    mdclean::RunClean(a->mdPath, sink, true, nullptr);
    return 0;
}

// ---------------------------------------------------------------- 路径工具
static std::vector<std::wstring> SplitPathParts(const std::wstring& p) {
    std::vector<std::wstring> v;
    std::wstring cur;
    for (size_t i = 2; i < p.size(); ++i) {   // 跳过盘符
        wchar_t c = p[i];
        if (c == L'\\' || c == L'/') {
            if (!cur.empty()) { v.push_back(cur); cur.clear(); }
        } else {
            cur.push_back(c);
        }
    }
    if (!cur.empty()) v.push_back(cur);
    return v;
}

// 等价 Python os.path.relpath(path, cwd)：跨盘返回绝对路径
static std::wstring RelativeTo(const std::wstring& path) {
    wchar_t cwd[MAX_PATH * 2] = {0};
    if (!GetCurrentDirectoryW(MAX_PATH * 2, cwd)) return path;
    std::wstring base = cwd, target = path;
    if (target.size() < 3 || base.size() < 3) return path;
    if (towlower(target[0]) != towlower(base[0]) || target[1] != L':' || base[1] != L':')
        return path;
    auto a = SplitPathParts(target);
    auto b = SplitPathParts(base);
    size_t n = 0;
    while (n < a.size() && n < b.size() && _wcsicmp(a[n].c_str(), b[n].c_str()) == 0) ++n;
    std::wstring out;
    for (size_t i = n; i < b.size(); ++i) out += L"..\\";
    for (size_t i = n; i < a.size(); ++i) {
        out += a[i];
        if (i + 1 < a.size()) out += L"\\";
    }
    if (out.empty()) out = target;
    return out;
}

// ---------------------------------------------------------------- 命中测试
static int HitTest(App& a, int x, int y) {
    const Layout& L = a.L;
    POINT p = {x, y};
    if (a.openEnabled && PtInRect(&L.openBtn, p)) return 0;
    if (!a.busy && PtInRect(&L.selBtn, p)) return 1;
    return -1;
}

static bool InSplitter(App& a, int x, int y) {
    const Layout& L = a.L;
    if (x < L.splitX || x >= L.splitX + HANDLE_W) return false;
    RECT rc;
    GetClientRect(a.hwnd, &rc);
    return y > MARGIN + TOPBAR_H + 6 && y < rc.bottom - STATUS_H - MARGIN - STATS_H - 10;
}

// ---------------------------------------------------------------- 动作
static void OpenPath(const std::wstring& p) {
    ShellExecuteW(nullptr, L"open", p.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
}

// 等价 os.path 在 Windows 上的行为：路径分隔符一律用反斜杠（Qt 的 toNativeSeparators）
static std::wstring ToNativeSep(const std::wstring& p) {
    std::wstring o = p;
    for (auto& c : o)
        if (c == L'/') c = L'\\';
    return o;
}

static void DoClean(App& a, const std::wstring& mdRaw) {
    const std::wstring md = ToNativeSep(mdRaw);
    a.mdPath = md;
    a.assetsDir = mdclean::AssetsDirFor(md);
    a.fileText = L"当前文件: " + RelativeTo(md);
    a.openEnabled = mdclean::IsDir(a.assetsDir);
    a.status = L"正在分析: " + mdclean::BaseName(md);
    a.busy = true;
    a.progress = 0;
    a.progressText = L"准备中...";
    a.log.clear();
    a.logScroll = 0;
    a.prevScroll = 0;
    a.stats = L"图片统计: 未引用 0 张，已引用 0 张";
    FreeCards(a.cards);
    HANDLE h = CreateThread(nullptr, 0, WorkerProc, &a, 0, nullptr);
    if (h) CloseHandle(h);
    InvalidateRect(a.hwnd, nullptr, FALSE);
}

static void StartClean(App& a) {
    wchar_t buf[MAX_PATH * 4] = {0};
    OPENFILENAMEW ofn = {0};
    ofn.lStructSize = sizeof(ofn);
    ofn.hwndOwner = a.hwnd;
    ofn.lpstrFilter = L"Markdown文件 (*.md)\0*.md\0\0";
    ofn.lpstrFile = buf;
    ofn.nMaxFile = MAX_PATH * 4;
    ofn.lpstrTitle = L"选择Markdown文件";
    ofn.Flags = OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_HIDEREADONLY;
    if (!GetOpenFileNameW(&ofn)) return;
    DoClean(a, buf);
}

// ---------------------------------------------------------------- 窗口过程
static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    App& a = g;
    switch (msg) {
        case WM_CREATE:
            a.hwnd = hwnd;
            CreateFonts(a);
            Relayout(a);
            return 0;

        case WM_PAINT: {
            PAINTSTRUCT ps;
            HDC dc = BeginPaint(hwnd, &ps);
            RECT rc;
            GetClientRect(hwnd, &rc);
            HDC mem = CreateCompatibleDC(dc);
            HBITMAP bmp = CreateCompatibleBitmap(dc, rc.right, rc.bottom);
            HBITMAP old = (HBITMAP)SelectObject(mem, bmp);
            Relayout(a);
            Draw(a, mem);
            BitBlt(dc, 0, 0, rc.right, rc.bottom, mem, 0, 0, SRCCOPY);
            SelectObject(mem, old);
            DeleteObject(bmp);
            DeleteDC(mem);
            EndPaint(hwnd, &ps);
            return 0;
        }

        case WM_ERASEBKGND:
            return 1;

        case WM_SIZE:
            Relayout(a);
            InvalidateRect(hwnd, nullptr, FALSE);
            return 0;

        case WM_GETMINMAXINFO: {
            MINMAXINFO* mi = (MINMAXINFO*)lp;
            mi->ptMinTrackSize.x = 900;
            mi->ptMinTrackSize.y = 640;
            return 0;
        }

        case WM_LBUTTONDOWN: {
            int x = GET_X_LPARAM(lp), y = GET_Y_LPARAM(lp);
            if (InSplitter(a, x, y)) {
                a.drag = 1;
                SetCapture(hwnd);
                return 0;
            }
            POINT p = {x, y};
            if (a.logContent > (a.L.logText.bottom - a.L.logText.top) &&
                PtInRect(&a.L.logSb, p)) {
                RECT t = SbThumbRect(a.L.logSb, a.logContent,
                                     a.L.logText.bottom - a.L.logText.top, a.logScroll);
                if (PtInRect(&t, p)) {
                    a.drag = 2;
                    a.dragY = y;
                    a.dragV = a.logScroll;
                    a.dragThumbTop = t.top;
                }
                SetCapture(hwnd);
                return 0;
            }
            if (a.prevContent > (a.L.prevInner.bottom - a.L.prevInner.top) &&
                PtInRect(&a.L.prevSb, p)) {
                RECT t = SbThumbRect(a.L.prevSb, a.prevContent,
                                     a.L.prevInner.bottom - a.L.prevInner.top, a.prevScroll);
                if (PtInRect(&t, p)) {
                    a.drag = 3;
                    a.dragY = y;
                    a.dragV = a.prevScroll;
                    a.dragThumbTop = t.top;
                }
                SetCapture(hwnd);
                return 0;
            }
            int hit = HitTest(a, x, y);
            if (hit == 0) OpenPath(a.assetsDir);
            else if (hit == 1) StartClean(a);
            return 0;
        }

        case WM_LBUTTONUP:
            if (a.drag) {
                a.drag = 0;
                ReleaseCapture();
            }
            return 0;

        case WM_LBUTTONDBLCLK: {
            POINT p = {GET_X_LPARAM(lp), GET_Y_LPARAM(lp)};
            for (auto& c : a.cards) {
                if (PtInRect(&c.boxRc, p)) {
                    if (mdclean::PathExists(c.path)) {
                        OpenPath(c.path);
                    } else {
                        MessageBoxW(hwnd, (L"图片文件不存在: " + c.path).c_str(),
                                    L"文件不存在", MB_OK | MB_ICONWARNING);
                    }
                    break;
                }
            }
            return 0;
        }

        case WM_MOUSEMOVE: {
            int x = GET_X_LPARAM(lp), y = GET_Y_LPARAM(lp);
            if (a.drag == 1) {
                RECT rc;
                GetClientRect(hwnd, &rc);
                int nw = x - MARGIN;
                int maxLeft = (rc.right - MARGIN * 2) - HANDLE_W - MIN_PANE;
                if (nw < MIN_PANE) nw = MIN_PANE;
                if (nw > maxLeft) nw = maxLeft;
                if (nw != a.leftW) {
                    a.leftW = nw;
                    Relayout(a);
                    InvalidateRect(hwnd, nullptr, FALSE);
                }
                return 0;
            }
            if (a.drag == 2 || a.drag == 3) {
                bool isLog = (a.drag == 2);
                RECT track = isLog ? a.L.logSb : a.L.prevSb;
                int content = isLog ? a.logContent : a.prevContent;
                int view = isLog ? (a.L.logText.bottom - a.L.logText.top)
                                 : (a.L.prevInner.bottom - a.L.prevInner.top);
                RECT t = SbThumbRect(track, content, view, isLog ? a.logScroll : a.prevScroll);
                int thumbH = t.bottom - t.top;
                int span = (track.bottom - track.top) - 34 - thumbH;
                if (span < 1) span = 1;
                int maxScroll = content - view;
                int delta = (y - a.dragY) * maxScroll / span;
                int v = a.dragV + delta;
                if (v < 0) v = 0;
                if (v > maxScroll) v = maxScroll;
                if (isLog) a.logScroll = v; else a.prevScroll = v;
                InvalidateRect(hwnd, nullptr, FALSE);
                return 0;
            }
            int hit = HitTest(a, x, y);
            if (hit != a.hot) {
                a.hot = hit;
                InvalidateRect(hwnd, nullptr, FALSE);
            }
            return 0;
        }

        case WM_MOUSEWHEEL: {
            POINT p = {GET_X_LPARAM(lp), GET_Y_LPARAM(lp)};
            ScreenToClient(hwnd, &p);
            int delta = -GET_WHEEL_DELTA_WPARAM(wp) / 120 * 60;
            if (PtInRect(&a.L.prevView, p)) {
                a.prevScroll += delta;
                RECT rc;
                GetClientRect(hwnd, &rc);
                int view = a.L.prevInner.bottom - a.L.prevInner.top;
                int maxS = a.prevContent - view;
                if (a.prevScroll > maxS) a.prevScroll = maxS;
                if (a.prevScroll < 0) a.prevScroll = 0;
                InvalidateRect(hwnd, nullptr, FALSE);
            } else if (PtInRect(&a.L.logBox, p)) {
                a.logScroll += delta;
                int view = a.L.logText.bottom - a.L.logText.top;
                int maxS = a.logContent - view;
                if (a.logScroll > maxS) a.logScroll = maxS;
                if (a.logScroll < 0) a.logScroll = 0;
                InvalidateRect(hwnd, nullptr, FALSE);
            }
            return 0;
        }

        case WM_SETCURSOR: {
            if (LOWORD(lp) == HTCLIENT) {
                POINT p;
                GetCursorPos(&p);
                ScreenToClient(hwnd, &p);
                if (InSplitter(a, p.x, p.y)) {
                    SetCursor(LoadCursorW(nullptr, IDC_SIZEWE));
                    return TRUE;
                }
                if (HitTest(a, p.x, p.y) >= 0) {
                    SetCursor(LoadCursorW(nullptr, IDC_HAND));
                    return TRUE;
                }
            }
            break;
        }

        // ---------------- 工作线程回调
        case WM_APP_LOG: {
            std::wstring* s = (std::wstring*)lp;
            if (s) {
                a.log += *s;
                a.log += L"\n";
                delete s;
                Relayout(a);
                // 原版 update_log 里 append 后 moveCursor(End)：日志始终贴底
                a.logScroll = 1 << 28;
                InvalidateRect(hwnd, nullptr, FALSE);
            }
            return 0;
        }

        case WM_APP_PROGRESS: {
            std::wstring* s = (std::wstring*)lp;
            a.progress = (int)wp;
            if (s) {
                a.progressText = *s;
                delete s;
            }
            Relayout(a);
            InvalidateRect(hwnd, nullptr, FALSE);
            return 0;
        }

        case WM_APP_PREVIEW: {
            PreviewMsg* p = (PreviewMsg*)lp;
            if (p) {
                Card c;
                c.path = p->path;
                c.name = mdclean::BaseName(p->path);
                c.used = p->used;
                LoadThumb(p->path, 400, 400, &c.bmp, &c.w, &c.h);
                HDC dc0 = GetDC(hwnd);
                c.nameLines = WrapLines(dc0, a.f16, c.name, 400);
                a.nameLineH = LineHeight(dc0, a.f16);
                c.nameH = (int)c.nameLines.size() * a.nameLineH;
                ReleaseDC(hwnd, dc0);
                if (c.nameH <= 0) c.nameH = 22;
                a.cards.push_back(c);
                delete p;
                Relayout(a);
                InvalidateRect(hwnd, nullptr, FALSE);
            }
            return 0;
        }

        case WM_APP_STATS: {
            int u = (int)wp, s = (int)lp;
            a.stats = L"图片统计: 未引用 " + Num(u) + L" 张，已引用 " + Num(s) + L" 张";
            InvalidateRect(hwnd, nullptr, FALSE);
            return 0;
        }

        case WM_APP_FLUSH: {
            HANDLE ev = (HANDLE)lp;
            if (ev) SetEvent(ev);
            return 0;
        }

        case WM_APP_FINISH: {
            int moved = (int)wp;
            a.busy = false;
            a.progressText = L"就绪";
            if (moved >= 0) {
                a.status = L"清理完成，共处理 " + Num(moved) + L" 张图片";
                MessageBoxW(hwnd,
                            (L"清理完成！\n共移动 " + Num(moved) +
                             L" 张未引用图片到备份文件夹。").c_str(),
                            L"清理完成", MB_OK | MB_ICONINFORMATION);
            } else {
                a.status = L"清理过程中发生错误";
                MessageBoxW(hwnd, L"清理过程中发生错误，请查看日志获取详细信息。",
                            L"清理失败", MB_OK | MB_ICONERROR);
            }
            Relayout(a);
            InvalidateRect(hwnd, nullptr, FALSE);
            return 0;
        }

        case WM_DESTROY:
            FreeCards(a.cards);
            DestroyFonts(a);
            PostQuitMessage(0);
            return 0;
    }
    return DefWindowProcW(hwnd, msg, wp, lp);
}

// ---------------------------------------------------------------- 入口
static void EnableDpiAware() {
    typedef BOOL(WINAPI * PFN_SetCtx)(void*);
    HMODULE user32 = GetModuleHandleW(L"user32.dll");
    if (user32) {
        auto f = (PFN_SetCtx)GetProcAddress(user32, "SetProcessDpiAwarenessContext");
        if (f && f((void*)-4)) return;  // DPI_AWARENESS_CONTEXT_SYSTEM_AWARE
    }
    SetProcessDPIAware();
}

int WINAPI WinMain(HINSTANCE hInst, HINSTANCE, LPSTR, int) {
    // CLI 模式优先（供自动化 / 插件降级调用）
    int argc = 0;
    std::wstring preOpen;
    LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    if (argv) {
        int r = mdclean::CliMain(argc, argv);
        for (int i = 1; i + 1 < argc; ++i)
            if (std::wstring(argv[i]) == L"--open") preOpen = argv[i + 1];
        LocalFree(argv);
        if (r >= 0) return r;
    }

    EnableDpiAware();

    Gdiplus::GdiplusStartupInput gi;
    ULONG_PTR token = 0;
    if (Gdiplus::GdiplusStartup(&token, &gi, nullptr) != Gdiplus::Ok) return 1;

    WNDCLASSEXW wc = {0};
    wc.cbSize = sizeof(wc);
    wc.style = CS_HREDRAW | CS_VREDRAW | CS_DBLCLKS;
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInst;
    wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    wc.hIcon = (HICON)LoadImageW(hInst, L"APPICON", IMAGE_ICON, 0, 0, LR_DEFAULTCOLOR);
    wc.hIconSm = (HICON)LoadImageW(hInst, L"APPICON", IMAGE_ICON, 16, 16, LR_DEFAULTCOLOR);
    wc.lpszClassName = L"MDImageCleanerWnd";
    RegisterClassExW(&wc);

    RECT wr = {0, 0, 1200, 750};
    DWORD style = WS_OVERLAPPEDWINDOW;
    AdjustWindowRectEx(&wr, style, FALSE, 0);
    // Qt 的 setGeometry(300,300,...) 指的是客户区，这里要把边框厚度补回去
    int fx = -wr.left, fy = -wr.top;
    HWND hwnd = CreateWindowExW(0, L"MDImageCleanerWnd", L"Typora清理未引用图片",
                                style, 300 - fx, 300 - fy,
                                wr.right - wr.left, wr.bottom - wr.top,
                                nullptr, nullptr, hInst, nullptr);
    if (!hwnd) return 1;
    ShowWindow(hwnd, SW_SHOW);
    UpdateWindow(hwnd);
    if (!preOpen.empty()) DoClean(g, preOpen);

    MSG m;
    while (GetMessageW(&m, nullptr, 0, 0)) {
        TranslateMessage(&m);
        DispatchMessageW(&m);
    }
    Gdiplus::GdiplusShutdown(token);
    return 0;
}
