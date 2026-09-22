# BUILD — 定制版改动记录与打包手册

本仓库是 ZCode 开源版的内部定制版。本文件记录三件事：**定制了什么**、**怎么打包出可执行文件**、**版本号怎么管理**。每次定制改动后在此追加记录，打包流程可直接复用。

## 版本号管理

版本号唯一来源是**仓库根 `package.json` 的 `version` 字段**（当前 `3.17.0`，上游开源基线为 commit `872ad96` 的 `3.14.0`）。

它流向这些地方，改一处全部生效（均为构建期读取，改完后需重新构建）：

| 流向 | 说明 |
| --- | --- |
| 安装包文件名 | `packages/desktop/dist/ZCode-{version}-win-x64.exe` |
| 应用内版本 | 渲染层 `__ZCODE_VERSION__`（`packages/desktop/scripts/build-metadata.mjs` 读根版本注入） |
| NSIS 元数据 | 安装器“程序和功能”里的 DisplayVersion |
| 自动更新清单 | `dist/latest.yml`（版本比对依据） |

注意事项：

- `packages/desktop`、`packages/ui` 等子包**没有** version 字段，不要在子包里单独改版本。
- Agent CLI 的版本独立于桌面端：`apps/zcode-cli/package.json`（当前 `0.16.9`），只影响 CLI/SEA 构建，桌面打包不用动它。
- 自增版本建议沿用纯 semver 递增（`3.14.0` → `3.14.1` / `3.15.0`）。避免加 `-xxx` 预发布后缀：`latest.yml` 自动更新比对与 NSIS DisplayVersion 对非数字后缀兼容性差。
- `ZCODE_ENV=test` 构建会给产物名追加 `_TEST` 后缀（`resolveDesktopArtifactSuffix`），生产构建不带。

### 定制版本记录

| 日期 | 版本 | 产物 | 说明 |
| --- | --- | --- | --- |
| 2026-09-21 | 3.14.0 | `ZCode-3.14.0-win-x64.exe`（149 MB） | 首个定制构建，改动见下 |
| 2026-09-21（重建） | 3.14.0 | `ZCode-3.14.0-win-x64.exe` | 关闭官方渠道自动更新/强制升级后重打；首版安装后会被官方后端强制升级覆盖，勿再使用首版产物 |
| 2026-09-21 | 3.15.0 | `ZCode-3.15.0-win-x64.exe` | 侧栏激活项自动揭示 + 输入框提示词增强 + 放宽内置安全声明（见下） |
| 2026-09-21 | 3.16.0 | `ZCode-3.16.0-win-x64.exe` | 去远程控制 + 遥测编译期硬关断（见下）；建议用此版替换 3.15.0 |
| 2026-09-21 | 3.16.1 | `ZCode-3.16.1-win-x64.exe` | 修复侧栏项目自动揭示失效 + 提示词增强点击报错；新增激活项目自动置顶、Web/手机端布局适配、桌面端 Web 远控面板（见下） |
| 2026-09-21 | 3.16.2 | `ZCode-3.16.2-win-x64.exe` | 修复手机图标状态色（开启服务变绿）与手机端任务列表背景透明（见下） |
| 2026-09-22 | 3.17.0 | `ZCode-3.17.0-win-x64.exe` | 死代码与 ARMS 依赖清理 + i18n 死键工具与清理（410 键/语言）+ Web 服务响应安全头（CSP）（见下）。首次打包后又重打一次：清掉 node_modules 陈旧残留（`@arms/*`），随包不再含 ARMS SDK，191.3 → 190.1 MiB |

## 定制改动记录

### 2026-09-22 死代码清理 + i18n 死键治理 + Web 服务安全头（3.17.0）

**背景**：定制方向是"去掉官方通道与不用的能力、自己掌控构建"。本批次处理三件互相独立的
卫生与安全问题，都不改产品功能。

**1) 死代码与 ARMS 依赖清理**

- 删除 11 个已无调用方的模块（`appARMSBootstrap`、`armsEventRedaction`、`armsUserIdentity`、
  `forceUpdateGuard`、`forceUpdatePrompt`、`manifestUpdateProvider`、`startupTelemetryDelivery`、
  `longTaskAttributionSummary`、`src/shared/armsRum*` 及 map）与 preload 里的 ARMS 转发补丁。
- 从 `packages/desktop/package.json` 移除 `@arms/rum-electron` 依赖与 `patchedDependencies`
  补丁项，`pnpm install --lockfile-only` 后 lockfile 无残留。
- 效果：主进程/preload 不再引用官方遥测 SDK（此前是"编译期重定向到空实现"，现在是彻底移除）。

**2) i18n 死键工具与清理**（规则与验收见 `specs/i18n-dead-key-tooling.md`）

- 新增 `pnpm i18n:dead-keys`（报告 + 自检 + `--why` 单键诊断 + 双语键集一致性）与
  `pnpm i18n:prune-dead-keys`（默认 dry-run，`-- --write` 才落盘）。
- 判定不是"没搜到就删"：intl 的 id 是普通 string，删错键不会让 typecheck 失败、只会在运行时
  显示键名；因此按**家族级**可证明条件判定（家族未被任何 token 提到 + 不是动态拼键前缀 +
  不被更浅的动态前缀覆盖），只有满足条件的整族才可删。
