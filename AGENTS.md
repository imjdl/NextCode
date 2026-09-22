## 核心原则

- 新增或修改行为前，先更新对应 spec；目录不存在时按需创建。先明确产品规则、状态所有者、接口和验收场景，再实现代码。
- 以当前检出的源码、`package.json` 和架构策略为准。说明中只保留当前仓库提供的功能、命令和文件；删除功能时同步清理指令和技能中的引用。
- 定位问题时，未明确要求修改代码就先调查原因。结合源码、日志和运行时证据，区分已确认原因与待验证假设。
- 保留与任务无关的本地改动，不自行恢复已移除的模块或内部依赖。

## 定制版身份与边界

本仓库是 ZCode 开源版的**衍生定制版**，产品名 **NextCode**（上游基线见 `BUILD.md` 首段）。以下边界不要越：

- **内部标识刻意不改名**：`@zcode/*` 包名、`ZCODE_*` 环境变量、`zcode` 命令、`zcode-protocol` 协议标识、`~/.zcode` 数据目录、存储键（`zcode-theme`、`zcode_lite_token`）。改它们会破坏与上游代码、既有数据和用户环境的兼容。
- **已移除、不要恢复**：官方渠道入口（产品文档/用户社群/问题上报/给产品提需求/检查更新，涉及帮助菜单、命令面板、托盘与原生菜单）、遥测（编译期硬关断且 SDK 依赖已删）、官方自动更新与强制升级。
- **手机端访问（`webRemote.*`）仅限局域网**：只监听用户选择的局域网地址，不支持公网；不要引入 relay、隧道、端口映射或内网穿透。面板与文档都要写明这一限制。
- **品牌图形是生成的**：字形与图标由 `scripts/generate-brand-assets.mjs` 从参数化几何产出（安装器 3D 盒子用 `scripts/patch-installer-icon.mjs`）。改字形改脚本里的 `N_PARAMS` 后重跑，不要手改 PNG/ICO；源码里再出现原型 Z 字形会被生成器的断言直接拦下。
- **发布链路**：`origin` 指向 GitHub；上游历史已从本地历史移除，不要 `git fetch` 上游后再拼接历史，也不要重写已推送的历史。

## 命令与仓库结构

开工前运行 `node scripts/check-workspace-freshness.mjs` 检查基线。Node 版本以 `mise.toml` 为准，克隆后初始化执行 `pnpm bootstrap`。

以下命令从仓库根目录执行：

| 用途             | 命令                                                  |
| ---------------- | ----------------------------------------------------- |
| 类型检查         | `pnpm typecheck`                                      |
| Lint             | `pnpm lint` / `pnpm lint:fix`                         |
| 格式检查         | `pnpm fmt:check`（**基线即失败，见「已知坑」**）      |
| 桌面开发         | `pnpm dev:desktop`                                    |
| Web 开发         | `pnpm dev:web`                                        |
| CLI 开发         | `pnpm --filter @zcode/cli dev`                        |
| 提交前检查       | `pnpm verify:pre-push`（Lint 与架构检查）             |
| 架构检查         | `pnpm architecture:check --changed`                   |
| 模块阅读包       | `pnpm architecture:context <module-id>`               |
| 未使用依赖与导出 | `pnpm knip`                                           |
| 导出引用查询     | `pnpm dep:refs --list-exports <file>`                 |
| i18n 死键报告    | `pnpm i18n:dead-keys`                                 |
| i18n 死键清理    | `pnpm i18n:prune-dead-keys -- --write`                |
| 单测（约定）     | `node_modules/.bin/tsx --test <path/to/*.test.ts>`    |
| 打包后产物核验   | `node scripts/verify-desktop-artifact.mjs`            |
| 安装完整性自检   | `node scripts/check-install-integrity.mjs <安装目录>` |
| 品牌资产重生成   | `node scripts/generate-brand-assets.mjs`              |

测试入口以目标包当前的 `package.json` 和实际测试文件为准，不假定存在统一的单测或 E2E 命令；现有测试用
`node:test` + `node:assert/strict`，经 tsx 运行（`--test` 直接跑 `.ts` 会因 `.js` 说明符解析失败）。

