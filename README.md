# 华为音乐第三方客户端（开发工程）

> **非官方项目 · 仅供学习研究**：与华为及其关联公司无隶属、合作或代理关系，未获官方授权、认可或技术支持。不绕过任何付费、会员、地域或 DRM 限制，不提供下载、解密、转存、离线导出功能。代码以 **AGPL-3.0-only** 授权，公开分发或商业使用前请自行完成合规评估。

这是一个**完整可修改的 Electron + React + TypeScript 源码工程**。你在 VSCode 里改代码、在本地直接运行看效果，打包发行由你自己决定何时执行。工程 fork 自 Talongao 的 huawei-music-desktop，新增与修改内容见 [README-CUSTOM.md](README-CUSTOM.md)，原项目完整文档见 [README-Talongao.md](README-Talongao.md)。

---

## 1 · 快速开始（改代码 → 本地运行）

### 前置条件

- **Node.js 22.15 或更高**（含 npm）。到 [nodejs.org](https://nodejs.org/) 下载 LTS 版安装即可。
- **VSCode**（或任意编辑器）。
- 联网一次——用于安装依赖（会下载 Windows 版 Electron 运行时）。

> ⚠️ 包里**故意不含 `node_modules`**：Electron 等依赖是按操作系统编译的，本工程在 Linux 环境准备，二进制无法在 Windows 上运行。你必须在自己的 Windows 上执行一次 `npm install`，让 npm 拉取 Windows 版依赖。`package-lock.json` 已锁定全部版本，装出来的依赖可复现。

### 三步跑起来

在 VSCode 里「文件 → 打开文件夹」，选中工程根目录（含 `package.json` 的那一层），打开集成终端（`Ctrl + ` `），依次执行：

```powershell
# ① 安装依赖（首次执行，需联网，约几分钟）
npm install

# ② 本地运行（边改边看效果）
npm start

# ③ 改完代码后，验证没写坏（可选但建议）
npm run typecheck   # 类型检查
npm test            # 220 项单元测试
```

`npm start` 会先构建再启动应用窗口。之后每次改完源码，重新执行 `npm start`（或见下方"热更新"）即可看到改动。登录用你自己的华为账号扫码，登录页只应出现 `id.huawei.com` / `oauth-login.platform.hicloud.com` 等华为官方域名，出现第三方域名请立即关闭。

### 想边改边热更新（不重启）

工程基于 electron-vite，可开两个终端：

```powershell
# 终端 A：构建并监视文件变化，自动重编译
npx electron-vite build --watch

# 终端 B：编译产物一变就自动重启窗口（需先 npm install 装 nodemon，或直接用 electron .）
npx electron out/main/index.js
```

不用热更新时，简单起见直接反复 `npm start` 就行。

---

## 2 · 代码地图（改什么，去哪个文件）

| 你想改的东西 | 主要文件 |
|---|---|
| 界面布局、样式、交互 | `src/renderer/App.tsx`、`pages.tsx`、`components.tsx`、`styles.css` |
| 播放逻辑、队列、进度 | `src/renderer/App.tsx`、`player.mjs`、`lib/player.ts` |
| **心动模式 / 相似推荐** | `src/renderer/heartbeat.mjs`（算法纯函数）、`heartbeat.d.mts`（类型）、`test/heartbeat.test.mjs`（测试）；接入点在 `App.tsx` |
| 华为接口、登录、会话、音源 | `src/main/huawei.ts`、`auth-manager.ts`、`src/auth.mjs`、`src/music.mjs` |
| 歌词（行级 / 沉浸 / 桌面悬浮） | `src/main/lyrics*`、`src/lyrics.mjs`、`src/renderer/` 歌词组件 |
| 设置项（增删一个开关） | `src/main/settings.mjs`（默认值+清洗）、`src/shared/types.ts`（类型）、`src/renderer/pages.tsx`（界面） |
| 收藏 / 歌单 / 曲库缓存 | `src/main/favorites-catalog.mjs`、`library*`、`src/music.mjs` |
| 托盘、全局快捷键、窗口 | `src/main/index.ts`、`src/main/icons.ts`、`src/shared/shortcuts.mjs` |
| IPC 通信（主进程 ↔ 界面） | `src/shared/channels.ts`、`src/main/ipc.ts`、`src/preload/index.ts` |
| 打包 / 启动脚本 | `scripts/`（`build-desktop.mjs` 打包、`start-desktop.mjs` 启动） |

**改动设置项的完整链路**（最容易漏）：`settings.mjs` 加默认值和清洗 → `shared/types.ts` 加类型 → `pages.tsx` 加界面 → 渲染层读取使用。漏一处会类型检查不过。

**新增/修改逻辑后**：`npm run typecheck` 确保类型对，`npm test` 确保老功能没被碰坏，再 `npm start` 看实际效果。

---

## 3 · 打包发行（你自己在 IDE 操作）

全部打包命令都需要**在 Windows 本机**执行（NSIS 安装向导依赖 Windows 工具链，Linux/Mac 上打不了 Windows 安装包）。

```powershell
# 打 Windows NSIS 安装包 → 输出到 release/win-x64/
npm run dist:win

# 打免安装便携版 zip → 输出到 release/win-x64/（可选）
npm run dist:win:portable

# 其他平台
npm run dist:linux     # AppImage
npm run dist:mac:x64   # dmg
```

产物在 `release/` 对应目录。安装包**未签名**，首次运行会触发 Windows SmartScreen——核对 SHA256 后点「更多信息 → 仍要运行」，**不要为图省事关掉系统防护**。工程内的 `.github/` 是可选的 CI 配置，你自己本地打包无需关心。

发布前请注意 AGPL-3.0 义务：以 AGPL 授权的工程对外分发（尤其网络服务）时，需向使用者提供对应源码；同时本项目为非官方实现，公开传播前请自行评估合规风险。

---

## 4 · 测试命令速查

| 命令 | 作用 |
|---|---|
| `npm test` | 220 项离线单元测试（含心动模式 15 项），最快 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run build` | 类型检查 + 构建主进程/预加载/渲染层到 `out/` |
| `npm start` | 构建 + 启动应用 |
| `npm run dist:win` | 打 Windows 安装包 |

`test:electron*` 等带界面的测试需要图形环境和真实登录，一般开发改代码用不到。

---

## 5 · 安全须知（务必阅读）

- **盗号风险低**：登录在华为官方域名完成，凭据用系统 `safeStorage` 加密存本机，无遥测、无自动更新、无第三方认证服务器。
- **风控风险中等且无法量化**：登录用的 OAuth `client_id` 非本项目注册（极可能是官方 App 的身份），业务接口为非公开私有接口，华为有登录风控，官方条款明确可冻结异常账号。作者已把「账号限制」列入免责声明。
- **华为账号是统一体系**：一旦受限，可能波及云空间、应用市场、主题、查找设备、支付等，不只是音乐。
- **建议**：开启华为账号双重认证；定期在「登录设备管理」清理陌生设备；介意就用小号买会员专供 PC 听歌，主账号零暴露。
- **止损开关**：改密码时勾选「退出其他设备登录」，可一键让所有第三方会话失效。
- **看到这些别用**：登录页跳第三方域名、让你在窗口里直接输华为密码、宣称「解锁会员 / 免费无损 / 下载导出」——最后一类必然碰解密，风险完全不同档。

本项目不解密、不下载、不绕过任何会员限制，只按你账号已有权益播放。

---

## 6 · 已知限制

- **心动模式**是纯本地相似度推荐（艺人/专辑/标题/时长 + 你的喜欢/跳过反馈），用你已同步下来的曲库算，**不调用华为的推荐接口**（该接口实测返回 400）。反馈只存内存，退出即消失，不上传。
- **会话约 7 天过期**，自动续期已被服务端拒绝，失效后重新扫码即可。
- **超清音质不提供**：实测最高等级会员请求仍被拒（需 HarmonyOS NEXT 设备 + 华为耳机 L2HC 全链路），桌面端不可用。
- **无版权歌曲**灰色显示且禁止播放。
- 真实华为账号扫码登录与在线播放需你在本机自行验收。

---

## 7 · 文档索引

| 文件 | 内容 |
|---|---|
| `README-CUSTOM.md` | 本 fork 的定制内容、心动模式原理、改动清单、AGPL 义务 |
| `README-Talongao.md` | 原项目完整文档（架构、安全边界、数据与隐私、免责声明） |
| `GITHUB-SETUP.md` | （可选）推送 GitHub 与 CI 自动打包的说明，本地开发可忽略 |
| `docs/` | 接口契约、登录研究、实现状态等技术资料 |
| `AGENTS.md` | 给 AI 编程助手的工程约定 |

---

*AGPL-3.0-only · 非官方项目 · 仅供学习研究 · 未获华为授权*
