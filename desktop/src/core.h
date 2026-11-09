/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 qiapicoco
 * MD Image Cleaner - https://github.com/qiapicoco/md-image-cleaner
 */

// core.h —— 纯函数核心：解析引用 / 扫描目录 / 差集 / 移动 / 日志文案
// 与 legacy/typora_assets_cleaner.py 行为逐字对齐，见 core/SPEC.md。
// 只依赖 windows.h 与 STL，不碰 UI，可被 CLI 与 GUI 共用。
#pragma once

#include <windows.h>
#include <string>
#include <vector>
#include <algorithm>
#include <cstdio>

namespace mdclean {

// ---------------------------------------------------------------- 基础工具
inline std::wstring Num(long long v) { return std::to_wstring(v); }

inline bool EndsWith(const std::wstring& s, const wchar_t* suf) {
    size_t n = wcslen(suf);
    if (s.size() < n) return false;
    return s.compare(s.size() - n, n, suf) == 0;
}

inline std::wstring ToLowerAscii(std::wstring s) {
    for (auto& c : s)
        if (c >= L'A' && c <= L'Z') c = (wchar_t)(c - L'A' + L'a');
    return s;
}

// 对应 Python os.path.basename（ntpath：/ 与 \ 都算分隔符）
inline std::wstring BaseName(const std::wstring& p) {
    size_t i = p.find_last_of(L"/\\");
    return (i == std::wstring::npos) ? p : p.substr(i + 1);
}

inline std::wstring DirName(const std::wstring& p) {
    size_t i = p.find_last_of(L"/\\");
    return (i == std::wstring::npos) ? std::wstring() : p.substr(0, i);
}

// 对应 os.path.splitext(p)[0] + '.assets'
inline std::wstring AssetsDirFor(const std::wstring& md) {
    size_t slash = md.find_last_of(L"/\\");
    size_t dot = md.find_last_of(L'.');
    size_t cut = md.size();
    if (dot != std::wstring::npos && (slash == std::wstring::npos || dot > slash))
        cut = dot;
    return md.substr(0, cut) + L".assets";
}

inline bool PathExists(const std::wstring& p) {
    return GetFileAttributesW(p.c_str()) != INVALID_FILE_ATTRIBUTES;
}

inline bool IsDir(const std::wstring& p) {
    DWORD a = GetFileAttributesW(p.c_str());
    return a != INVALID_FILE_ATTRIBUTES && (a & FILE_ATTRIBUTE_DIRECTORY);
}

inline std::wstring JoinPath(const std::wstring& a, const std::wstring& b) {
    if (a.empty()) return b;
    wchar_t last = a[a.size() - 1];
    if (last == L'\\' || last == L'/') return a + b;
    return a + L"\\" + b;
}

// 图片扩展名白名单（与 Python 端 tuple 完全一致，含 svg/tiff/webp）
inline bool IsImageExt(const std::wstring& name) {
    std::wstring s = ToLowerAscii(name);
    static const wchar_t* kExt[] = {L".png", L".jpg", L".jpeg", L".bmp",
                                    L".svg", L".tiff", L".webp", L".gif"};
    for (auto e : kExt)
        if (EndsWith(s, e)) return true;
    return false;
}

inline double NowSeconds() {
    LARGE_INTEGER f, c;
    QueryPerformanceFrequency(&f);
    QueryPerformanceCounter(&c);
    return (double)c.QuadPart / (double)f.QuadPart;
}

inline std::wstring FormatElapsed(double sec) {
    wchar_t buf[64];
    swprintf(buf, 64, L"%.2f", sec);
    return buf;
}

// 严格 UTF-8 解码：非法字节返回 false（对应 Python UnicodeDecodeError 分支）
inline bool Utf8ToWide(const std::string& in, std::wstring* out) {
    if (in.empty()) { out->clear(); return true; }
    int n = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, in.data(),
                                (int)in.size(), nullptr, 0);
    if (n <= 0) return false;
    out->resize((size_t)n);
    int r = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, in.data(),
                                (int)in.size(), &(*out)[0], n);
    if (r <= 0) return false;
    return true;
}

inline std::string WideToUtf8(const std::wstring& in) {
    if (in.empty()) return std::string();
    int n = WideCharToMultiByte(CP_UTF8, 0, in.data(), (int)in.size(),
                                nullptr, 0, nullptr, nullptr);
    std::string s((size_t)n, 0);
    WideCharToMultiByte(CP_UTF8, 0, in.data(), (int)in.size(), &s[0], n, nullptr, nullptr);
    return s;
}

