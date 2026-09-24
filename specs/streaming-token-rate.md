# 聊天框 token 速率显示（流式回复）

## 目标

流式输出期间，在聊天输入框上方实时显示当前这条回复的生成速率（token/秒），
让用户直观感知模型速度；输出结束即消失，不影响既有布局与功能。

## 产品规则

- 只在会话 `control.phase === "running"` 且当前轮已有正文/思考产出时显示；
  轮次结束（completed*/error/draft/prewarming）立即隐藏。只读视图不显示。
- **统计范围是整个回复轮次（turn），不是单个 model response**：
  - 工具执行间隙（读文件/执行命令）没有流式文本行，但轮次仍在 running——
    速率条保持显示，按累计时间自然回落，不再随 response 边界闪隐；
  - 同轮跨 response 的正文 + 思考 token 累加（用户语境里的「这条回复」是整个轮次）；
  - 当前轮以最新一行的 `turnId` 定位（running 期间最新行必属活跃轮次）。
- 速率 = 当前轮已生成的 token 估算值 ÷ 该轮首个正文/思考行到现在的耗时
  （累计平均，非滑动窗口）。
- token 为**估算值**：v4 帧不携带逐帧真值 usage（`sessionUsageState` 仅在消息完成时
  更新会话累计值），流式期间按启发式估算并在 UI 上以「≈」标示：
  CJK 字符 ≈ 0.6 token/字符，其它字符 ≈ 1 token/4 字符（向上取整前先加权求和）。
- 生成不足 750ms 或不足 1 token 时不显示（速率抖动过大）。
- 帧驱动更新 + 每秒 1 次兜底 ticker（流停时数字仍按时间推进，不过期不冻结 UI）。

## 提示词增强（composer 内）

- 增强走一次性 RPC（`generateWorkspaceText` 等全文返回），**没有逐帧数据**，
  流式速率客观上不可得：
  - 进行中：输入框上方显示「提示词增强中… 已用 Ns」（每秒 ticker）；
  - 完成：按结果文本给出估算速率「≈ N tokens · M token/s」，显示 6 秒后消退；
  - 失败或草稿被中途编辑时立即隐藏（toast 仍走原路径）。

## 状态所有者

- 流式内容真值：per-session projection store（`conversationProjectionStore`），
  唯一所有者，rate 组件只读订阅（`useSyncExternalStore` 多订阅者，Set 实现）。
- 展示层无新持久状态：速率为渲染期纯推导（`streamingTokenRate.ts` 纯函数），
  ticker 仅驱动重渲染，不落库、不进 snapshot、不跨会话。
- 增强进度状态归 `ConversationComposer` 局部（React state + 定时器 ref），
  与 composer 同生命周期。

## 接口

- 纯逻辑：`packages/ui/src/v4/streamingTokenRate.ts`
  （`estimateTokens` / `collectActiveTurnTokenStats` / `computeTokenRate`）。
- 组件：`packages/ui/src/v4/StreamingTokenRateStrip.tsx`，渲染于 SessionPane 底部
  dock（quota/recovery/queue 横幅之后、`{composerNode}` 之前），**右对齐**于输入框上方，
  样式与现有横幅族一致（`text-ui-*` 字号、`text-foreground-subtle` 弱化色、lucide 图标）。
- 增强指示：`ConversationComposer` 内 error 横幅与输入 surface 之间，同款样式、
  同样右对齐。
- i18n：`chat.streamingTokenRate` / `chat.streamingTokenRate.title` /
  `composer.promptEnhance.enhancing` / `composer.promptEnhance.rateResult`
  （zh-CN / en-US，只增不改）。

## 验收场景

1. 发送一条触发长回复的消息 → 输入框上方出现「≈ N token/s」，随流式帧与每秒
   ticker 动态更新；回复完成/停止后立即消失。
2. 模型执行工具（读文件/执行命令）期间 → 速率条**保持显示**，数值按累计时间回落；
   工具结束后正文继续流式输出，速率回升（回归场景，不再闪隐）。
3. 先 reasoning 后正文的回复 → reasoning 阶段即开始计数；正文开始后速率计时
   不重置（同一轮次）。
4. 多轮工具调用 → 同轮跨 response 的 token 累计；新一轮用户输入开新轮重新计数。
5. 点提示词增强 → 显示增强计时；完成后显示估算速率 6 秒；失败/中途改草稿立即消失。
6. 桌面与手机 Web 均正常显示，主题切换（含黑客主题）颜色正常。
7. 单测覆盖：token 估算（中/英/混合/空）、phase 门控、工具间隙保持、跨 response
   累计、上轮不计入、无产出隐藏、速率阈值门控。
