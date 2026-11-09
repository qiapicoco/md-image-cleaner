# 推送说明（GitHub + Gitee）

代码已经全部提交在本地 `master`（commit `8743f38`），只差推到远端。
两个远端都配好了：

```bash
git remote -v
# origin  git@github.com:qiapicoco/typora-assets-image-cleaner.git
# gitee   https://gitee.com/qiapicoco/typora-assets-image-cleaner.git
```

当前卡在**凭据**上，实测情况：

| 通道 | 结果 |
| --- | --- |
| SSH 22 端口 `git@github.com` | `Connection refused`（网络封了 22） |
| SSH 443 端口 `ssh.github.com` | 通，但 `~/.ssh/id_rsa` 未被 GitHub 授权 → `Permission denied (publickey)` |
| HTTPS 匿名读 | 可以（公开库） |
| HTTPS 写 | 无有效 token（Credential Manager 里没有可用的） |
| Gitee HTTPS 写 | 同样没有可用凭据 |

---

## 方案一：用 HTTPS + 个人令牌（最快，两边通用）

### 1. 建 GitHub 令牌

打开 <https://github.com/settings/tokens/new>（Edge 里已登录的话直接能进）

- **Note**：`md-image-cleaner push`
- **Expiration**：7 days（用完就废，安全）
- **Scopes**：只勾 **`repo`**（`repo` 展开后全部自动勾上）
- 拉到底 → **Generate token** → 复制 `ghp_` 开头那一串

### 2. 建 Gitee 令牌（可选，只推 GitHub 可跳过）

<https://gitee.com/profile/personal_access_tokens/new>

- **描述**：`md-image-cleaner push`
- **权限**：勾 `projects`
- 生成后复制

### 3. 推送

**方式 A：把令牌发我，我来推**（推完我会立刻从配置里清掉，不写进任何文件）

**方式 B：自己跑**（把令牌当密码，账号名是 qiapicoco）

```bash
cd E:/Project/Python/typora-assets-image-cleaner

# GitHub
git push https://qiapicoco:<令牌>@github.com/qiapicoco/typora-assets-image-cleaner.git master

# Gitee
git push https://qiapicoco:<令牌>@gitee.com/qiapicoco/typora-assets-image-cleaner.git master
```

> 令牌会留在 shell 历史里，推完建议 `git credential-manager erase` 清一下，
> 或直接用方案二。

---

## 方案二：SSH 密钥（一次配好，以后不用管）

```bash
# 1. 让 22 端口被墙时走 443
cat >> ~/.ssh/config <<'EOF'
Host github.com
  HostName ssh.github.com
  Port 443
  User git
EOF

# 2. 把公钥内容复制出来
cat ~/.ssh/id_rsa.pub
```

3. 粘贴到 <https://github.com/settings/ssh/new> → Add SSH key

4. 验证并推送：

```bash
ssh -T git@github.com          # 应显示 Hi qiapicoco!
git push origin master
```

> Gitee 的 SSH 走 22 端口，公钥贴到 <https://gitee.com/profile/sshkeys>，
> 然后把 gitee 远端换成 SSH 地址即可。

---

## 方案三：让系统的凭据管理器弹窗（最省事）

在自己的终端里跑一次（会弹 GitHub 登录窗口，点授权）：

```bash
cd E:/Project/Python/typora-assets-image-cleaner
git -c credential.helper=manager push https://github.com/qiapicoco/typora-assets-image-cleaner.git master
```

成功后凭据会被 Windows 凭据管理器记住，之后 `git push origin master` 直接通，
Gitee 同理跑一次 `git push gitee master`。

---

## 推完还需要做的两件事

### 1. 打 tag（本地已建好，一起推）

```bash
git push origin v2.0.0
git push gitee  v2.0.0
```

### 2. 传 Release 附件

构建产物在 `.gitignore` 里（不入库），要手动传到 Release：

| 文件 | 路径 | 体积 |
| --- | --- | --- |
| 安装包 | `desktop/dist/MDImageCleaner_v2.0.0_安装版.exe` | 247 KB |
| 绿色版 | `desktop/dist/MDImageCleaner.exe` | 301 KB |
| VSCode 扩展 | `vscode-extension/dist/md-image-cleaner-2.0.0.vsix` | 8.8 KB |

GitHub：<https://github.com/qiapicoco/typora-assets-image-cleaner/releases/new> → 选 tag `v2.0.0` → 拖附件
Gitee：仓库 → 发行版 → 新建发行版 → 选 tag → 传附件

> Obsidian / Typora 插件不用传附件，`main.js`、`mdImageCleaner.js` 已经在仓库里了，
> 用户直接下载拷进插件目录就行。
