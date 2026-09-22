# Spec：去掉官方渠道入口（文档 / 社群 / 问题上报 / 提需求 / 检查更新）

## 目标

定制版不向官方产品团队提反馈、也不依赖官方站点与更新通道。本轮去掉这五个入口：

| 入口 | 现状 | 处理 |
| --- | --- | --- |
| 产品文档 | 打开 `https://zcode.z.ai/docs` | 删除入口与常量 |
| 用户社群 | 桌面端读官方 `client/configs` 取社群链接后打开 | 删除入口与整条帮助配置链路 |
| 问题上报 | 打开反馈对话框（bug 类型） | 删除菜单/命令面板入口；**反馈功能保留**（错误横幅、任务项仍可上报） |
| 给产品提需求 | 打开反馈对话框（需求类型） | 删除入口与对应的 store 动作 |
| 检查更新 | 帮助菜单 / 托盘菜单 / 原生菜单触发更新检查 | 删除这些入口；更新器本身在定制版已关闭 |

## 规则

1. **入口全清**：同一功能若同时存在于帮助菜单、命令面板、托盘菜单、原生菜单，必须一起删除，
   否则会出现"菜单里没了、命令面板还能打开"的半吊子状态。
2. **功能与入口分开判断**：反馈（feedback）另有多处入口（错误横幅、任务列表项），因此只删本表列出的
   两个入口与"提需求"专用动作，**不删反馈功能本身**；插件更新（`settings.plugins.checkForUpdates`）
   与产品更新无关，保持不动。
3. **随之变成孤儿的代码一并删除**（不留死代码）：社区链接解析链路（`openCommunity` →
   main 侧 `desktopHelpConfig` → shared `helpAppConfig`/`remoteAppConfig` → web `communityUrl`）、
   产品文档常量、更新菜单标签逻辑（`useDesktopUpdateMenu`/`desktopUpdateMenu`）。
   删除前必须用 `pnpm dep:refs`/grep 证明无其他调用方；更新**状态管道**（`UpdateStatePayload` 等）
   予以保留：它仍被桌面顶栏与 IPC 使用，且更新器在定制版已关闭，不影响行为。
4. **i18n 同步**：删除后跑 `pnpm i18n:dead-keys`，把因此变死的键族清掉。

## 验收场景

1. 帮助菜单只剩「资源管理器」「关于 NextCode」（Web 端只有「关于」）。
2. 命令面板不再出现产品文档/用户社群/问题上报相关命令；其余命令不受影响。
3. 托盘菜单与原生菜单不再出现「检查更新」。
4. 错误横幅与任务列表项里的反馈入口仍可用（反馈对话框能正常打开并提交）。
5. `pnpm typecheck`、`pnpm lint`、`pnpm i18n:dead-keys` 通过；无新增死键；
   实测帮助菜单截图确认。

## 实际结果与保留项（诚实记录）

**已删**：五个入口在帮助菜单、命令面板、托盘菜单、原生菜单（mac）中的所有出现点；
随之孤立的模块 `helpMenuActions.ts` / `productDocs.ts` / `useDesktopUpdateMenu.ts` /
`desktopUpdateMenu.ts` / `FeatureRequestDialog.tsx`，以及平台命令 `CheckForUpdates`、`OpenCommunity`、
IPC 通道 `CanOpenCommunity`、`feedbackStore.openFeatureRequest` 与 `featureRequestOpen` 状态。

**刻意保留**（删了会连带破坏仍在用的能力）：

| 保留项 | 原因 |
| --- | --- |
| 反馈功能整体（对话框、提交链路、错误横幅与任务列表项入口） | 本轮只删"菜单/面板里的两个入口"，功能本身仍被使用 |
| 帮助配置链路（`desktopHelpConfig` → shared `helpAppConfig`、web `communityUrl`） | 仍被 `openFeedback` 与 `UpdateStatusButton` 的反馈/更新地址解析使用；删掉会波及反馈提交 |
| 更新状态管道与 `UpdateStatusButton`（含 `desktopMenu.help.downloadingUpdate*` 文案） | 更新器在定制版已关闭，但状态展示仍属既有能力，不在本轮范围 |
| 原生菜单的「更新日志」与 `settings.plugins.checkForUpdates`（插件更新） | 前者不在需求列表内，后者与产品更新无关 |
| `autoUpdater` 的菜单标签同步 | 菜单项已不存在，该逻辑退化为 no-op；更新器本身已关闭，暂不动以免影响更新状态机 |

**验证证据**：命令面板实测截图无官方渠道命令；构建产物中「产品文档/用户社群/问题上报/给产品提需求」
命中数为 0，而「资源管理器/关于 NextCode」仍在；`titleBar.menu.help.checkForUpdates` 的 UI 文案已删，
残留的「检查更新」字样仅来自插件更新文案、更新状态提示与一段注释。
`pnpm typecheck` 通过、`pnpm lint` 90 warnings / 0 errors（较基线少 1，因删除了带告警的文件）、
三个测试文件 20/20 通过、i18n 检查器无"可安全删除"家族残留（另手工删除 9 个已核实无引用的键）。