// ---------------------------------------------------------------- 文案（集中，便于比对）
namespace text {
inline std::wstring StartAnalysis(const std::wstring& base) {
    return L"开始分析文件: " + base + L"\n";
}
inline const wchar_t* kWarnNoRef()  { return L"警告: 在Markdown文件中未找到引用的图片\n"; }
inline std::wstring ErrNoImages(const std::wstring& assets) {
    return L"错误: 在 " + assets + L" 中未找到图片文件\n";
}
inline std::wstring FoundImages(const std::wstring& assets, size_t n) {
    return L"在 " + assets + L" 中找到 " + Num((long long)n) + L" 张图片\n";
}
inline std::wstring UnusedCount(size_t n) {
    return L"其中 " + Num((long long)n) + L" 张图片未在Markdown中引用\n";
}
inline const wchar_t* kNoNeedClean()      { return L"没有需要清理的图片\n"; }
inline const wchar_t* kBeginClean()       { return L"开始清理未引用的图片...\n"; }
inline std::wstring CreatedBackupDir(const std::wstring& d) {
    return L"创建备份文件夹: " + d + L"\n";
}
inline std::wstring Moved(const std::wstring& f) {
    return L"已移动: " + f + L" -> deleted_images\n";
}
inline std::wstring FileGone(const std::wstring& f) {
    return L"文件不存在: " + f + L" (已被移动?)\n";
}
inline std::wstring MoveFailed(const std::wstring& f, const std::wstring& e) {
    return L"错误: 无法移动 " + f + L": " + e + L"\n";
}
inline std::wstring Done(double sec) {
    return L"\n清理完成！耗时: " + FormatElapsed(sec) + L" 秒\n";
}
inline std::wstring TotalMoved(size_t n) {
    return L"共移动 " + Num((long long)n) + L" 张未引用的图片到备份文件夹\n";
}
inline std::wstring Fatal(const std::wstring& e) { return L"致命错误: " + e + L"\n"; }
inline std::wstring ErrMdMissing(const std::wstring& p) {
    return L"错误: 文件 " + p + L" 未找到\n";
}
inline std::wstring ErrRead(const std::wstring& e) {
    return L"错误: 读取文件时发生异常: " + e + L"\n";
}
inline std::wstring ErrNoAssets(const std::wstring& p) {
    return L"错误: 文件夹 " + p + L" 不存在\n";
}
inline std::wstring ErrScan(const std::wstring& e) {
    return L"错误: 扫描文件夹时发生异常: " + e + L"\n";
}

// 进度文案
inline const wchar_t* kPrepareAnalyze() { return L"准备分析..."; }
inline const wchar_t* kFindingRefs()    { return L"正在查找引用图片..."; }
inline const wchar_t* kAnalyzing()      { return L"正在分析图片引用..."; }
inline const wchar_t* kPreparingPrev()  { return L"正在准备预览..."; }
inline const wchar_t* kPreviewReady()   { return L"预览准备完成"; }
inline const wchar_t* kPrepareClean()   { return L"准备清理..."; }
inline const wchar_t* kTidying()        { return L"正在整理结果..."; }
inline const wchar_t* kCleanDone()      { return L"清理完成"; }
inline const wchar_t* kOpDone()         { return L"操作完成"; }
inline std::wstring FoundUnused(size_t n) {
    return L"找到 " + Num((long long)n) + L" 张未引用的图片";
}
inline std::wstring CleaningProgress(size_t i, size_t n) {
    return L"已清理 " + Num((long long)i) + L"/" + Num((long long)n);
}
}  // namespace text

// ---------------------------------------------------------------- 正则等价实现
// 等价于 Python：findall(r'!\[.*?\]\((.*?)\)') + findall(r'\[.*?\]\((.*?)\)')
// 语义：'.' 不跨 \n；两组都非贪婪；匹配结束后从匹配末尾继续。
inline void MatchPattern(const std::wstring& s, const std::wstring& prefix,
                         std::vector<std::wstring>* out) {
    const size_t n = s.size();
    const size_t plen = prefix.size();
    size_t i = 0;
    while (i < n) {
        if (i + plen <= n && s.compare(i, plen, prefix) == 0) {
            bool matched = false;
            size_t j = i + plen;
            while (j < n && s[j] != L'\n') {
                if (s[j] == L']' && j + 1 < n && s[j + 1] == L'(') {
                    size_t capStart = j + 2, k = capStart;
                    while (k < n && s[k] != L')' && s[k] != L'\n') ++k;
                    if (k < n && s[k] == L')') {
                        out->push_back(s.substr(capStart, k - capStart));
                        i = k + 1;
                        matched = true;
                        break;
                    }
                }
                ++j;
            }
            if (matched) continue;
        }
        ++i;
    }
}

