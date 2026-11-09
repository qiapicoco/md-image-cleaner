// cli.h —— 命令行入口 + JSON 输出（供核心自测、Typora 插件降级调用）
// 用法：
//   MDImageCleaner.exe --check  <file.md> [--json] [--out <path>]   只分析不移动
//   MDImageCleaner.exe --apply  <file.md> [--json] [--out <path>]   分析并移动
//   MDImageCleaner.exe          （无参数）                          启动 GUI
#pragma once

#include <windows.h>
#include <shellapi.h>
#include <string>
#include <vector>
#include <cstdio>

#include "core.h"

namespace mdclean {
namespace cli {

inline std::string JsonEscape(const std::wstring& w) {
    std::string s = WideToUtf8(w), o;
    o.reserve(s.size() + 8);
    for (unsigned char c : s) {
        switch (c) {
            case '"':  o += "\\\""; break;
            case '\\': o += "\\\\"; break;
            case '\n': o += "\\n"; break;
            case '\r': o += "\\r"; break;
            case '\t': o += "\\t"; break;
            default:
                if (c < 0x20) { char b[8]; sprintf(b, "\\u%04x", c); o += b; }
                else o += (char)c;
        }
    }
    return o;
}

inline std::vector<std::wstring> ListFilesSorted(const std::wstring& dir) {
    std::vector<std::wstring> v;
    WIN32_FIND_DATAW fd;
    HANDLE h = FindFirstFileW(JoinPath(dir, L"*").c_str(), &fd);
    if (h == INVALID_HANDLE_VALUE) return v;
    do {
        if (wcscmp(fd.cFileName, L".") == 0 || wcscmp(fd.cFileName, L"..") == 0) continue;
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) continue;
        v.push_back(fd.cFileName);
    } while (FindNextFileW(h, &fd));
    FindClose(h);
    std::sort(v.begin(), v.end());
    return v;
}

inline std::wstring NormalizeLog(const std::wstring& s, const std::wstring& root) {
    std::wstring o = s;
    if (!root.empty()) {
        for (size_t p = o.find(root); p != std::wstring::npos; p = o.find(root, p + 10))
            o.replace(p, root.size(), L"<FIXTURE>");
    }
    size_t k = o.find(L"耗时: ");
    if (k != std::wstring::npos) {
        size_t e = o.find(L" 秒", k);
        if (e != std::wstring::npos) o.replace(k + 4, e - (k + 4), L"<T>");
    }
    return o;
}

class Collector : public JobSink {
public:
    std::vector<std::wstring> logs;
    std::vector<std::pair<int, std::wstring>> progress;
    std::vector<std::pair<std::wstring, bool>> previews;
    int statsU = 0, statsS = 0, finished = 0;

    void OnLog(const std::wstring& s) override { logs.push_back(s); }
    void OnProgress(int v, const std::wstring& t) override { progress.push_back({v, t}); }
    void OnPreview(const std::wstring& p, bool used) override {
        previews.push_back({BaseName(p), used});
    }
    void OnStats(int u, int s) override { statsU = u; statsS = s; }
    void OnFinish(int n) override { finished = n; }
};

inline std::string BuildJson(const Collector& c, const std::wstring& md,
                             const JobResult& res, const std::wstring& root) {
    std::string o = "{\n";
    o += "  \"logs\": [";
    for (size_t i = 0; i < c.logs.size(); ++i) {
        o += (i ? ",\n    \"" : "\n    \"");
        o += JsonEscape(NormalizeLog(c.logs[i], root));
        o += "\"";
    }
    o += c.logs.empty() ? "],\n" : "\n  ],\n";

    o += "  \"progress\": [";
    for (size_t i = 0; i < c.progress.size(); ++i) {
        char b[16];
        sprintf(b, "%d", c.progress[i].first);
        o += (i ? ",\n    [" : "\n    [");
        o += b;
        o += ", \"";
        o += JsonEscape(c.progress[i].second);
        o += "\"]";
    }
    o += c.progress.empty() ? "],\n" : "\n  ],\n";

    o += "  \"previews\": [";
    for (size_t i = 0; i < c.previews.size(); ++i) {
        o += (i ? ",\n    [\"" : "\n    [\"");
        o += JsonEscape(c.previews[i].first);
        o += c.previews[i].second ? "\", true]" : "\", false]";
    }
    o += c.previews.empty() ? "],\n" : "\n  ],\n";

    o += "  \"stats\": [" + std::to_string(c.statsU) + ", " + std::to_string(c.statsS) + "],\n";
    o += "  \"finished\": " + std::to_string(c.finished) + ",\n";
    o += "  \"moved\": " + std::to_string(res.moved) + ",\n";

    o += "  \"finalAssets\": [";
    auto fa = ListFilesSorted(res.assetsDir);
    for (size_t i = 0; i < fa.size(); ++i) {
        o += (i ? ",\n    \"" : "\n    \"");
        o += JsonEscape(fa[i]);
        o += "\"";
    }
    o += fa.empty() ? "],\n" : "\n  ],\n";

    o += "  \"finalDeleted\": [";
    auto fd = ListFilesSorted(JoinPath(res.assetsDir, L"deleted_images"));
    for (size_t i = 0; i < fd.size(); ++i) {
        o += (i ? ",\n    \"" : "\n    \"");
        o += JsonEscape(fd[i]);
        o += "\"";
    }
    o += fd.empty() ? "]\n" : "\n  ]\n";
    o += "}\n";
    return o;
}

inline void WriteOut(const std::string& text, const std::wstring& outPath) {
    if (!outPath.empty()) {
        HANDLE h = CreateFileW(outPath.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS,
                               FILE_ATTRIBUTE_NORMAL, nullptr);
        if (h != INVALID_HANDLE_VALUE) {
            DWORD w = 0;
            WriteFile(h, text.data(), (DWORD)text.size(), &w, nullptr);
            CloseHandle(h);
        }
        return;
    }
    HANDLE h = GetStdHandle(STD_OUTPUT_HANDLE);
    if (h && h != INVALID_HANDLE_VALUE) {
        DWORD w = 0;
        WriteFile(h, text.data(), (DWORD)text.size(), &w, nullptr);
    }
}

}  // namespace cli

// 返回 -1 表示"不是 CLI 调用"（交给 GUI）
inline int CliMain(int argc, wchar_t** argv) {
    std::wstring mode, md, out;
    bool json = false;
    for (int i = 1; i < argc; ++i) {
        std::wstring a = argv[i];
        if (a == L"--check") mode = L"check";
        else if (a == L"--apply") mode = L"apply";
        else if (a == L"--json") json = true;
        else if (a == L"--out" && i + 1 < argc) out = argv[++i];
        else if (!a.empty() && a[0] != L'-' && md.empty()) md = a;
    }
    if (mode.empty()) return -1;
    if (md.empty()) {
        cli::WriteOut("usage: --check|--apply <file.md> [--json] [--out <path>]\n", L"");
        return 2;
    }
    cli::Collector c;
    JobResult res;
    RunClean(md, c, mode == L"apply", &res);
    if (json) {
        std::wstring root = DirName(md);
        if (!root.empty() && root.back() == L'\\') root.pop_back();
        cli::WriteOut(cli::BuildJson(c, md, res, root), out);
    } else {
        std::string s;
        for (const auto& l : c.logs) s += WideToUtf8(l) + "\n";
        cli::WriteOut(s, out);
    }
    return 0;
}

}  // namespace mdclean
