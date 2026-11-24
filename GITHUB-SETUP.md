# 从源码到 Release：VSCode 查看 → 推 GitHub → 自动构建 → 下载运行

> 本文件面向「拿到源码 zip 后，想在 VSCode 里看代码、传到自己的 GitHub 仓库、由 Actions 构建发行包、下载到本地直接运行」的完整流程。上游文档见 [`README.md`](README.md)，本版定制说明见 [`README-CUSTOM.md`](README-CUSTOM.md)。

---

## 0 · 先决定：仓库设为 Private（强烈建议）

这一步比后面所有步骤都重要，请先读完。

| 事实 | 影响 |
| --- | --- |
| 项目 `docs/` 内含 `API_CONTRACT.md`、`login-research.md`、`token-lifetimes-and-renewal.md` 等**非公开接口的契约与抓包研究资料** | 公开仓库等于公开这些资料 |
| 登录所用 `client_id=101444301` **并非本项目注册**，上游免责声明写明「尚未取得公开分发所需授权，仅供内部研究测试」 | 公开分发安装包与「内部研究测试」定位冲突 |
| 本 CI 在 **每次 push 到 `main` 时会自动创建/刷新 Release 并附上未签名安装包** | 公开仓库 → 自动公开分发，不需要你额外确认 |
| 华为官方会在登录场景采集设备标识做风控，存在异常帐号冻结/清理条款 | 与仓库可见性无关，但请一并读完 `README-CUSTOM.md` 的账号安全节 |

**建议**：GitHub 新建仓库时选 **Private**。私有仓库的 Release 附件同样可以正常下载，只是仅你自己可见；这既满足「自己构建、自己下载使用」，也和项目定位一致。

- 额度：GitHub Free 账号私有仓库每月约 2000 分钟 Actions，单次 Windows 构建约 5–10 分钟，个人使用完全够。
- 许可：AGPL-3.0 允许你自用与修改；**私有仓库里自用不构成公开分发**。若将来要公开分发衍生作品，必须同样以 AGPL-3.0 提供完整对应源码，并自行完成服务条款、应用身份与商标方面的合规评估。
- 若你已决定公开，请先删减/审阅 `docs/` 内容，并理解 Release 会自动带上安装包。

---

## 1 · 在 VSCode 里查看代码