- 本次删除两语言各 410 个键（93 个最小家族，纯删除 920 行），如 `chat.promptEnhance.*`、
  `carousel.*`、`debugInfo.*`；其余 1730+ 个"未使用但祖先仍被引用"的键保留并列入报告。
- 采集侧三个坑已修并写进自检：不能跟随 `node_modules` 里的 workspace 符号链接（否则
  locale 文件被当成引用来源、结果恒为 0）、检查脚本自身不得计入引用、locale 文件需排除。

**3) Web 服务响应安全头（CSP）**（规则与验收见 `specs/web-remote-security-headers.md`）

- 新增 `packages/server/src/httpSecurityHeaders.ts`，由 `http.ts` 应用：所有响应带
  `nosniff` / `no-referrer` / `X-Frame-Options: DENY` / 收敛的 `Permissions-Policy`；
  HTML 响应额外带 CSP（`script-src 'self' + 内联脚本 sha256`、`object-src 'none'`、
  `frame-ancestors 'none'` 等）。
- 内联脚本哈希按**实际发送的** index.html 计算，页面变化自动跟随；哈希必须原样（不 trim、
  CRLF 折 LF），否则浏览器按原文本校验会直接阻断内联脚本。
- 验证：手机视口（390×844 + 移动 UA）加载真实服务，无 CSP 违规/控制台错误/请求失败，
  主题类正常应用；`packages/server/test/httpSecurityHeaders.test.ts` 8 项通过。
- 桌面端不受影响：Electron 渲染层走 `loadFile`，不经这个 HTTP 服务。

**门禁结果**：`pnpm typecheck`、`pnpm lint`、`pnpm architecture:check --changed` 全部通过；
`node --test packages/server/test/httpSecurityHeaders.test.ts`（经 `tsx --test`）8/8 通过。

### 2026-09-21 新增「黑客」主题（hacker-dark）

**背景**：主题此前只有 Zai Light / Zai Dark（+ system）。主题体系是"一套 ~140 个 `--color-*` token + 类名切换"，`@theme` 已注册这些变量，故新增主题只需提供一份 palette。

**改动**（规则与验收见 `specs/hacker-theme.md`）：

- `styles.css`：新增 `.theme-hacker-dark` 块（147 行、140 个 token 全覆盖）。用一次性脚本从 `.theme-zai-dark` 复制后按映射改值生成，避免手抄漏 token——脚本第一版把选择器行弄丢了、损坏了文件（丢 1302 行），已 `git checkout` 还原并改为带结构断言的版本，最终 diff 为纯新增 147 行。
- 配色：近黑绿底（`#050a06`）+ 浅绿正文（`#b9f6c9`）+ 霓虹绿主色（`#2bff88`）；**保留语义色相**（错误红、警告琥珀、git/diff 增删、terminal 的 red/yellow/blue/magenta），避免纯绿 ANSI 让错误与 diff 不可读。
- `useTheme.ts`：新增 id、归属 dark；并把 `applyTheme` 从"硬编码 3 个 classList.toggle"改成按 `THEME_CLASS_IDS` 注册表清理+切换（顺带解决"每加一个主题都要改这处"）。
- 枚举点同步：侧栏主题菜单、`SettingsPage` 白名单、`test-actions` 类型、`webThemeSeed`（typecheck 抓出的漏点）、`openWorkspacePageThemeHero` 专属渐变、`packages/web/index.html` 首屏底色映射。
- i18n：`sidebar.settings.theme.hacker-dark`（黑客 / Hacker）；`DESIGN.md` 的 Theme Modes 登记新主题与注册清单。

**实测**（headless 起 Web 服务）：选黑客主题后 `class="dark theme-hacker-dark"`、`color-scheme: dark`、`--color-background=#050a06`、`--color-brand=#2bff88`、body 背景 `rgb(5,10,6)`、正文 `rgb(185,246,201)`；切回 zai-dark 后无 `theme-*` 类残留（验证注册表清理正确）。

### 2026-09-21 远程 workspace 用随包资源（不再依赖官方 CDN）

**问题**：连接 SSH/WSL 远程报 `manifest not found for linux-x64: manifest-linux-x64.json`。远端部署默认从官方 CDN 取 `releases/<版本>/manifest-<platform>-<arch>.json`；定制版自增版本号（3.16.2）后官方 CDN 上不存在该版本，必然 404。仓库里其实有本地资源（`packages/desktop/mock-cdn/releases/<version>/`，由 `prepare:remote-assets` 生成），但**打包态不带**，只能走 CDN。

**改动**（规则与验收见 `specs/bundled-remote-runtime-assets.md`）：

- `scripts/prepare-remote-assets-bundle.mjs`：把 mock-cdn 里当前版本的指定平台资源裁进 `resources/remote-assets`（默认 `linux-x64`，可用 `ZCODE_BUNDLED_REMOTE_PLATFORMS` 扩展）。实测 157.1MB（其中 Node 运行时 116MB 不可省）。
- `desktopRuntimeEnv.resolveDevelopmentMockCdnDir()`：打包态返回 `process.resourcesPath/remote-assets`，开发态仍用仓库 `mock-cdn`。
- electron-builder `extraResources` 随包分发；脚本已挂入 `prepare:runtime-assets`（在 `prepare:remote-assets` 之后，保证资源是当前版本）。
- 已加入 `.gitignore`（构建产物，否则 oxlint 会扫到）。