- `packages/desktop`：Electron main、host、renderer。
- `packages/web`、`packages/server`：Web 客户端与服务端；`packages/zcode-server-cli`：服务端 CLI。
- `packages/ui`：共享 React 组件、hooks 与 Zustand store。
- `packages/services`：业务服务；`packages/rpc`：RPC 框架。
- `packages/shared`：共享协议与类型；`packages/client`：Agent 客户端 SDK。
- `packages/provider`、`packages/provider-node`：模型/账号 provider 配置与选择及 Node 侧实现；`packages/model-option-map`：模型 option map 的解析与求值。
- `packages/formal-proof`、`packages/zcode-cua`：独立 Vite 可视化页面；Computer Use 占位包（运行时接口全部 fail closed）。
- 注意：`packages/formal-proof`、`packages/model-option-map`、`packages/zcode-cua` 不在根 `pnpm typecheck` 范围内，前两者需用各自的 `typecheck` 脚本。
- `apps/zcode-cli`：Agent CLI 与运行时，自身是嵌套 workspace（`apps/zcode-cli/packages/*`、`apps/zcode-cli/tools/*`，含 core、tui、adapters、dynamic-workflow、node-repl-host 等）。
- `CONTEXT.md`：插件商店领域词汇；修改相关 UI 前阅读。
- `DESIGN.md`：UI 设计规范；修改 UI 前阅读。
- `BUILD.md`：定制改动记录、桌面安装包打包手册、版本号管理、产物核验与安装完整性排查；定制构建前阅读。
- `specs/`：每项定制改动的目标、规则、状态所有者与验收场景；改行为前先在这里更新或新增。
- `docs/releases/`：已发布版本的说明正文（含校验值）；发 release 时直接复用。
- `README.md` / `README.en.md`：来源与许可、与上游差异、仓库结构；`NOTICE.md`：许可与来源声明（发布时必须保留）。

## 已知坑与工作方式

这些是本仓库环境与工具链的实际行为，不知道会白跑或做错结论：

- **根 `pnpm typecheck` 不覆盖 `packages/desktop` 的 main/preload/renderer**（`tsconfig.main.json` 等有既存错误，不是门禁），而这些文件由 esbuild/tsup 转译、**不做类型检查**。删改命令 id、通道、导出时，残留引用会静默退化（实测 `case DesktopCommandIds.X` 会变成 `case undefined`），必须手工 grep 全部引用。
- **工作区文件是 CRLF，Git Bash 控制台是 GBK**：多行精确文本替换不要用 shell heredoc 或 `node -e`（反斜杠、换行、引号会被吞，导致"未命中"或写坏文件）；改用 Read/Edit 工具，或先用 Write 写一个脚本再执行。校验中文内容与产物时用 Node 按 UTF-8 读文件判断，不要用 grep 看控制台输出（会有假阴性）。
- **ripgrep 的 `-r` 是 `--replace` 而不是递归**：递归搜索只用 `-n`/`-l`，否则输出里的匹配会被"改写"，看起来像文件被改过。
- **`pnpm fmt:check` 在基线即失败**（`.agents/skills/**` 等上游 vendored 文档不合规）。只对自己新增/改动的文件跑 `npx oxfmt <files>` 并报告结果，不要顺手全仓格式化。
- **i18n 只改值、不改键**，且 intl 的 id 是普通 `string`：删掉仍在使用的键不会让 typecheck 报错（运行时显示键名本身）。删键前用 `pnpm i18n:dead-keys` 判定，它按"家族级可证明安全"筛，动态拼键族会被跳过。
- **打包前清 `node_modules` 陈旧残留**：已从 lockfile 移除的包仍会被 electron-builder 打进 asar（实测遥测 SDK 残留 129 个条目）；打完后跑 `verify-desktop-artifact.mjs`，装完若出现"所有会话恢复失败"先跑 `check-install-integrity.mjs`（曾出现安装落盘不完整：包内文件正常，装到磁盘后有 2336/2517 个小文件内容全零，重装即恢复）。
- 用户会亲自安装验证构建产物并读日志：结论要给出可复核的证据（命令输出、产物扫描、截图），不要只报"已完成"。

## 实现与验证

