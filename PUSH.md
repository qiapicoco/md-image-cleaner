# 仓库与同步说明

**GitHub 是主仓库，Gitee 是它的镜像。** 所有提交只往 GitHub 推，Gitee 由镜像自动跟进。

- GitHub（主）：<https://github.com/qiapicoco/md-image-cleaner>
- Gitee（镜像）：<https://gitee.com/qiapicoco/md-image-cleaner>

## 日常推送

```bash
git push origin master --follow-tags
```

就这样，不用管 Gitee。Gitee 侧配了 **Pull 镜像**（方向：GitHub → Gitee），
会在后台把 GitHub 的分支、标签、提交拉过来。

想立刻看到效果，就去 Gitee 的「管理 → 仓库镜像管理」点那一行的 **更新**，
确认后一般几秒完成；碰上 Gitee 排队，状态会显示「更新中」，可能拖到几分钟，
这时别干等，直接 `sh tools/push_all.sh` 推一次。

## 为什么还留着双推脚本

镜像的「提交即触发」依赖 GitHub 侧 webhook，而建 webhook 需要 PAT 带
`admin:repo_hook` 权限。当前令牌只有 `repo`，所以 Gitee 只能按自己的定时任务
异步跟进，不是秒级。

要发版、或者刚推完就想让两边立刻一致时，直接双推，别等：

```bash
sh tools/push_all.sh
```

等价于：

```bash
git push origin master --follow-tags   # GitHub，主
git push gitee  master --follow-tags   # Gitee，兜底
```

> 注意：Gitee 是 Pull 镜像。往 Gitee 直接推的内容，下一次镜像同步会被
> GitHub 覆盖。**改动一律提交到 GitHub**，Gitee 只当作分发渠道。

## 凭据

两个远端都是 HTTPS，凭据存在 Windows 凭据管理器（`git-credential-manager`），
配好一次之后不会再提示输密码。

| 远端 | 地址 | 凭据 | 有效期 |
| --- | --- | --- | --- |
| `origin` | `https://github.com/qiapicoco/md-image-cleaner.git` | GitHub PAT（note: `GitHub-WorkBuddy-key`，`repo` 权限） | 30 天，2026-12-09 到期 |
| `gitee` | `https://gitee.com/qiapicoco/md-image-cleaner.git` | Gitee 私人令牌（note: `Gitee-WorkBuddy-key`） | 永久（可手动设过期） |

> Gitee 镜像另外单独存了一份 GitHub PAT（填在镜像配置里，需要 `repo` 权限；
> 要连 webhook 一起自动建，得加 `admin:repo_hook`）。
>
> 令牌只存在系统凭据管理器与镜像配置里，不在仓库、不在 git config 明文里。
> 命名统一成 `<平台>-WorkBuddy-key`，换机器时按这个名字在后台核对即可。
>
> - **GitHub**：PAT 名称不能改，只能「新建一个同权限的、再撤销旧的」。
>   新建后把新值写回凭据管理器：
>
>   ```bash
>   printf "protocol=https\nhost=github.com\nusername=qiapicoco\npassword=<新令牌>\n\n" | git credential approve
>   ```
>
>   到期前重做一次即可（`git ls-remote origin` 能通就说明凭据是好的）。
>   换完令牌记得同步更新 Gitee 镜像配置里的那一份。
> - **Gitee**：私人令牌可以直接改名，路径「设置 → 私人令牌 → 修改」，
>   提交时会要求输入账号密码做安全验证；改完令牌值不变，不用重配凭据。

## 发版流程

1. 改 `desktop/res/app.rc` 里的版本号，同步改 `desktop/build.py` 和安装包脚本
2. `python desktop/build.py`（exe，带体积门禁 600 KB）
3. `python desktop/installer/build_installer.py`（NSIS 安装包）
4. `python tools/build_plugins.py`（三个插件）
5. `git tag -a vX.Y.Z -m "..."` + `git push origin master --follow-tags`
6. 在 GitHub 建 Release，上传这 5 个附件（用 ASCII 文件名，GitHub 会把中文名吞掉）：
7. Gitee 侧点一次镜像「更新」，标签会跟过来，再在 Gitee 建 Release 挂同样的附件

| 附件 | 来源 |
| --- | --- |
| `MDImageCleaner.exe` | `desktop/dist/` |
| `MDImageCleaner_vX.Y.Z_setup.exe` | `desktop/dist/`（中文名副本改成 ASCII 再传） |
| `md-image-cleaner-obsidian-X.Y.Z.zip` | `obsidian-plugin/` 打包 |
| `md-image-cleaner-typora-X.Y.Z.zip` | `typora-plugin/` 打包 |
| `md-image-cleaner-X.Y.Z.vsix` | `vscode-extension/dist/` |

## 改名记录

仓库原来叫 `typora-assets-image-cleaner`，2026-11-09 改为 `md-image-cleaner`。
两边都保留重定向（实测 GitHub 301、Gitee 302 跳新地址），已发出的 Release
下载链接和 README 里的旧链接都还能用。