// 解析 md 取引用图片名（去重保序；Python 版是 list(set())，顺序不稳定，见 SPEC）
inline std::vector<std::wstring> ExtractUsedFromText(const std::wstring& content) {
    std::vector<std::wstring> caps, names;
    MatchPattern(content, L"![", &caps);
    MatchPattern(content, L"[", &caps);
    for (const auto& c : caps) {
        std::wstring name = BaseName(c);
        if (IsImageExt(name)) {
            bool dup = false;
            for (const auto& e : names)
                if (e == name) { dup = true; break; }
            if (!dup) names.push_back(name);
        }
    }
    return names;
}

// ---------------------------------------------------------------- 扫描 / 移动
struct ScanOutcome {
    std::vector<std::wstring> used;
    std::vector<std::wstring> all;
    std::vector<std::wstring> unused;
    std::wstring assetsDir;
    bool ok = false;
};

// 目录枚举（等价 os.scandir：只要文件，按文件系统顺序）
inline bool ScanAssets(const std::wstring& dir, std::vector<std::wstring>* out) {
    if (!IsDir(dir)) return false;
    WIN32_FIND_DATAW fd;
    std::wstring pat = JoinPath(dir, L"*");
    HANDLE h = FindFirstFileW(pat.c_str(), &fd);
    if (h == INVALID_HANDLE_VALUE) return true;  // 空目录
    do {
        if (wcscmp(fd.cFileName, L".") == 0 || wcscmp(fd.cFileName, L"..") == 0)
            continue;
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) continue;
        if (!IsImageExt(fd.cFileName)) continue;
        out->push_back(fd.cFileName);
    } while (FindNextFileW(h, &fd));
    FindClose(h);
    return true;
}

// ---------------------------------------------------------------- 任务回调
struct JobSink {
    virtual ~JobSink() {}
    virtual void OnLog(const std::wstring& s) = 0;
    virtual void OnProgress(int v, const std::wstring& t) = 0;
    virtual void OnPreview(const std::wstring& path, bool used) = 0;
    virtual void OnStats(int unused, int used) = 0;
    virtual void OnFinish(int moved) = 0;
    // GUI 用它等缩略图读完再动文件，避免"预览成灰块"
    virtual void FlushPreview() {}
};

struct JobResult {
    std::vector<std::wstring> used, all, unused;
    std::wstring assetsDir;
    int statsUnused = 0, statsUsed = 0;
    int moved = 0;
};