- 代码改动使用 `.agents/skills/architecture-governance/SKILL.md`，先运行架构检查，再读取目标模块的受控上下文。
- 避免重复状态和多条写入路径。明确唯一所有者、接口、依赖方向、事件顺序与幂等边界，不能用超时掩盖同步问题。
- 有行为改动时先补充对应测试；交互改动需要 E2E 场景。检查测试与实现是否一致，并实际执行可用的验证。未执行或环境受限时如实说明。
- 修复 bug 时用中文注释说明原因和修复依据。发现设计缺陷时先与用户对齐，不不断增加兜底分支。
- 涉及状态、时序、远端或异步同步的方案，用图展示所有者及事件顺序。
- 必须执行 `pnpm typecheck` 和 `pnpm lint`，报告真实结果，不将已有失败写成通过。
- 使用异步文件和网络 IO；跨包导入使用公开入口，遵守现有路径别名。
- 禁止 UI 直接调用 Repo、Service 引用 Runtime 具体实现、跨域导入实现细节及循环依赖。

## UI 与平台边界

- 遵守 `DESIGN.md`，复用已有组件，兼顾桌面与手机 Web 的布局、交互、主题和国际化。
- 组件通过 `packages/ui/src/hooks/` 访问服务；平台操作通过 `IPlatformService`（`packages/shared/src/platform.ts`），不直接调用 `window.zcode`。
- 通过依赖注入处理 Desktop、Web、本地和远程环境的差异，并兼顾 Windows、macOS 和 Linux。
- Zustand 状态位于 `packages/ui/src/store/`。广播同步的主题、语言等字段需要防止回环；UI 局部状态不应被误当作服务端事实。
- hooks 中含 JSX 的文件使用 `.tsx`。

## 进程、协议与远程控制

- Desktop app 通过 stdio 与 Agent 通信。协议改动同步更新 `packages/shared/src/zcode-protocol/index.ts`，提供严格类型与运行时校验。
- Main 负责窗口、原生操作、进程调度和消息转发，不承载 task/session 业务状态。
- 每个窗口使用一个 window-scoped Local Host；本地 workspace 共享该 Host。远程 workspace 由窗口内的连接注册表管理，不另建 Desktop Remote Host。
- 手机远控连接桌面已有 Host attachment，复用会话运行时；不为手机另起 Agent、Local Host 或远程会话。
- Desktop 的 `desktop-continuous` 实时链路与手机的 `web-remote-replayable` 恢复链路必须明确区分。修改 stream、snapshot、queue 或重连时，同时验证两种语义。
- 外部 relay 与 Main 只做鉴权、配对、心跳、转发及 attachment 调度，不保存任务队列、快照等业务状态。
- 已接受的 busy/running 输入由 CLI/runtime `CommandInbox` 串行 admission；Renderer 只保留未提交草稿与 pending optimistic overlay，Host owner/lease 负责路由。
- 保留 owner/lease、跨 Host 路由和 stale run 防护，不能仅根据单一路径删除边界判断。

## Workspace Identity

- `workspaceIdentity` 用于身份隔离，`workspacePath` 用于文件操作、命令 cwd、Git 和路径展示。
- 身份 key 统一为 `workspaceIdentity?.trim() || workspacePath`，适用于去重、绑定、缓存、队列、持久化和请求关联。
- 远程链路贯穿传递 `workspaceIdentity` 与 `remoteSessionId`，不得仅按路径匹配。
- 新接口保留本地路径 fallback；远程 identity 复用现有构造和解析工具，不在业务代码中手写格式。

## 日志

- UI 使用 `packages/ui/src/logger.ts`，不直接使用 `console.log` 或 `window.zcode?.log`。
- Agent/session/runtime 相关服务日志使用 `createServiceLogger(scope)`（`packages/services/src/logger/serviceLogger.ts`）。
- `debug` 用于协议原始数据、流式 chunk 和逐条工具更新等高频诊断，生产环境不落盘。
- `info` 用于进程和会话生命周期、权限结果、一次性初始化等生产可用事件。
- `warn` 用于可恢复异常；`error` 用于崩溃、握手失败、鉴权丢失等不可恢复错误。
- 不在日志、示例或提交中写入凭据、真实用户数据和内部服务地址。
