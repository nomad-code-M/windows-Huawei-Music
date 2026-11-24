# 华为音乐 Windows 客户端 · 定制版

> 非官方项目，与华为及其关联公司无隶属、合作或代理关系，未获官方授权、认可或技术支持，仅供个人学习研究使用。
> 本仓库 fork 自 [Vincent-zhai-github/huawei-music-desktop](https://github.com/Vincent-zhai-github/huawei-music-desktop)（AGPL-3.0），上游又源自 [talongao/huawei-music-desktop](https://github.com/talongao/huawei-music-desktop)。上游的完整文档见 [`README.md`](README.md) 与 [`README-Talongao.md`](README-Talongao.md)，本文件只说明定制内容。

## 这个版本解决什么

华为音乐没有官方 Windows 客户端。上游开源项目已经把「联网 + 同账号跨设备同步 + 在线播放会员曲库」这一整套做完了，本定制版在此基础上补齐原需求清单里**唯一缺失的一项**，并针对账号安全做了几处加固。

| 需求 | 状态 | 来源 |
| --- | --- | --- |
| 华为账号登录（官方页面扫码） | ✅ | 上游 |
| 云端歌单、收藏与手机端双向同步 | ✅ | 上游 |
| 歌词居中显示、沉浸歌词页、桌面歌词悬浮窗 | ✅ | 上游 |
| **心动模式 / 发现相似风格歌曲** | ✅ **本版新增** | `src/renderer/heartbeat.mjs` |
| 后台托盘播放、全局快捷键、媒体键 | ✅ | 上游 |
| 标准 / HQ / 无损三档，按会员权益开放 | ✅ | 上游 |
| 在线播放会员内容、内置播放内核 | ✅ | 上游 |
| 账号安全说明与凭据最小化 | ✅ **本版加固** | 设置 → 账号安全 |

## 新增：心动模式

官方的每日推荐接口（`recommend/querydaily`）在多个变体上均返回 HTTP 400，上游因此明确「不做，也不用假推荐替代」。本版改用**纯本地相似度推荐**：

- **特征**：艺人（id 与名称两种键）、专辑、标题分词（中文二元字组 + 英文词，自动忽略 Live/伴奏/Remix 等版本标记）、时长、是否提供无损档。
- **打分**：艺人 0.40 / 专辑 0.16 / 标题 0.10 / 时长 0.08 / 无损 0.04，再叠加偏好权重 0.20；贪心选曲时对「已选中的同艺人」做 0.22 的重复惩罚，避免连推三首同一个歌手。
- **反馈闭环**：听完（`complete` +0.35）、收藏（`like` +1）、提前切歌（`skip` −0.7）会聚合成艺人/专辑偏好，越听越准；最近 40 首与已在队列的曲目不再重复推荐。
- **自动续接**：队列剩余不足 3 首时，在播放结束时补 3 首相似歌曲，不打断当前播放；随机播放（shuffle）顺序下也会保持队列索引的排列性质。

**边界（重要）**：

1. 不调用任何推荐接口，不引入新的私有接口；曲目池只来自当前队列、本机播放历史，以及开启时一次性读取的最多 4 页收藏（复用既有分页缓存，失败静默、不重试、不批量抓取）。
2. 不写云端、不上传任何听歌反馈。反馈只存在渲染进程内存里，**退出程序即消失**。
3. 全部是纯函数，可用 `node --test test/heartbeat.test.mjs` 单独回归，与 Electron、网络、账号完全解耦。
4. 播放条上的 ✦ 按钮，或「设置 → 播放 → 心动模式」开关均可开启；探索程度 0–40% 可调。

## 账号安全加固

对照上一轮调研里指出的风险，本版做了三处修改：

1. **不再落盘 OAuth refresh_token**（`src/main/huawei.ts`）。上游会把它加密存进会话文件，但公开客户端的 refresh 授权已被服务端拒绝（1101/20171），这份长期凭据没有任何可用场景。现在只保留完成后续请求所需的最小音乐会话，`refresh_token` 用完即弃。旧会话文件里若已存有该字段，退出登录后重新扫码即可清除。
2. **登录域名核对提示**。登录引导页明确写出官方域名（`oauth-login.platform.hicloud.com` / `id1.cloud.huawei.com`），出现任何第三方域名应立即关闭。
3. **「设置 → 账号安全」页**。直接显示当前会话状态与凭据存储模式（`secure` / `memory-only` / `unavailable`），并列出华为账号侧应开启的防护：双重认证、安全手机/邮箱、登录设备管理、改密码时强制其他设备下线、只运行自己构建的程序。

**仍然存在的风险，请务必读完**：登录所用的 OAuth 应用标识（`client_id=101444301`）并非本项目注册的身份，业务接口也不是华为公开 API。华为官方隐私声明明确会在登录场景收集设备标识符、IP、设备类型做风控，并「对识别出的异常帐号进行冻结，甚至清理」。因此**账号被判定为异常登录而受限的可能性无法排除**。华为账号是统一体系，一旦受限会连带影响云空间、应用市场、钱包、查找设备等。若账号绑定了支付与云空间，建议单独使用一个小号购买音乐会员做隔离。

本项目**不绕过任何付费、会员、地域或 DRM 限制**；能听什么完全取决于账号已有权益，也不提供下载、解密、转存或离线导出。

## 在 Windows 上构建运行

需要 **Node.js 22.15+** 和原生 Windows（安装包必须在 Windows 上构建，无法从 Linux 交叉打包）。

```powershell
git clone <本仓库地址>
cd huawei-music-desktop
npm ci
npm start            # 开发态运行，首次点「扫码登录」
npm run typecheck    # 类型检查
npm test             # 离线单元测试（含心动模式 15 项）
npm run dist:win     # → release/win-x64/*.exe（NSIS 安装包）
```

Windows 上若曾设置过 `ELECTRON_RUN_AS_NODE=1`，先清掉再启动：

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
```

产物**未签名**，首次运行会被 SmartScreen 拦截，请核对 Release 附带的 SHA256 后手动「仍要运行」，**不要为此关闭系统安全防护**。音乐会话约 7 天过期，失效后重新扫码即可（自动续期不可用）。

## GitHub Actions 自动构建与 Release

本版把发布链路补成两套产物，完整操作流程见 **[`GITHUB-SETUP.md`](GITHUB-SETUP.md)**（VSCode 看码 → 推 GitHub → Actions 构建 → 下载运行）。

`.github/workflows/windows-installer.yml` 在 `windows-latest` 上，push `main` / 推 `v*` tag / 手动触发时依次执行：`npm ci` → 220 项单测 → `npm run dist:win`（NSIS 安装包）→ `npm run dist:win:portable`（免安装 zip）→ 静态校验两份产物 → 生成 `SHA256SUMS` → 自动创建/刷新 GitHub Release 并上传安装包、便携 zip 与校验文件。

这解决了「安装包必须在原生 Windows 上构建」的限制：GitHub 提供的就是真 Windows 机器，本地是 Mac/Linux 也能出 Windows 包。`dist:win:portable` 用 electron-builder 的 `dir` target 产出完整运行目录，重命名后压缩，解压后双击 exe 即用、不写注册表；脚本也会在 `out/` 缺失时自动先跑 `npm run build`。

> **仓库可见性**：项目 `docs/` 含非公开接口研究资料，且上游免责声明写明「仅供内部研究测试，未取得公开分发所需授权」。CI 每次 push `main` 都会自动发 Release，公开仓库等于自动公开分发。**建议建 Private 仓库**，理由与合规说明见 `GITHUB-SETUP.md` 第 0 节。

## 许可义务

上游代码采用 **AGPL-3.0-only**。你可以修改和自用；但一旦**分发衍生作品**（包括发布安装包）或把改动作为网络服务对外提供，必须同样以 AGPL-3.0 提供完整对应源码，并保留版权与许可声明。许可证只覆盖代码，不授予华为服务接口、音乐内容或「华为 / HUAWEI」商标的使用权。公开分发前请自行完成服务条款、应用身份与商标方面的合规评估。

## 本次改动的文件

| 文件 | 改动 |
| --- | --- |
| `src/renderer/heartbeat.mjs` / `.d.mts` | 新增：纯本地推荐算法与类型声明 |
| `test/heartbeat.test.mjs` | 新增：15 项回归测试 |
| `src/renderer/App.tsx` | 接入自动续接、反馈采集、开关、登录提示、设置上下文 |
| `src/renderer/components.tsx` | 播放条新增 ✦ 心动模式按钮 |
| `src/renderer/pages.tsx` | 设置页新增心动模式开关/探索度与「账号安全」页 |
| `src/shared/types.ts` | 新增 `HeartbeatSettings` |
| `src/main/settings.mjs` | 新增默认值与输入校验（探索度夹在 0–0.4） |
| `src/main/huawei.ts` | 移除 refresh_token 落盘 |
| `src/shared/result.mjs` / `.d.mts`、`test/result.test.mjs` | 修复上游遗留：原测试直接 import `.ts`，`node --test` 无法加载；改为项目通用的 `.mjs + .d.mts` 形式，使 `npm test` 全绿 |
| `scripts/build-portable-win.mjs` | 新增：electron-builder `dir` target 产出免安装运行目录，附使用说明并压缩为单个 zip；支持 `linux` 参数做本地链路验证 |
| `scripts/release-checksums.mjs` | 让 `SHA256SUMS` 同时覆盖 `.zip` 便携包 |
| `.github/workflows/windows-installer.yml` | 增强：新增便携包构建与内容断言，Release 同时发布安装包 + 便携 zip + 校验文件 |
| `package.json` | 新增 `dist:win:portable` 脚本 |
| `GITHUB-SETUP.md` | 新增：VSCode / GitHub / Actions / Release 全流程与合规提醒 |
| `README-CUSTOM.md` | 本文件 |