// 主流程，逐行对应 Python 的 CleaningThread.run()
inline JobResult RunClean(const std::wstring& mdFile, JobSink& sink,
                          bool execute = true, JobResult* outResult = nullptr) {
    JobResult res;
    const double t0 = NowSeconds();
    const std::wstring assetsDir = AssetsDirFor(mdFile);
    res.assetsDir = assetsDir;

    sink.OnLog(text::StartAnalysis(BaseName(mdFile)));
    sink.OnProgress(5, text::kPrepareAnalyze());

    // ---- 读文件
    bool readOk = true;
    std::wstring content;
    {
        HANDLE h = CreateFileW(mdFile.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr,
                               OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (h == INVALID_HANDLE_VALUE) {
            DWORD e = GetLastError();
            if (e == ERROR_FILE_NOT_FOUND || e == ERROR_PATH_NOT_FOUND) {
                sink.OnLog(text::ErrMdMissing(mdFile));
            } else {
                sink.OnLog(text::ErrRead(L"无法打开文件 (错误码 " + Num(e) + L")"));
            }
            readOk = false;
        } else {
            LARGE_INTEGER li;
            GetFileSizeEx(h, &li);
            std::string raw((size_t)li.QuadPart, 0);
            DWORD got = 0;
            if (li.QuadPart > 0) ReadFile(h, &raw[0], (DWORD)li.QuadPart, &got, nullptr);
            raw.resize(got);
            CloseHandle(h);
            if (!Utf8ToWide(raw, &content)) {
                sink.OnLog(text::ErrRead(L"文件不是合法的 UTF-8 编码"));
                readOk = false;
            }
        }
    }
    if (readOk) res.used = ExtractUsedFromText(content);

    sink.OnProgress(15, text::kFindingRefs());
    if (res.used.empty()) sink.OnLog(text::kWarnNoRef());

    // ---- 扫描
    res.all.clear();
    if (!IsDir(assetsDir)) {
        sink.OnLog(text::ErrNoAssets(assetsDir));
        ScanAssets(assetsDir, &res.all);  // 返回空
    } else {
        ScanAssets(assetsDir, &res.all);
    }
    if (res.all.empty()) {
        sink.OnLog(text::ErrNoImages(assetsDir));
        sink.OnProgress(100, text::kOpDone());
        sink.OnFinish(0);
        if (outResult) *outResult = res;
        return res;
    }

    sink.OnLog(text::FoundImages(assetsDir, res.all.size()));
    sink.OnProgress(20, text::kAnalyzing());

    res.unused.clear();
    for (const auto& img : res.all) {
        bool used = false;
        for (const auto& u : res.used)
            if (u == img) { used = true; break; }
        if (!used) res.unused.push_back(img);
    }
    res.statsUnused = (int)res.unused.size();
    res.statsUsed = (int)res.used.size();
    sink.OnStats(res.statsUnused, res.statsUsed);

    sink.OnProgress(25, text::FoundUnused(res.unused.size()));
    sink.OnLog(text::UnusedCount(res.unused.size()));

    // ---- 预览阶段 25 → 40（含原版的进度回跳，保持视觉一致）
    const int totalImages = (int)res.all.size();
    const int previewBase = 25, previewRange = 15;
    for (size_t i = 0; i < res.unused.size(); ++i) {
        sink.OnPreview(JoinPath(assetsDir, res.unused[i]), false);
        int denom = (int)res.unused.size() - 1;
        if (denom < 1) denom = 1;
        int p = previewBase + (previewRange * (int)i) / denom;
        sink.OnProgress(p, text::kPreparingPrev());
    }
    for (size_t i = 0; i < res.used.size(); ++i) {
        sink.OnPreview(JoinPath(assetsDir, res.used[i]), true);
        int denom = totalImages - 1;
        if (denom < 1) denom = 1;
        int p = previewBase + (previewRange * ((int)i + (int)res.unused.size())) / denom;
        sink.OnProgress(p, text::kPreparingPrev());
    }
    sink.OnProgress(40, text::kPreviewReady());
    sink.FlushPreview();  // GUI 在此把缩略图读完，之后才动文件

    if (res.unused.empty()) {
        sink.OnLog(text::kNoNeedClean());
        sink.OnProgress(100, text::kCleanDone());
        sink.OnFinish(0);
        if (outResult) *outResult = res;
        return res;
    }

    // ---- 清理阶段 50 → 95
    const std::wstring deletedDir = JoinPath(assetsDir, L"deleted_images");
    sink.OnLog(text::kBeginClean());
    sink.OnProgress(45, text::kPrepareClean());

    const size_t nb = res.unused.size();
    for (size_t i = 0; i < nb; ++i) {
        // 只有真的要搬文件时才建目录：--check 模式必须做到零副作用
        if (execute && i == 0 && !PathExists(deletedDir)) {
            if (CreateDirectoryW(deletedDir.c_str(), nullptr))
                sink.OnLog(text::CreatedBackupDir(deletedDir));
            else
                sink.OnLog(text::MoveFailed(L"deleted_images", L"无法创建备份文件夹"));
        }
        const std::wstring src = JoinPath(assetsDir, res.unused[i]);
        const std::wstring dst = JoinPath(deletedDir, res.unused[i]);
        if (execute) {
            if (PathExists(src)) {
                if (MoveFileW(src.c_str(), dst.c_str()))
                    sink.OnLog(text::Moved(res.unused[i]));
                else {
                    DWORD e = GetLastError();
                    wchar_t* buf = nullptr;
                    FormatMessageW(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM |
                                       FORMAT_MESSAGE_IGNORE_INSERTS,
                                   nullptr, e, MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
                                   (LPWSTR)&buf, 0, nullptr);
                    std::wstring msg = buf ? buf : L"未知错误";
                    if (buf) LocalFree(buf);
                    while (!msg.empty() && (msg.back() == L'\r' || msg.back() == L'\n'))
                        msg.pop_back();
                    sink.OnLog(text::MoveFailed(res.unused[i], msg));
                }
            } else {
                sink.OnLog(text::FileGone(res.unused[i]));
            }
        } else {
            sink.OnLog(text::Moved(res.unused[i]));  // check 模式：只报不搬
        }
        int denom = (int)nb - 1;
        if (denom < 1) denom = 1;
        sink.OnProgress(50 + (45 * (int)i) / denom, text::CleaningProgress(i + 1, nb));
    }

    res.moved = (int)nb;
    sink.OnLog(text::Done(NowSeconds() - t0));
    sink.OnLog(text::TotalMoved(nb));
    sink.OnProgress(98, text::kTidying());
    sink.OnProgress(100, text::kCleanDone());
    sink.OnFinish((int)nb);
    if (outResult) *outResult = res;
    return res;
}

}  // namespace mdclean
