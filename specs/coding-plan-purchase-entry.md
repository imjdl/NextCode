# Spec：Coding Plan 购买/升级入口移除

## 背景与决定

本仓库当前部署形态不使用应用内购买/升级套餐流程，移除全部「升级套餐」入口按钮与内嵌购买 webview 面板。套餐用量、权益状态、账号登录/断开等展示能力保持不变。

## 行为规则

- 不存在任何打开购买面板的 UI 入口：
  - 侧栏 footer 头像菜单仅保留「使用统计」入口，不再有「升级套餐/续期」菜单项。
  - 设置页模型供应商 Plan Card 不再渲染「升级 / 订阅 / 续期」按钮与个人/团队购买选择横幅（`CodingPlanPurchaseChoiceBanners`）。
  - 会话额度横幅（`ConversationQuotaBanner`）、错误横幅（`ChatErrorBanner`）、Start Plan 余额面板（`StartPlanContextBalance`）只展示文案与「设置模型」等恢复动作，不提供升级动作。
  - 闲时任务缺少 Coding Plan 时 toast 仅提示原因（`offPeak.create.codingPlanToast`），无跳转购买的动作按钮。
- 购买面板链路整体删除：`CodingPlanUpgradeDialogProvider` / `CodingPlanUpgradeDialog` / `CodingPlanEmbeddedWebviewDialog` / `CodingPlanEntryButton`（入口守卫按钮）/ `useCodingPlanEntryPlanList` / `codingPlanFunnelTelemetry`（购买漏斗埋点）/ `codingPlanUpgradeLoginRecovery` / `model-provider-section/codingPlanEmbeddedWebview` 不再存在，Root 不再挂载 Provider。
- 桌面侧不再为购买页提供专用能力：
  - 删除 preload `codingPlanWebview.ts` 及其 tsup 入口；所有 `<webview>` 统一使用 `embeddedBrowserJavaScriptDialog` preload。
  - `desktopWindowChrome` / `desktopMainIpcRemote` 中针对 coding-plan 官网页的导航守卫、PayPal 回跳路由、webview 身份粘滞逻辑删除；内置浏览器既有导航守卫不变。
  - `DesktopCommandIds.ClearCodingPlanWebviewStorage` 与 `clearCodingPlanWebviewStorage`（persist:zcode-coding-plan partition 清理）删除；登出/清数据流程不再调用。
- 协议层清理：`CodingPlanWebviewChannels`、`CodingPlanPurchaseCompletePayload`、`CodingPlanWebviewLocale`、`CodingPlanWebviewLangChangeDetail`（`packages/shared/src/channels.ts`）与 `isTrustedCodingPlanWebviewOrigin`（`packages/shared/src/zcodeEndpoint.ts`）删除。

## 状态所有者

- 套餐权益与用量事实仍由 entitlement/usage 服务与 `useUsageEntitlement` 系 hook 所有；本次改动不改变任何状态所有权，只删除指向购买面板的 UI 边。
- 闲时任务准入（是否需要 Coding Plan）的判断逻辑不变，仅去掉了 toast 里的购买跳转动作。

## 验收场景

1. 侧栏 footer 菜单打开：只有「使用统计」，无升级/续期项。
2. 设置 → 模型供应商 → Coding Plan 套餐卡：可登录/断开、查看状态与额度；无升级、订阅、续期按钮，无个人/团队购买横幅。
3. 会话中额度耗尽：横幅文案正常展示且可关闭；无「升级」按钮；错误横幅仍提供「设置模型」。
4. 闲时任务创建而无 Coding Plan：toast 提示需要套餐，无动作按钮。
5. 桌面端登出/清除全部数据：不再清理 coding-plan webview partition（该 partition 已不存在）。
6. `pnpm typecheck`、`pnpm lint`、`pnpm architecture:check --changed` 通过。

## 遗留说明

- `settings.modelProvider.codingPlan.purchase.*` i18n 键族为更早已移除的原生购买面板遗留（本次改动前即无引用），`codingPlan.purchase.individualsSectionTitle` 与 `codingPlan.purchase.selectPlan` 仍在使用；其余未在本次范围内清理。
- 额度文案中「可升级套餐」等措辞（如 `chat.quota.startPlan.modelExhausted`）保留，属于提示语义而非入口。
