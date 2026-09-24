# 聊天框 token 速率显示（流式回复）

## 目标

流式输出期间，在聊天输入框上方实时显示当前这条回复的生成速率（token/秒），
让用户直观感知模型速度；输出结束即消失，不影响既有布局与功能。

## 产品规则

- 只在「当前模型 response 存在流式输出行」时显示；response 结束（无 streaming 行）
  立即隐藏。draft（无会话）与只读视图不显示。
- 速率 = 当前 response 已生成的 token 估算值 ÷ 该 response 首行产出到现在的耗时
  （累计平均，非滑动窗口）。
- token 为**估算值**：v4 帧不携带逐帧真值 usage（`sessionUsageState` 仅在消息完成时
  更新会话累计值），流式期间按启发式估算并在 UI 上以「≈」标示：
  CJK 字符 ≈ 0.6 token/字符，其它字符 ≈ 1 token/4 字符（向上取整前先加权求和）。
- 统计范围 = 当前 streaming response 的 assistantText + reasoning 行（含同 responseId
  已完成的 reasoning 行；不含工具输出、子代理）。当前 response 以第一个
  `state === "streaming"` 的输出行的 `assistantResponseId` 定位；旧行缺 id 时退化为
  「所有 streaming 行」。
- 生成不足 750ms 或不足 1 token 时不显示（速率抖动过大）。
- 帧驱动更新 + 每秒 1 次兜底 ticker（流停时数字仍按时间推进，不过期不冻结 UI）。

## 状态所有者

- 流式内容真值：per-session projection store（`conversationProjectionStore`），
  唯一所有者，rate 组件只读订阅（`useSyncExternalStore` 多订阅者，Set 实现）。
- 展示层无新持久状态：速率为渲染期纯推导（`streamingTokenRate.ts` 纯函数），
  ticker 仅驱动重渲染，不落库、不进 snapshot、不跨会话。

## 接口

- 纯逻辑：`packages/ui/src/v4/streamingTokenRate.ts`
  （`estimateTokens` / `collectStreamingResponseStats` / `computeTokenRate`）。
- 组件：`packages/ui/src/v4/StreamingTokenRateStrip.tsx`，渲染于 SessionPane 底部
  dock（quota/recovery/queue 横幅之后、`{composerNode}` 之前），样式与现有横幅族一致
  （`text-ui-*` 字号、`text-foreground-subtle` 弱化色、lucide 图标）。
- i18n：新增键 `chat.streamingTokenRate`（zh-CN / en-US），只增不改。

## 验收场景

1. 发送一条触发长回复的消息 → 输入框上方出现「≈ N token/s」，随流式帧与每秒
   ticker 动态更新；回复完成/停止后立即消失。
2. 先 reasoning 后正文的回复 → reasoning 阶段即开始计数；正文开始后速率计时
   不重置（同一 responseId）。
3. 多轮工具调用 → 每个新 model response 重新计时计数（上一个 response 的 token
   不累入）。
4. 桌面与手机 Web 均正常显示，主题切换（含黑客主题）颜色正常。
5. 单测覆盖：token 估算（中/英/混合/空）、response 定位与退化、速率阈值门控。