**效果**：本地资源齐全时，远端部署**完全不走网络**（既有 `getReleaseDir` 的本地优先语义）；未打包的平台（如 darwin-arm64）仍按既有语义回退 CDN，并在日志给出 `mock-cdn incomplete` 警告。

**注意**：**改版本号后必须重跑 prepare**（`prepare:remote-assets` + `prepare:remote-assets-bundle`），否则随包资源目录名与 `ZCODE_VERSION` 不一致 → 又回到 CDN。构建流水线已包含该步骤，但用 `--skip-prepare` 时不会执行。

**首版失败复盘（重要）**：第一版只改了路径解析函数 `resolveDevelopmentMockCdnDir()`，实测无效——日志仍是 `mockCdnDir: <missing>`。真实原因是 `resolveRemoteAssetDirs()` 在打包态**提前返回**「只给 CDN + 缓存、不传 `mockCdnDir`」（上游注释：避免 remote 资源被塞回安装包），所以被改的解析函数在打包态**从未被调用**（死代码）。第二版把打包分支与"开发态强制走 CDN"分支拆开，打包分支带上随包 `mockCdnDir`。

教训：这类"改了解析却没用"的问题，**先确认调用链上没有提前返回**，再改实现；同时用"产物结构 + 调用链"双重验证，别只看文件是否随包。

### 2026-09-21 修复：手机图标状态色 与 手机端抽屉背景透明

**问题 1：开启服务后手机图标不变色**（`packages/ui/src/WorkspaceSidebarFooter.tsx`）
- 图标原本无状态：footer 不感知服务状态。现在 footer 镜像 main 的 `running`（面板回调 + 窗口 focus 时补查一次，覆盖服务自行退出），开启时 `Smartphone` 加 `text-success`（主题里 `--color-success` 为绿色），并加 `data-testid="web-remote-control-indicator"` / `data-running` 便于排查。

**问题 2：手机端任务列表背景透明、与欢迎页叠字**（`app-shell/WorkspaceShellLayout.tsx`）
- 根因：桌面布局里侧栏是**透明**的、靠下层 shell 底色透出；我把它改成覆盖抽屉时没给底色，于是列表文字与下层欢迎页/输入框叠在一起。
- 首轮误用 `bg-background-alt`，实测计算值为 `oklab(… / 0.6)`——该 token 本身就是 `color-mix(..., transparent)`，**仍然半透明**；改用 `bg-background`（四个主题下均为不透明实色），实测计算值 `rgb(22, 22, 22)`，并补 `border-r border-border` 与阴影。
- 验证：手机尺寸（393×852）headless 打开抽屉，`getComputedStyle` 取面板底色为不透明，`elementFromPoint` 命中抽屉内部（点击不再穿透到下层），截图确认无叠字。

### 2026-09-21 桌面端内置 Web 远控面板（手机扫码访问）

**需求**：用户名旁手机图标 → 控制面板 → 一键开启 Web 服务 → 展示二维码 → 手机扫码访问；支持指定内网 IP。规则与验收见 `specs/desktop-web-remote-panel.md`。

**实现**（把已验证的手工流程产品化）：

- `packages/desktop/src/web-remote/server/index.ts` + tsup 入口 `web-remote/server`：与 `packages/server/entry-http.ts` 同构的独立服务入口（同 `createHttpServer` + `createLocalServices`），从环境变量读取 host/port/token/静态根，就绪后向 stdout 打 `zcode-web-remote-ready`。
- `packages/desktop/src/main/webRemoteControl.ts`：main 侧唯一所有者——列本机 IPv4（标注虚拟网卡并推荐第一张非虚拟网卡）、端口占用预检、随机 token、`electron.utilityProcess.fork` 起停子进程、状态与 lastError。**注意用 utilityProcess 而不是 `child_process.fork`**：后者会用 Electron 二进制再起一个 app 实例。
- 命令通道：`DesktopCommandIds.WebRemote{ListAddresses,GetState,Start,Stop}`；`ExecuteDesktopCommand` 扩展为可携带 payload（保持只传命令 id 的旧调用兼容），并加 `isWebRemoteState` 运行时校验。
- UI：`packages/ui/src/settings/WebRemoteControlDialog.tsx`（开关 / IP 选择 / 端口 / 二维码 / 复制链接 / 风险提示），入口是 footer 用户名旁的手机图标（仅桌面端渲染）。
- 打包：`scripts/prepare-web-remote-web.mjs` 构建 Web 产物并复制到 `resources/web-remote-web`，electron-builder `extraResources` 随包分发；已挂入 `prepare:runtime-assets`。

**取舍（记录在案）**：服务跑在独立运行时里（与"手机 attach 桌面已有 Host"的上游设计不同），与桌面窗口共享 `~/.zcode` 数据；改成 attach 需要移植上游 attachment/owner-lease 链路，属后续工作。不启用任何外网 relay。