1. 解压 `HuaweiMusic-Source-v0.0.2.zip`，得到文件夹 `huawei-music-desktop/`。
2. VSCode → **文件 → 打开文件夹…** → 选这个文件夹（不是选里面的某个文件）。
3. 弹出「是否信任此文件夹的作者」时选**信任**（否则 TypeScript/调试功能受限）。
4. 可选扩展：`GitHub Pull Requests`、`GitLens`、`Error Lens`。TypeScript / JavaScript 支持是内置的，不必额外装。
5. 想直接跑起来看界面，在 VSCode 终端（<code>Ctrl + `</code>）里：

```powershell
npm ci          # 需 Node.js 22.15+，首次约 1–3 分钟
npm start       # 会先构建再启动 Electron 窗口（Windows 有桌面，可直接看到）
```

### 代码地图（先看这些）

| 路径 | 作用 |
| --- | --- |
| `src/main/` | Electron 主进程：窗口、托盘、全局媒体键、IPC、凭据存储 |
| `src/main/huawei.ts` | 华为 OAuth 登录与音乐会话（本版移除了 refresh_token 落盘） |
| `src/main/settings.mjs` | 设置默认值与输入校验 |
| `src/renderer/App.tsx` | 播放器状态机：队列、播放结束、收藏、心动模式接入 |
| `src/renderer/heartbeat.mjs` | **本版新增**：纯本地相似度推荐算法（15 项单测） |
| `src/renderer/pages.tsx` / `components.tsx` | 各页面、播放条、设置页（含「账号安全」页与 ✦ 按钮） |
| `src/shared/` | 主/渲染进程共享的类型、IPC channel、音质定义 |
| `test/*.test.mjs` | 220 项离线单元测试，`node --test` 直接跑 |
| `scripts/build-desktop.mjs` | 原生平台打包（NSIS / AppImage / DMG） |
| `scripts/build-portable-win.mjs` | **本版新增**：免安装便携目录 + zip |
| `.github/workflows/windows-installer.yml` | **本版增强**：Windows 自动构建与 Release 发布 |
| `README-CUSTOM.md` | 本版改了什么、心动模式原理、风险与许可义务 |

---

## 2 · 创建 GitHub 仓库

1. 登录 GitHub → 右上角 **+** → **New repository**。
2. Repository name 自定（例如 `huawei-music-desktop`），可见性选 **Private**。
3. **不要**勾选 `Add a README file` / `Add .gitignore` / `Choose a license` —— 本地都已有，勾了会造成首次推送冲突。
4. 点 **Create repository**，复制仓库地址 `https://github.com/<你的用户名>/<仓库名>.git`。

> 源码 zip **不含 `.git` 目录**（上游远程地址指向别人仓库，带上去容易误推）。所以下一步要 `git init`，由你自己的 GitHub 身份生成第一个提交。

---

## 3 · 推送代码

### 方式 A：命令行（推荐）

在 VSCode 终端里，位于 `huawei-music-desktop/` 目录下：

```bash
git init
git branch -M main                 # 必须是 main：workflow 只监听 main 分支的 push
git add .
git commit -m "feat: 定制版（心动模式 + 账号安全加固 + 便携版 CI）"
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

`.gitignore` 已忽略 `node_modules/`、`out/`、`release/`、`dist/`、`.env*`、`research/`、`.local/`，所以提交的是纯源码与配置，不会把几百 MB 依赖或本地会话资料传上去。

**认证**：GitHub 已不支持账号密码推送。任选一种：

- **VSCode 内置登录**（最省事）：首次 push 会弹窗引导浏览器授权；
- **GitHub CLI**：`gh auth login` 后直接 push；
- **Personal Access Token**：GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens，给该仓库 `Contents: Read and write` 权限，推送时把 token 当密码用。

### 方式 B：VSCode 图形界面

左侧「源代码管理」→ **初始化仓库** → 输入提交信息并**提交** → `…` 菜单 → **远程 → 添加远程仓库**（贴上面的 URL，命名 `origin`）→ **推送**（首次会引导 GitHub 登录）。记得先把分支改名为 `main`（左下角分支名点一下可改名）。

---

## 4 · 触发自动构建

推送到 `main` 后，Actions 会自动开跑。三种触发方式：

| 方式 | 操作 | 说明 |
| --- | --- | --- |
| 自动 | `git push origin main` | workflow 监听 `main` 的 push，自动构建并刷新 Release |
| 打 tag | `git tag v0.0.2 && git push origin v0.0.2` | tag 必须**等于** `package.json` 的 `version`，否则 workflow 显式报错 |
| 手动 | 仓库 **Actions** 页 → `Windows installer build (unsigned)` → **Run workflow** | 不想改代码也能重跑；可勾选 `smoke` 跑 Electron 冒烟（更耗时） |

CI 在 `windows-latest` 上依次做：

```
npm ci
npm test                      # 220 项离线单元测试
npm run dist:win              # NSIS 安装包（内部含 typecheck + build）
npm run dist:win:portable     # 免安装便携目录 → zip
静态校验安装包 + 校验 zip 内含 exe 与 resources/app.asar
生成 SHA256SUMS（同时覆盖 .exe 与 .zip）
自动创建 / 刷新 GitHub Release 并上传三个附件
```

首次约 5–10 分钟（要下载 Electron 运行时与 NSIS 工具链，之后有缓存会快很多）。到 **Actions** 页看绿色勾即可；失败就点开对应 step 看日志。

> 这一步正好解决了「安装包必须在原生 Windows 上构建」的限制：GitHub 提供的就是真 Windows 机器，你本地是 Mac/Linux 也能出 Windows 包。

---

## 5 · 下载并在本地直接运行

构建成功后到仓库 **Releases** 页，会看到三个附件：

| 附件 | 用途 |
| --- | --- |
| `...-setup-internal.exe` | NSIS 安装向导，可自选目录、开始菜单启动 |
| `HuaweiMusic-Windows-Portable-v0.0.2.zip` | **推荐**：免安装，解压双击即用，不写注册表 |
| `SHA256SUMS` | 校验值 |

1. 先核对校验值（在下载目录 Shift+右键 → PowerShell）：
   ```powershell
   Get-FileHash .\HuaweiMusic-Windows-Portable-v0.0.2.zip -Algorithm SHA256
   ```
   与 `SHA256SUMS` 里对应行比对，一致再运行。
2. 把 zip **解压到一个新建文件夹**（例如 `D:\华为音乐`），别直接解压在桌面。
3. 双击里面的 `HuaweiMusic.exe`（文件名统一为 ASCII，避免部分解压软件把中文名显示成乱码）。未签名会被 SmartScreen 拦：点「更多信息」→「仍要运行」，**不要关闭系统防护**。
4. 点「扫码登录」用手机扫码。登录页必须是华为官方域名（`id.huawei.com` / `oauth-login.platform.hicloud.com`），出现任何第三方域名立即关闭。
5. 会话约 **7 天**过期，重新扫码即可。退出走右下角托盘图标右键菜单（关窗口默认最小化到托盘）。

卸载便携版 = 退出程序后删掉解压文件夹；如需清除配置，再删 `%APPDATA%\huawei-music-desktop`。

---

## 6 · 常见问题

| 现象 | 处理 |
| --- | --- |
| push 后 Actions 没反应 | ① 分支是否叫 `main`；② 仓库 Settings → Actions → General → 确认 Actions 已启用；③ `.github/workflows/windows-installer.yml` 是否确实在仓库根目录 |
| Release 发布报 403 / `gh` 权限错误 | Settings → Actions → General → **Workflow permissions** 选 **Read and write permissions**；workflow 已声明 `permissions: contents: write` |
| 报错 `tag vX 与 package.json version 不一致` | 改 tag，或先改 `package.json` 的 `version` 再打同名 tag |
| 只想要产物不想发 Release | 手动触发时把 `release` 输入设为 `false`，产物会作为 Actions Artifact 提供下载（保留 3 天） |
| `dist:win:portable` 单独跑失败 | 它依赖 `out/`。脚本会自动检测并先跑 `npm run build`；若仍失败，手动执行一次 `npm run build` |
| 本地是 Linux/Mac 想直接打包 | 不行，`npm run dist:win` 会主动拒绝非 Windows 主机。用第 4 步的 CI 出包 |
| SmartScreen 拦截 | 未签名属正常现象，核对 SHA256 后单次放行即可 |
| 双击后闪退 | 确认是解压后运行、路径无特殊字符、杀软未隔离 exe；重新解压一遍 |
| 私有仓库 Actions 额度 | Free 约 2000 分钟/月；一次构建 5–10 分钟，个人使用足够 |

---

## 7 · 不依赖 CI，本机手动构建

在**原生 Windows** 上、Node.js 22.15+：

```powershell
npm ci
npm run typecheck
npm test
npm run dist:win              # → release/win-x64/*-setup-internal.exe
npm run dist:win:portable     # → release/win-x64/HuaweiMusic-Windows-Portable-v0.0.2.zip
node scripts/release-checksums.mjs release/win-x64
npm run test:release-contents # 检查发布包未夹带私有目录/未公开源码
```

---

## 8 · 合规与边界（再确认一次）

- 本项目**非华为官方产品**，未获授权、认可或技术支持，仅供个人学习研究。
- **不解密、不下载、不转存、不绕过任何付费 / 会员 / 地域 / DRM 限制**；能听什么完全取决于账号已有权益。
- 上游代码为 **AGPL-3.0-only**；分发衍生作品须同样开源并提供完整对应源码，保留版权与许可声明。许可证不授予华为服务接口、音乐内容或「华为 / HUAWEI」商标的使用权。
- 账号风险不因自行构建而消失：`client_id` 非项目自有、业务接口非公开、华为有登录风控且可能冻结异常帐号。建议开双重认证，介意就用小号买会员隔离。详见 [`README-CUSTOM.md`](README-CUSTOM.md)。
