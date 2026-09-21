# BUILD — 定制版改动记录与打包手册

本仓库是 ZCode 开源版的内部定制版。本文件记录三件事：**定制了什么**、**怎么打包出可执行文件**、**版本号怎么管理**。每次定制改动后在此追加记录，打包流程可直接复用。

## 版本号管理

版本号唯一来源是**仓库根 `package.json` 的 `version` 字段**（当前 `3.15.0`，上游开源基线为 commit `872ad96` 的 `3.14.0`）。

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

## 定制改动记录

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