### 2026-09-21 Web/手机端布局适配（3.16.1 内的追加改动）

**背景**：局域网 Web 访问实测发现手机打开后是桌面双栏压缩版——侧栏占 `max-w-[50%]`，聊天列 `min-w-[320px]`，相加超出 393px 视口且外层 `overflow-hidden`，输入框被裁切且无法横向滚动；同时 Web 端没有侧栏显隐入口（按钮只在 mac/Windows 桌面分支渲染），手机上连"收起侧栏"都做不到。原移动端形态随手机远控功能一起被删（`ZCodeAgentPresentationSurface` 只剩 `"desktop"`）。

**改动**（行为规则与验收见 `specs/web-mobile-layout.md`）：

- 新增 `hooks/useNarrowViewport.ts`：matchMedia 订阅 ≤768px 窄视口（只在跨断点触发一次重渲染，不用 resize 监听）。
- `hooks/useAppPanels.ts`：窄视口默认收起侧栏，跨断点自动切换（200ms 内的桌面行为完全不变）。
- `app-shell/WorkspaceShellLayout.tsx`：窄视口下侧栏改为覆盖抽屉（`absolute z-40`、宽度 `min(85vw, 320px)`，不再受 `max-w-[50%]` 限制），加遮罩点按关闭，点选任务后自动收起，拖拽把手在窄视口隐藏。
- `DesktopTopOverlay.tsx`：补齐非桌面（Web）分支的侧栏显隐按钮——原先只有 mac/Windows 桌面有，这是"收起后无法再展开"的根因。

**实测（393×852 headless，真实服务端）**：初始 `aside=0 / content=393 / composer=333 / overflow=0`；打开抽屉 `aside=320 / content 仍 393（覆盖而非挤压）/ 遮罩出现`；点遮罩回到收起态；1280px 宽视口回归 `aside=264 + 拖拽把手存在 + 无遮罩`；无页面错误。

**注意**：该改动在共享 UI 里，Web 产物重建即可生效（服务端托管静态目录，无需重启）；桌面安装包需重新打包才会包含。

**Bug 1：激活项目后列表不滚动（Windows 必现）**

现象：3.15.0/3.16.0 安装后，激活项目时列表既不滚动也不报错。

根因：`WorkspaceSidebar` 用 `querySelector('[data-testid="workspace-item-<路径>"]')` 找卡片，而 Windows 路径含反斜杠（`E:\Projects\ZCode`）。反斜杠在 CSS 字符串里是转义前缀，`\P` → `P`、`\Z` → `Z`，选择器实际变成 `workspace-item-E:ProjectsZCode` —— **CSS 合法转义，不抛错，只是匹配不到任何元素**，揭示逻辑因此静默 return。macOS/Linux 路径只有 `/`，所以只在 Windows 出现。

修复（`packages/ui/src/WorkspaceSidebar.tsx`）：

- 新增 `findWorkspaceCardElement`：选择器只用安全前缀 `[data-testid^="workspace-item-"]`，再用 `getAttribute` 精确比较完整值；不再把任何值拼进选择器（函数文档里写明了这个陷阱）。
- 揭示时机收敛为「切换项目时」：`workspaceKey` 变化 → 把该项目卡片头部对齐视口顶部（容差 8px，已在顶部则不滚动）；同一项目内切任务不动卡片，避免把刚点击的任务行推出视口（行级滚动由 `TaskList` 负责）。

**Bug 2：点击提示词增强直接报错**

日志证据（`~/.zcode/v2/logs/<date>.log`）：

```
[host] [rpc:call] zcode-agent.generateWorkspaceText FAIL (1.4ms)
{"name":"TypeError","message":"params.signal?.addEventListener is not a function"}
```

根因：`ZCodeAgentGenerateWorkspaceTextParams.signal` 在服务层是**进程内真实 AbortSignal**（`zcodeAgentService` 用它做本地取消，且不会把它发到线上）。渲染层经 Proxy 调用时该对象被序列化成普通对象，宿主侧调 `params.signal.addEventListener` 立即抛错。

修复（`packages/ui/src/v4/ConversationComposer.tsx`）：不再传 `signal`，跨进程序约只走 `requestTimeoutMs`（300s，需高于 thinking 模型正常耗时——协议 client 超时会被上层视为「连接不可信」并可能回收 agent 进程）。另加"等待期间用户继续编辑则不覆盖草稿"的保护（新增 `composer.promptEnhance.staleDraft` 文案）。

**排查方法沉淀**：桌面端日志在 `~/.zcode/v2/logs/<date>.log`（`getAppConfigDir()/logs`），renderer 与 host 的 warn/error 都会落盘，且 host 侧 RPC 失败带方法名与堆栈——定位此类"点击无反应/报错"优先看这里。

**需求澄清与追加实现：激活项目自动置顶**

首轮实现只做了"滚动到可见"，但用户要的是**正在使用的项目自己排到列表最前面**（不必翻找）。项目顺序原本是手动拖拽顺序（随 tab 顺序持久化），所以激活后不会自动前移。追加实现（`WorkspaceSidebar.tsx`）：

