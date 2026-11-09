# 双远端同步说明

代码同时托管在 GitHub 和 Gitee，两边内容一致：

- GitHub：<https://github.com/qiapicoco/md-image-cleaner>
- Gitee：<https://gitee.com/qiapicoco/md-image-cleaner>

## 日常推送

```bash
sh tools/push_all.sh
```

等价于：

```bash
git push origin master --follow-tags   # GitHub
git push gitee  master --follow-tags   # Gitee
```

## 凭据

两个远端都是 HTTPS，凭据存在 Windows 凭据管理器（`git-credential-manager`），
配好一次之后不会再提示输密码。

| 远端 | 地址 | 凭据 | 有效期 |
| --- | --- | --- | --- |
| `origin` | `https://github.com/qiapicoco/md-image-cleaner.git` | GitHub PAT（note: `GitHub-WorkBuddy-key`，仅 `repo` 权限） | 30 天，2026-12-09 到期 |
| `gitee` | `https://gitee.com/qiapicoco/md-image-cleaner.git` | Gitee 私人令牌（note: `Gitee-WorkBuddy-key`） | 永久（可手动设过期） |

> 令牌只存在系统凭据管理器里，不在仓库、不在 git config 明文里。
> 命名统一成 `<平台>-WorkBuddy-key`，换机器时按这个名字在后台核对即可。
>
> - **GitHub**：PAT 名称不能改，只能「新建一个同权限的、再撤销旧的」。
>   新建后记得把新值写进凭据管理器：
>
>   ```bash
>   printf "protocol=https\nhost=github.com\nusername=qiapicoco\npassword=<新令牌>\n\n" | git credential approve
>   ```
>
>   到期前重做一次即可（`git ls-remote origin` 能通就说明凭据是好的）。
> - **Gitee**：私人令牌可以直接改名，路径「设置 → 私人令牌 → 修改」，
>   提交时会要求输入账号密码做安全验证；改完令牌值不变，不用重配凭据。

## 发版流程

1. 改 `desktop/res/app.rc` 里的版本号，同步改 `desktop/build.py` 和安装包脚本
2. `python desktop/build.py`（exe，带体积门禁 600 KB）
3. `python desktop/installer/build_installer.py`（NSIS 安装包）
4. `python tools/build_plugins.py`（三个插件）
5. `git tag -a vX.Y.Z -m "..."` + `sh tools/push_all.sh`
6. 两边各建一个 Release，上传这 5 个附件（用 ASCII 文件名，GitHub 会把中文名吞掉）：

| 附件 | 来源 |
| --- | --- |
| `MDImageCleaner.exe` | `desktop/dist/` |
| `MDImageCleaner_vX.Y.Z_setup.exe` | `desktop/dist/`（中文名副本改成 ASCII 再传） |
| `md-image-cleaner-obsidian-X.Y.Z.zip` | `obsidian-plugin/` 打包 |
| `md-image-cleaner-typora-X.Y.Z.zip` | `typora-plugin/` 打包 |
| `md-image-cleaner-X.Y.Z.vsix` | `vscode-extension/dist/` |

## 关于 Gitee 自动同步 GitHub

试过 Gitee 的「仓库镜像管理」：GitHub OAuth 授权走通了，但回调后跳回 Gitee 首页，
镜像没建成。Gitee 那个页面写明「使用账号需绑定手机号」，估计卡在这。
目前是手动双推，`tools/push_all.sh` 一行搞定。
