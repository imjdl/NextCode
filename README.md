# NextCode

<div align="center">
  <img src="public/logo/icons/1024x1024.png" alt="NextCode" width="128" height="128" />
</div>
<p align="center">
  简体中文 | <a href="README.en.md">English</a>
</p>

NextCode 是 AI 编程工作台，提供桌面应用、浏览器界面和终端 Agent。本仓库包含客户端、后端服务、
共享 UI，以及 Agent CLI 与运行时源码。

## 来源与许可

- 本仓库是 **ZCode 开源版的衍生定制版**：上游基线为 commit `872ad96`（版本 3.14.0），
  在**原项目源码**基础上做内部定制，未从零重写。
- 许可为 **Apache License 2.0**，与原项目一致：本仓库**延续原协议的许可**，不更换、不替代原许可。
  原项目的版权声明与第三方组件声明完整保留在 [LICENSE](LICENSE)、[NOTICE.md](NOTICE.md)、
  [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
- 本仓库为内部定制版，**不代表上游项目**，也不使用上游的社群与支持渠道；上游的两条历史提交
  已从本地 Git 历史中移除（如需与上游对比，[BUILD.md](BUILD.md) 记录了历史备份 bundle 的位置与用法）。
- 定制改动记录与打包手册见 [BUILD.md](BUILD.md)；每项行为规则、状态所有者与验收场景见
  [specs/](specs/)；面向 AI/协作者的开发规则见 [AGENTS.md](AGENTS.md)。

### 产品身份与内部标识

| 项                    | 值                                            |
| --------------------- | --------------------------------------------- |
| 产品名 / 安装包       | `NextCode` / `NextCode-{version}-win-x64.exe` |
| appId / Windows AUMID | `dev.nextcode.app`                            |
| 数据目录              | 仍为 `~/.zcode`（可用 `ZCODE_HOME` 覆盖）     |
| 命令行命令            | 仍为 `zcode`                                  |

**内部标识刻意未改名**：`@zcode/*` 包名、`ZCODE_*` 环境变量、`zcode` 命令名、`zcode-protocol`
协议标识、`~/.zcode` 数据目录与存储键，以维持与上游代码、数据结构及既有用户的兼容。
取舍范围与理由见 BUILD.md「产品身份」。

## 定制版与上游的差异（摘要）

| 方面       | 定制版做法                                                                    |
| ---------- | ----------------------------------------------------------------------------- |
| 品牌       | 产品名、图标、安装器与界面文案为 NextCode（命令行命令不变）                   |
| 官方渠道   | 移除产品文档/用户社群/问题上报/提需求与「检查更新」入口，不向官方后端发送请求 |
| 遥测       | 编译期硬关断，遥测 SDK 依赖已移除                                             |
| 更新       | 关闭官方渠道自动更新与强制升级                                                |
| 远程工作区 | 运行时资源随包分发并本地优先，不依赖官方 CDN                                  |
| 主题       | 新增「黑客」主题；主题选项收敛为单一来源，设置页与侧栏菜单一致                |
| Web 远控   | 内置控制面板（扫码访问）+ 响应安全头（CSP）与手机端布局适配                   |
| 文案       | i18n 死键检查与清理工具，双语文案表保持一致                                   |

## 定制改动与能力提升（明细）

> 时间线为 2026-09-21 起的 3.14.0 → 3.18.0；逐项细节、验证方式与踩坑记录见 [BUILD.md](BUILD.md)
> 的「定制版本记录」与「定制改动记录」，每项行为规则、状态所有者与验收场景见 [specs/](specs/)。

### 一、品牌与身份

- 产品名、安装包名、appId/AUMID、Windows/Linux 可执行名统一改为 **NextCode**；界面文案、网页标题、
  关于窗口、托盘提示与分享页品牌同步（zh/en 各 113 处）。
  **提升**：安装包与运行中的应用有独立身份，不再被误认成上游版本。
- Logo 与全部图片改为同风格的「N」标记（沿用原型 Z 的笔重比例、斜度与圆角交界过渡）：
  应用图标 9 个尺寸 + ICO 7 尺寸、安装器 3D 盒子图标、启动徽标、草稿水印、README 展示图标。
  **提升**：品牌一致；新增可复现的生成器与"未替换字形"校验，避免再出现"改了 logo 某处还是 Z"。
- 内部标识（`@zcode/*`、`ZCODE_*`、`zcode` 命令、`zcode-protocol`、`~/.zcode` 数据目录）刻意保留。
  **提升**：兼容上游代码与既有用户数据，避免改名的连带破坏。

### 二、去掉官方通道与外部依赖

- 关闭官方渠道自动更新与强制升级（首版定制包曾被官方后端强制升级覆盖，已修正）。
  **提升**：安装的自定义版本不会被远端替换。
- 遥测编译期硬关断，并删除遥测 SDK 依赖与 11 个相关模块。
  **提升**：不再产生遥测上报；主进程/preload 不再引用该 SDK。
- 远程工作区运行时资源随安装包分发、本地优先，不依赖官方 CDN。
  **提升**：离线或不通外网也能连接远程工作区，不再出现 `manifest not found` 类失败。
- 移除官方渠道入口：产品文档、用户社群、问题上报、给产品提需求、检查更新（帮助菜单、命令面板、
  托盘菜单、macOS 原生菜单一并清理）。
  **提升**：界面不再出现点了会走向官方后端的入口；相关死代码与 i18n 文案一并清除。

### 三、安全与卫生

- Web 远控/Web 服务补齐响应安全头：`nosniff`、`no-referrer`（二维码 URL 带 token）、
  `X-Frame-Options: DENY`、收敛的 `Permissions-Policy`，以及 HTML 的 CSP（脚本仅限本服务 +
  内联脚本 sha256，允许 WebAssembly 编译，`object-src 'none'`、`frame-ancestors 'none'`）。
  **提升**：页面无法加载远程脚本、无法被跨站嵌入、token 不会随 Referer 外泄，同时不影响
  diff 高亮与 Office 预览所需的 wasm。
- 死代码与依赖清理（9 个无调用方模块 + ARMS SDK），并修掉"陈旧 `node_modules` 残留会被打进
  安装包"的问题。
  **提升**：安装包体积下降（191.3 → 190.1 MiB），随包不再含遥测 SDK。
- i18n 死键治理：新增死键检查与清理工具（`pnpm i18n:dead-keys` / `i18n:prune-dead-keys`）。
  **提升**：文案表可校验、可清理（首轮清理 410 键/语言），新增语言不必翻译死文案。

### 四、功能新增与增强

| 能力                | 说明与提升点                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 提示词增强          | 输入框发送按钮旁新增增强按钮：用当前选中的模型配置润色草稿并替换，带取消与失败提示                               |
| 侧栏项目置顶与揭示  | 切换到某个项目时自动把它**移到列表顶部**并滚动到可见位置，项目多时不再翻找                                       |
| 桌面端 Web 远控面板 | 用户名旁的手机图标进入控制面板：开关服务、可选内网 IP、展示二维码，手机扫码即用；开启后图标变绿                  |
| 手机/窄视口适配     | 侧栏变覆盖式抽屉、默认收起、任务列表用不透明背景、Web 端入口显隐，手机浏览器不再是桌面布局                       |
| 主题体系            | 新增「黑客」主题（黑底绿字、保留语义色相）；主题选项收敛为单一来源，设置页与侧栏菜单一致，新增主题不再需要改多处 |
| 远程工作区          | 运行时资源随包分发（见上），从"依赖官方 CDN 下载"变为"本地优先、离线可用"                                        |
| 品牌资产生成器      | `scripts/generate-brand-assets.mjs` 参数化字形，一次产出全部矢量与位图，含尺寸规格核对与遗留字形校验             |
| 文档体系            | README（中英）说明来源与许可、结构与验证命令；BUILD.md 记录改动与打包手册；`specs/` 逐项记录规则与验收           |

### 五、修复的问题

- 侧栏项目揭示失效（`data-testid` 里 Windows 路径的反斜杠被当作 CSS 转义）。
- 提示词增强点击即报错（进程内 `AbortSignal` 无法跨渲染层边界）。
- 手机端：手机图标状态色不随服务变化、任务列表抽屉背景透明。
- SSH 远程连接报 `manifest not found for linux-x64`（打包态未把随包资源目录传给远程部署）。
- 设置页主题下拉框看不到 Zai/黑客主题（界面主题存在两份硬编码列表，且标签文案不可区分）。
- CSP 缺 `'wasm-unsafe-eval'` 导致 diff 高亮与 Office 预览的 wasm 编译被拦。
- Electron 渲染层启动徽标/关于窗口仍显示旧字形（内联字形有 5 处副本，已加防漏校验）。

## 入口

| 入口      | 用途                                                        | 开发命令                       |
| --------- | ----------------------------------------------------------- | ------------------------------ |
| Desktop   | Electron 桌面应用                                           | `pnpm dev:desktop`             |
| Web       | 浏览器工作台（后端 + Web 客户端）                           | `pnpm dev:web`                 |
| Agent CLI | 在终端中使用 `zcode`，也为 Desktop 和 Web 提供 Agent 运行时 | `pnpm --filter @zcode/cli dev` |

## 初始化

准备 Git、Node.js **24.14.0** 和 pnpm **10.33.2**，版本以 [mise.toml](mise.toml) 为准。
以下命令均在仓库根目录执行。

```bash
pnpm bootstrap
```

`pnpm bootstrap` 安装 workspace 依赖、准备桌面本地运行资源，再执行 `build:bootstrap`。

Agent CLI 与运行时源码位于 [apps/zcode-cli/](apps/zcode-cli/)，作为普通目录随本仓库一起克隆，
无需单独拉取或初始化 Git submodule。

| 命令                           | 用途                                                              |
| ------------------------------ | ----------------------------------------------------------------- |
| `pnpm install`                 | 安装依赖                                                          |
| `pnpm prepare:desktop-runtime` | 准备桌面运行资源，默认包含远程资源准备                            |
| `pnpm prepare:remote-assets`   | 单独准备远程运行资源                                              |
| `pnpm bootstrap:with-remote`   | 初始化依赖、本地与远程资源，并串行构建相关包；跳过桌面应用 bundle |
| `pnpm build`                   | 递归执行各 workspace 包的构建脚本，包括包内的资源准备步骤         |

默认 `bootstrap` 跳过远程资源准备，适合本地桌面开发。使用远程工作区或验证远程发行资源时，
再运行对应准备命令。

## 开发与运行

### 桌面版

```bash
pnpm dev:desktop

# 使用测试环境
pnpm dev:desktop:test
```

`pnpm dev:desktop` 默认等同于 `pnpm dev:desktop:prod`，使用生产服务配置。启动脚本会准备本地运行资源、
构建桌面 Agent，再启动 Electron 和源码监听。

需要独立开发数据目录时，可设置 `ZCODE_DATA_BASE_DIR`。例如在 macOS / Linux 中：

```bash
ZCODE_DATA_BASE_DIR="$HOME/.zcode-dev-home" pnpm dev:desktop:test
```

### 远程功能（SSH/WSL）

先执行 `pnpm bootstrap:with-remote` 准备远程资源（mock-cdn），再 `pnpm dev:desktop`；
连接远程项目时资源选择「本地下载后上传」。开发态资源取自本地 `packages/desktop/mock-cdn`
和本地构建产物，经 SFTP 上传到远程，不访问 CDN。发行包内的运行时资源随安装包分发
（见 [specs/bundled-remote-runtime-assets.md](specs/bundled-remote-runtime-assets.md)）。

### Web 开发

```bash
pnpm dev:web

# 指定后端工作区（macOS / Linux）
ZCODE_SERVER_WORKSPACE=/path/to/project pnpm dev:web
```

该命令同时启动 Web 开发服务器（默认 `http://localhost:5173`）和后端（默认 `http://localhost:3030`），
浏览器访问前者。`/ws` 和一般 `/api` 请求代理到本地后端。

Agent 源码修改后，执行 `pnpm --filter @zcode/cli... build` 并重启服务。

### 命令行发行包（TUI + Web）

命令行发行包包含 TUI、Web 和 Agent，统一使用 `zcode` 启动：无参数进入 TUI；第一个参数为 `--web`
时启动 Web；其他参数交给 Agent CLI 处理。两种模式都在本机运行，无需 Electron。

```bash
zcode                                                    # TUI
zcode --web                                               # Web
zcode --web --workspace /path/to/project --port 3030 --no-open
zcode --help
```

Web 模式默认工作目录为当前目录、监听 `127.0.0.1`，自动选择空闲端口并打开浏览器。
局域网访问可使用 `--host 0.0.0.0`；监听非本机地址时默认生成访问令牌，使用终端输出的带令牌链接。
可通过 `--token` 指定令牌或 `--no-token` 关闭令牌认证。直接启动通用 Web 服务的 HTTP 入口时，
通过 `ZCODE_SERVER_AUTH_TOKEN` 配置 API／WebSocket 认证；程序接口创建服务时使用 `authToken` 选项。

构建方式见下方打包章节。`pnpm build:zcode` 只生成发行包，不会替换 `PATH` 中已有的 `zcode`；
如命令仍指向旧安装，macOS / Linux 用 `command -v zcode`、Windows 用 `where.exe zcode` 检查。

### CLI 源码开发

```bash
pnpm --filter @zcode/cli dev --help
pnpm --filter @zcode/cli dev

# 构建 CLI 及其 workspace 依赖
pnpm --filter @zcode/cli... build
node apps/zcode-cli/packages/cli/dist/zcode.cjs --help
```

这个入口直接运行 Agent CLI，不经过发行包的 `--web` 分流。

## 配置

根目录 [.env.example](.env.example) 提供服务地址与构建配置示例，可按需复制到 `.env`，
本地覆盖放入 `.env.local`。Desktop 的开发环境通过 `dev:desktop:test` / `dev:desktop:prod` 选择。

| 配置                                 | 用途                                             |
| ------------------------------------ | ------------------------------------------------ |
| `ZCODE_DATA_BASE_DIR`                | 应用数据基目录，数据写入其下的 `.zcode/`         |
| `ZCODE_SERVER_WORKSPACE`             | Web 后端的工作区路径                             |
| `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` | 本地 Provider 配置文件路径；未设置时使用内置配置 |
| `ZCODE_DIST_BASE_URL`                | 命令行安装脚本使用的下载根地址                   |

随客户端发布的默认配置见 [config/README.md](config/README.md)。

## 打包

### 桌面版（Windows x64，定制版主用路径）

定制版的完整打包手册（含版本号管理、winCodeSign 变通、产物校验）见
[BUILD.md「打包流程」](BUILD.md)：

```bash
pnpm --filter @zcode/desktop run bundle -- --os win --arch x64
```

流水线三阶段：准备运行资源（含随包远端资源与 Web 远控产物）→ 生产构建 → electron-builder。
产物在 `packages/desktop/dist/`：`NextCode-{version}-win-x64.exe`、`latest.yml`、`win-unpacked/`。

跨平台入口仍保留上游的 `pnpm bundle:desktop`（默认 macOS arm64，`--os` 支持 `mac`/`win`/`linux`）：

```bash
pnpm bundle:desktop -- --os win --arch x64
```

### 命令行发行包

构建入口为 `pnpm build:zcode`：依次构建 CLI/TUI、后端和 Web，收集 TUI 的原生库、worker 与运行时依赖，
再组装发行包；运行发行包仍需要 Node.js，版本以 [mise.toml](mise.toml) 为准。

打包前必须设置下载根地址 `ZCODE_DIST_BASE_URL`（可放在 `.env`、`.env.local` 或环境变量中），
也可通过 `--base-url` 传入：

```bash
pnpm build:zcode --base-url https://downloads.example.com/zcode/
pnpm build:zcode                 # 已配置 ZCODE_DIST_BASE_URL 时
pnpm build:zcode --skip-build    # 复用已有构建产物，仅重新组包
pnpm build:zcode --help
```

默认版本取根目录 `package.json`，输出目录为 `dist/zcode/`：

- `releases/<version>/zcode-<version>.tar.gz`：运行包。
- `releases/<version>/sha256.txt`：校验摘要。
- `latest.json`、`install.sh`：版本索引和安装脚本。

安装脚本从该地址下载运行包，默认安装到 `~/.zcode/runtime`，并在 `~/.local/bin` 创建 `zcode` 命令；
安装目录可用 `ZCODE_DIST_HOME`、命令目录可用 `ZCODE_DIST_BIN_DIR` 修改。

第三方声明由 [scripts/third-party-notices.mjs](scripts/third-party-notices.mjs) 依据
[third-party/](third-party/)（`inventory.json`、`copied-components.json`、`native-search/` 等）生成，
产物中的声明位置见该脚本与 `packages/desktop` 的构建配置。

## 仓库结构

| 目录 / 文件                                        | 职责                                                           |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `packages/desktop`                                 | Electron Main、Host、Renderer、内置 Web 远控与桌面打包         |
| `packages/web`                                     | Web 客户端（含移动端适配与首屏主题）                           |
| `packages/server`                                  | HTTP / WebSocket 服务、响应安全头与远程连接                    |
| `packages/zcode-server-cli`                        | 独立 Server 启动与进程管理                                     |
| `packages/ui`                                      | 共享 React 组件、hooks、Zustand store、i18n 文案表与主题 token |
| `packages/services`                                | 业务服务与持久化（会话、任务、设置、反馈等）                   |
| `packages/shared`                                  | 共享协议与类型、平台接口、桌面菜单与通道定义                   |
| `packages/rpc`                                     | RPC 框架与 IPC 传输                                            |
| `packages/client`                                  | Agent 客户端 SDK                                               |
| `packages/provider`、`packages/provider-node`      | 模型/账号 Provider 配置与选择，及 Node 侧实现                  |
| `packages/model-option-map`                        | 模型 option map 的解析与求值（独立 typecheck 脚本）            |
| `packages/zcode-cua`、`packages/formal-proof`      | Computer Use 占位包（运行时 fail closed）；独立 Vite 可视化页  |
| `apps/zcode-cli`                                   | Agent CLI、TUI、core 运行时与工具（自身是嵌套 workspace）      |
| `scripts/`                                         | 构建维护脚本、架构检查、i18n 与品牌资产生成器等                |
| `config/`                                          | 随包发布的内置配置                                             |
| `harness/remote/`                                  | 远程功能的手工验证环境（Docker）                               |
| `patches/`                                         | 依赖补丁                                                       |
| `public/`                                          | README 展示图标等文档资产                                      |
| `specs/`                                           | 每项定制改动的规则与验收（[specs/](specs/)）                   |
| `third-party/`                                     | 第三方组件清单与声明生成材料                                   |
| `BUILD.md`、`AGENTS.md`、`DESIGN.md`、`CONTEXT.md` | 打包与定制记录、开发规则、UI 设计规范、插件商店词汇            |

## 开发与验证命令

| 用途             | 命令                                               |
| ---------------- | -------------------------------------------------- |
| 类型检查         | `pnpm typecheck`                                   |
| Lint / 格式化    | `pnpm lint` / `pnpm lint:fix` / `pnpm fmt:check`   |
| 架构检查         | `pnpm architecture:check --changed`                |
| 模块阅读包       | `pnpm architecture:context <module-id>`            |
| 未使用依赖与导出 | `pnpm knip`                                        |
| i18n 死键报告    | `pnpm i18n:dead-keys`                              |
| i18n 死键清理    | `pnpm i18n:prune-dead-keys -- --write`             |
| 单元测试         | `node_modules/.bin/tsx --test <path/to/*.test.ts>` |
| 品牌资产重生成   | `node scripts/generate-brand-assets.mjs`           |

测试入口以目标包当前的 `package.json` 与实际测试文件为准，仓库未提供统一的单测/E2E 命令。

## 项目声明

功能与优惠范围、维护规则、执行与数据风险，以及许可和第三方版权说明，详见 [NOTICE.md](NOTICE.md)；
其中包含本仓库作为上游衍生定制版的说明。