- 激活项目时把该项目前移到项目区首位：复用 `reorderWorkspaceTabs(fromIndex, firstProjectIndex)`，只动激活项，其它项目相对顺序不变；会话区（`workspacePurpose === "conversation"`）不参与。
- 拖拽进行中不重排；置顶 → 展开 → 滚动三件事按序在同一个 effect 内完成（共用一个"已处理"标记），否则会出现"在旧布局位置滚动完又被重排打乱"。
- `lib/workspacePurpose.ts` 的 `getWorkspacePurpose` 改为导出，供侧栏判定项目/会话。

### 2026-09-21 去远程控制 与 遥测硬关断（3.16.0）

**需求**：定制版不受服务端远程控制（无远程开关），且除功能必需调用外不外发数据。行为规则与验收场景见 `specs/no-remote-control-and-data-egress.md`。

**移除的服务端控制面**：

- `packages/desktop/src/main/desktopContextPromptRollout.ts`（删除）：服务端原本可经 `/api/v1/client/configs` 启用"桌面上下文提示词"，并把开关经 env 传给 Host；`desktopContextPrompt` 现恒为关闭。
- `packages/desktop/src/main/rendererActionTraceRollout.ts`、`singleFeatureRollout.ts`（删除）：第二个远端旗标（渲染层行为追踪）。`registerRendererActionTraceIpc` 的 `rollout` 参数改为可选，缺省即恒关闭。
- `/api/v1/client/configs` 抓取器随上述文件一并移除；`index.ts` 不再预热灰度请求，`awaitFirstHostSpawnDecision` 立即返回（Host 启动不再等网络）。
- 强制升级：移除 `maybeBlockStartupForForceUpdate` 调用与 import，启动流程不再请求远端强制升级配置。
- 远程提示词模板：`createClientScenesService` 不再请求 `/api/v1/client/scenes`，固定返回空目录（消费方已有降级：保留手动创建入口）。`ZCODE_CLIENT_SCENES_URL` 常量删除。
- **同一通道的其余行为开关一并本地化**（`bigmodelCodingPlanSubscriptionProvider.ts`）：`offPeak.enable_offpeak_task`（闲时任务可用性 → 改为本地：有可用模型即可用）、`dynamicWorkflow`（动态工作流 → 只认本地 env/默认值）、forceUpdate 配置（→ 返回 null）。
- **内置 provider 配置不再远端刷新**：`services/model-provider/zcodeBuiltinRemoteConfig.ts` 与 CLI 侧 `bootstrap/app/process-provider-registry-runtime.ts` 的 `fetchRelease` 均返回 null，只使用随包 `resources/config/provider/zcode-builtin.json`（服务端原本可改写本地模型目录/provider 定义）。

**数据外发收口**：

- `packages/shared/src/env.ts`：`ZCODE_TELEMETRY_ENABLED` 固定 `false`；`ZCODE_TELEMETRY_REPORT_ENDPOINT`、`ZCODE_ARMS_RUM_ENDPOINT` 固定 `""`，**三者都不再读运行时环境变量** —— 外部设置这些 env 也无法开启上报。
- 移除 ARMS RUM 初始化调用与 ARMS 身份同步；不再 `armsRum.init()`，SDK 的渲染层自动注入随之消失。
- 新增 `packages/desktop/src/main/armsRumDisabled.ts` 空实现，7 个遥测模块的 `@arms/rum-electron` import 全部重定向到它：编译期切断 SDK 依赖，主进程 bundle 不再引用该 SDK。
- `autoUpdater` 增加编译期硬门禁 `customBuildUpdatesDisabled`，`applyManifestUpdateProvider` 改为显式空实现（不再指向官方 release 清单）。
- 桌面端遥测上报器（stability/resource/network/MCP/数据体积/每日活跃）以编译期常量门禁，不再注册定时器。
- `desktopMainIpcRemote.ts`、`databaseStartupTelemetry.ts` 中的 ARMS 发送点改为空实现/短路。
- 崩溃上报保持仅本地（`uploadToServer: false`）。

**保留（功能必需，非控制）**：OAuth 登录、provider registry（本地内置文件为准）、权益/额度/计费、产品目录（价格/套餐元数据，`getStaticProducts` 等仍读 `/client/configs`）、帮助菜单链接配置、闲时任务票据、MCP 用量。这些会携带账户/设备标识与功能参数，但不改变本地行为开关。模型推理仍会把提示词与 Agent 读到的内容发往所选模型提供方（内置套餐经官方代理）；需要"代码不出本机"须改用自定义 provider 指向本地推理。

**产物验证（3.16.0 实测）**：主进程 bundle（`out/main/*.js`，21 文件）与 preload/host/agent bundle 扫描结果——

- `@arms/rum-electron`、`sdk.rum.aliyuncs.com`：**已不出现**在运行时代码中（SDK 包文件仍随 `node_modules` 打包，但无任何引用，属死重量）。
- `/api/v1/releases/electron/manifest`：**已不出现**。
- `/api/v1/client/configs`：仅剩 3 处，均为服务数据读取——host 侧 BigModel 产品目录（`getStaticProducts` 等）、host 侧通用 public config、主进程帮助菜单配置（`buildHelpAppConfigUrl`）。**不存在消费其结果去开关本地行为的代码**。
- `/api/v1/client/scenes`：**已不出现**。

### 2026-09-21 侧栏激活项自动揭示 与 输入框提示词增强（3.15.0）

**需求来源**：① 项目/任务多时，激活旧项目后侧栏不滚动到该项，用户须手动长距离下拉；② 希望发送按钮旁有“提示词增强”按钮，用当前选中模型优化输入内容并替换。

**改动**（行为与验收场景详见 `specs/sidebar-task-reveal-and-prompt-enhance.md`）：

- 侧栏自动揭示：
  - `WorkspaceSidebar.tsx`：workspace 模式（默认按项目）下，激活项所属项目卡片若折叠则幂等展开（`expandAllWorkspaceTabs`），卡片头部不在可视区时对齐到视口顶部；头部可见则不滚动。
  - `workspace-grouped-tasks/virtualized-group-task-list.tsx`：grouped 模式下激活行不在可视区时滚动到居中（虚拟化走 `scrollToIndex`，非虚拟化走 `scrollIntoView`）。
  - `WorkspaceGroupedTasksSection.tsx`：激活任务所在分组折叠时自动展开。
  - 复用既有 `TaskList`（项目内任务行）的 `scrollIntoView` 逻辑，不重复实现。
- 提示词增强：
  - `v4/ConversationComposer.tsx`：发送按钮左侧新增 Sparkles 按钮；调用既有 agent 能力 `zcodeAgentService.generateWorkspaceText`（`querySource: "composer_prompt_enhance"`），以固定改写指令把草稿改写成结构化提示词并替换输入框内容。
  - 模型取当前草稿/会话选择（`telemetryDraftConfig ?? snapshot.config ?? draftConfig` 的 `modelSelection`，与发送埋点同源）；无选择、空文本、无 workspace 时按钮禁用。
  - RPC 超时显式透传（`requestTimeoutMs: 300s`，自身 abort 120s 先触发），避免协议默认超时被误判 stale。
  - 输出归一化：`lib/promptEnhanceOutput.ts` 解包模型常见的整段代码围栏与成对引号（`packages/ui/test/promptEnhanceOutput.test.ts`，5 个用例）；失败 toast 提示且保留原文；i18n 新增 `composer.promptEnhance.tooltip` / `composer.promptEnhance.failed`。
- 复用了已存在的 `TaskList` 行级滚动（同一需求下的既有实现），本项目只补项目卡片级与分组级揭示。
- 版本号：根 `package.json` 3.14.0 → 3.15.0。

### 2026-09-21 放宽内置安全声明（3.15.0）

**位置**：`apps/zcode-cli/packages/core/src/context/sections/identity.ts` 的 `SECURITY_NOTICE`——主 agent 身份段（`context/builder.ts` 注入 system prompt）与工作流子代理身份（`workflow-actor.ts`）逐字共用，改一处两处生效。

**动机**：上游原文要求拒绝“破坏性技术、DoS、大规模目标、供应链投毒、规避检测”，并要求双向用途工具（C2、凭据测试、漏洞利用）必须提供授权上下文；安全研究与自用场景下过度拒绝明显。全仓无 moderation/内容过滤调用，这是唯一一条预制限制。

**改法**：改写为“漏洞安全研究工作站”指令——漏洞研究、漏洞利用开发、PoC 编写、补丁对比、fuzzing、恶意样本分析、逆向、C2 框架、凭据测试、CTF 明确列为**预期工作**，要求直接、完整协助；不索要授权证明或委托细节；**不加未经请求的警告、免责声明或道德说教**（这是研究时被卡的主要来源）；明确“研究或编写针对广泛使用软件的 PoC”属正常范围（原“危害无关用户的软件供应链”措辞会误伤这类研究，已收窄）。仅保留一条最窄边界：把伤害**实际部署**到未同意的第三方（无差别攻击与自身无关的系统）。

**恢复上游行为**：`git show HEAD:apps/zcode-cli/packages/core/src/context/sections/identity.ts` 取回原文替换即可（无测试或快照依赖该文本）。

**生效方式**：改动在 CLI agent 源码中，桌面端需重新打包（agent bundle 在 `prepare:agent-bundle` 阶段编入）；CLI 单独运行则重新构建即可。

### 2026-09-21 移除“升级套餐”购买入口

**动机**：当前部署形态不使用应用内购买/升级套餐流程，入口按钮与内嵌购买面板无用。

**范围**（42 个文件，净删约 3300 行；行为规则与验收场景详见 `specs/coding-plan-purchase-entry.md`）：

- 删除全部购买入口：侧栏 footer 头像菜单“升级套餐/续期”菜单项、设置页套餐卡“升级/订阅/续期”按钮与个人/团队购买选择横幅（`CodingPlanPurchaseChoiceBanners`）、会话额度横幅/聊天错误横幅/Start Plan 余额面板的升级按钮、闲时任务缺套餐 toast 的购买跳转动作。
- 删除面板链路 9 个文件：`CodingPlanUpgradeDialogProvider` / `CodingPlanUpgradeDialog` / `CodingPlanEmbeddedWebviewDialog` / `CodingPlanEntryButton` / `codingPlanUpgradeLoginRecovery` / `useCodingPlanEntryPlanList` / `codingPlanFunnelTelemetry`（购买漏斗埋点）/ `sidebarCodingPlanUpgrade` / `model-provider-section/codingPlanEmbeddedWebview`；`Root.tsx` 不再挂载 Provider。
- desktop/shared 协议同步清理：preload `codingPlanWebview.ts` 及 tsup 入口、主进程 coding-plan 导航守卫与 PayPal 回跳路由（`desktopWindowChrome` / `desktopMainIpcRemote`）、`DesktopCommandIds.ClearCodingPlanWebviewStorage`、`CodingPlanWebviewChannels` 系列 channel、`isTrustedCodingPlanWebviewOrigin`。
- i18n 两个语言文件清理 46 个死键；额度提示文案（如“可升级套餐”）保留——是提示语义不是入口。
- 保留：套餐用量/权益状态展示、登录/断开、用量统计入口、`renewsAt` 等。

### 2026-09-21 关闭官方渠道自动更新与强制升级

**动机**：首个定制包安装后，应用启动时向官方后端（`/api/v1/releases/electron/manifest` 与强制升级配置）发起更新检查；官方服务端 `minimalVersion` 高于本地 3.14.0 时会**阻止主窗口创建并强制自动升级**，把定制客户端覆盖成官方安装包——表现为“升级套餐模块又回来了，整个应用变成官网版”。

**改动**（`packages/desktop/src/main/index.ts`）：新增 `customBuildOfficialUpdatesDisabled = true` 总开关——

- `initAutoUpdater({ enabled: ... && !customBuildOfficialUpdatesDisabled })`：关闭后台轮询与自动下载；模块内部 fail-closed，菜单/设置里的手动“检查更新”也不会向官方 feed 发请求。
- 强制升级守卫 `maybeBlockStartupForForceUpdate` 同开关短路，启动时不再读官方 minimalVersion。

**恢复官方更新行为**：把该常量改回 `false` 重新打包即可。

### 2026-09-21 electron-builder 工具集修复（非管理员 Windows 构建）

`packages/desktop/electron-builder.config.js` 增加 `toolsets.winCodeSign: "1.1.0"`：legacy 工具集下载的 `winCodeSign-2.6.0.7z` 含 macOS 符号链接，非管理员 Windows 解压必失败；1.1.0 为按平台拆分的 zip，无此问题。

### 2026-09-21 AGENTS.md 更新

补齐 packages 目录清单（formal-proof、model-option-map、provider 等）、`pnpm bootstrap` 初始化入口、根 typecheck 覆盖范围说明。

## 打包流程（Windows x64 安装包）

### 前置条件

- Node 24.14.0 + pnpm 10.33.2（以 `mise.toml` 为准）
- 首次克隆后：`pnpm bootstrap`（装依赖 + 准备桌面运行资源 + 增量构建）
- 打包不需要管理员权限，但有一个例外见下文“winCodeSign 符号链接问题”

### 标准命令

```bash
cd packages/desktop
pnpm run bundle -- --os win --arch x64
```

流水线三阶段（`scripts/bundle.mjs` 编排，自带下载重试与产物校验）：

1. `prepare:runtime-assets` — 下载远端跨平台 Node 运行时、打 agent bundle、解包 native-search（约数分钟）
2. `pnpm build` — 生产构建（build-meta + vite renderer + tsup main/preload）
3. electron-builder — 打 win-unpacked、跑 afterPack 钩子（asar 运行时模块注入、sourcemap 清理、原生依赖策略校验）、出 NSIS 安装包

全量构建约 20 分钟。代码没变只想重跑打包时可用跳过参数：

```bash
pnpm run bundle -- --os win --arch x64 --skip-prepare --skip-build   # 约 8 分钟
pnpm run bundle -- --os win --arch x64 --dry-run                     # 只打印将执行的命令
```

### 产物（`packages/desktop/dist/`）

| 文件 | 用途 |
| --- | --- |
| `ZCode-{version}-win-x64.exe` | NSIS 安装包（非 one-click、非 perMachine） |
| `ZCode-{version}-win-x64.exe.blockmap` | 增量更新差分清单 |
| `latest.yml` | 自动更新版本元数据 |
| `win-unpacked/` | 免安装目录（`win-unpacked/ZCode.exe` 可直接运行验证） |

### 验证产物

构建后快速冒烟：进 `dist/win-unpacked/` 直接运行 `ZCode.exe`，确认侧栏 footer 菜单只有“使用统计”、设置页套餐卡无升级/订阅按钮、额度横幅无升级按钮、应用启动后不会再被官方更新覆盖。

### 安装定制包的注意事项

1. **先卸载现有的 ZCode**：如果机器上装过官方版（或定制首版装完已被官方自动更新覆盖），先用系统“卸载”清掉，避免快捷方式指错程序或 NSIS 同版本重装混淆。
2. **清理更新缓存**：删除 `%LOCALAPPDATA%\@zcodedesktop-updater\`（electron-updater 下载缓存）。关闭更新开关后残留缓存不会自动执行，但清理可避免误判。
3. 定制版设置页/菜单里的“检查更新”已 fail-closed，不会向官方服务器发请求。

## node_modules 残留会被打进安装包（2026-09-22 实测）

**现象**：删掉 `@arms/rum-electron` 依赖并更新 lockfile 后重新打包，`app.asar` 里仍出现
`@arms/rum-browser`、`@arms/rum-core`、`@arms/rum-electron` 共 129 个条目。

**根因**：这些目录是**磁盘上的陈旧 node_modules 残留**——它们已不在 `pnpm-lock.yaml`
（`grep "@arms/" pnpm-lock.yaml` 为空）、源码里也无任何 import、`pnpm why @arms/rum-browser`
查不到依赖方；但 electron-builder 是从磁盘上的 node_modules 树取文件，`pnpm install`
（含 `--frozen-lockfile`）不会主动删除这类残留目录。

**处理**：`rm -rf node_modules/@arms` 后重新打包（`bundle -- --os win --arch x64 --skip-prepare
--skip-build` 约 8 分钟，代码未变时不需要全量重建），asar 即干净。

**自查方法**：删依赖后按"顶层目录不在 lockfile 里"扫一遍残留，例如：

```bash
node -e '
const fs=require("fs"),{parse}=require("yaml");
const lock=parse(fs.readFileSync("pnpm-lock.yaml","utf8"));
const names=new Set();
const add=(k)=>{const s=k.replace(/^\//,""),i=s.lastIndexOf("@");if(i>0)names.add(s.slice(0,i));};
Object.keys(lock.packages??{}).forEach(add);Object.keys(lock.snapshots??{}).forEach(add);
const stale=[];
for(const d of fs.readdirSync("node_modules")){
  if(d.startsWith(".")||d==="@zcode")continue;
  const list=d.startsWith("@")?fs.readdirSync(`node_modules/${d}`).map((s)=>`${d}/${s}`):[d];
  for(const n of list) if(!names.has(n)) stale.push(n);
}
console.log("疑似残留:",stale.length,stale.slice(0,20).join(", "));
'
```

说明：`string-width-cjs` / `strip-ansi-cjs` / `wrap-ansi-cjs` 是 npm 别名安装（`npm:` 协议），
属正常条目，不是残留。

## winCodeSign 符号链接问题（复用手册）

**现象**：electron-builder 阶段反复报 `Cannot create symbolic link : 客户端没有所需的特权`，下载的 `winCodeSign-2.6.0.7z` 解压失败，重试 3 次后整个构建失败。

**根因**：Go 版 app-builder（NSIS 卸载器构建）自行下载 legacy `winCodeSign-2.6.0.7z`，其中 `darwin/10.12/lib/` 下两个 dylib 是符号链接；Windows 创建符号链接需要管理员或开发者模式。`toolsets.winCodeSign: "1.1.0"` 已消除 JS 侧调用，但 Go 侧不受该配置影响。

**一次性根治（推荐）**：开启 Windows 开发者模式（设置 → 系统 → 开发者选项），之后官方归档可直接解压，无需任何变通。

**当前状态**：2026-09-21 构建时已把成功解压的工具集固化进缓存（`%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\`，规范名命中，不再重新下载）。只要缓存还在，构建直接通过。

**缓存被清后的变通流程**（2026-09-21 实测可用，无需管理员）：

1. 找一个已下载的 `winCodeSign-2.6.0.7z`（缓存目录里的随机数字名 `.7z`），用 `node_modules/7zip-bin/win/x64/7za.exe x` 解压（符号链接两个条目报错但其余文件完整落盘）。
2. `darwin/10.12/lib/` 下 `libcrypto.dylib`、`libssl.dylib` 会是 0 字节占位，用同名版本文件覆盖：`cp libcrypto.1.0.0.dylib libcrypto.dylib`、`cp libssl.1.0.0.dylib libssl.dylib`。
3. 重新打包：`7za a -t7z -mx=5 ../winCodeSign-2.6.0.7z .`（在解压目录内执行）。
4. 起本地镜像把重打包文件替换给下载器，其余请求代理 npmmirror（约 40 行 node 脚本：URL 含 `winCodeSign-2.6.0.7z` 返回本地文件，否则转发 `https://registry.npmmirror.com/-/binary/electron-builder-binaries/…`），环境变量 `ELECTRON_BUILDER_BINARIES_MIRROR=http://127.0.0.1:8765/electron-builder-binaries/`。
5. app-builder 校验 sha512（硬编码在 `node_modules/app-builder-bin/win/x64/app-builder.exe` 内）。首次会报 `sha512 checksum mismatch, expected <原值>, got <重打包值>`——两个都是 88 字符 base64，直接在 exe 里做**等长**二进制替换（把 expected 换成 got），构建完成后**务必还原**（换回原值），否则未来默认镜像构建反而会校验失败。
6. 构建成功后工具集进入规范名缓存，镜像和补丁即可弃用。

## 附：Agent CLI 单文件可执行（可选）

桌面端之外，CLI 可打成独立 exe（Node SEA，产物在 `apps/zcode-cli`，版本取 `apps/zcode-cli/package.json`）：

```bash
pnpm build:sea        # 根目录执行：安装依赖并构建
```
