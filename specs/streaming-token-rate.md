# 会话状态行（轮次/步数 · token 速率 · 上下文 · 缓存命中）

## 目标

`control.phase === "running"` 期间，在聊天输入框上方（右对齐）显示一条紧凑状态行，
两组信息：

```
◷ 1 轮 9 步 · ≈ 301 tok/s        ⛁ 113K tok · 缓存命中 92%
```

让用户直观感知当前进度（第几轮、第几步）、生成速度、上下文占用与缓存命中；
轮次结束即消失，不影响既有布局与功能。

## 产品规则

- 显示条件：`control.phase === "running"`（含工具执行间隙）；轮次结束
  （completed*/error/draft/prewarming）立即隐藏。只读视图不显示。
- 轮次/步数（左组）：当前轮在**已加载窗口内**的序号（1 基，由 turnHeader 行计数；
  长轮把本轮 header 裁出窗口时退化为窗口内 header 总数，可能低估）；步数 = 当前轮
  toolCall 行数（不区分成败）。当前轮由窗口最新一行的 `turnId` 定位。
  模型首轮直接进工具调用时没有正文行 → 速率不显示，但轮次/步数照常显示。
- 生成速率（左组）：见「token 速率」小节。
- 上下文 token（右组）：`usage.contextWindow.usedTokens`，紧凑格式（950 / 113K / 1.3M）；
  容量未知或不适用时不显示该片段。
- 缓存命中（右组）：`usage.contextWindow.cache.hitRate`（投影侧是 cacheRead/input 的
  比率 0-1），展示为百分比并夹取 [0,100]；投影未提供时不显示该片段。
  右组两个片段都没有时整组隐藏；左组任何情况下都显示（running 且窗口非空）。

## token 速率

- **统计范围是整个回复轮次（turn），不是单个 model response**：
  - 工具执行间隙（读文件/执行命令）没有流式文本行，但轮次仍在 running——
    状态行保持显示，速率按累计时间自然回落，不随 response 边界闪隐；
  - 同轮跨 response 的正文 + 思考 token 累加（用户语境里的「这条回复」是整个轮次）；
  - 当前轮以最新一行的 `turnId` 定位（running 期间最新行必属活跃轮次）。
- 速率 = 当前轮已生成的 token 数 ÷ 该轮首个正文/思考行到现在的耗时
  （累计平均，非滑动窗口）。
- **token 计数是混合值**：
  - 已完成 response 用会话累计 usage 的真实增量（`usage.cumulative.outputTokens` 差值，
    按轮次捕获基准——含工具调用参数 JSON 的输出，这部分不存在 text/reasoning 行里，
    纯文本估算对含工具轮次实测偏差 38%，真实增量可完全覆盖）；
  - **思考（reasoning）行两条路径都计入**：真实 usage 的 output tokens 含 reasoning
    （消息级样本实证：7864 字思考对应 output=2603，reasoning 分项是可选上报且常为 0）；
    估算路径同样累计 reasoning 行的文本；
  - 投影侧 usage 口径：`cumulative.outputTokens` 只累计 main_turn——onModelComplete
    对 subagent/compact/session_title/goal_summary_title/web_fetch_processing 等维护
    调用在累计更新前 early return（不变量回归测试：
    `apps/zcode-cli/packages/bootstrap/test/mainTurnUsageAccounting.test.ts`）；
    该不变量被破坏时速率条会把维护调用输出算进主回复；
  - 流式中的行用字符估算（系数按会话库 21 条纯文本 GLM 消息实测拟合：
    CJK ≈ 0.95 token/字符、其它 ≈ 0.24 token/字符，样本整体误差 3.7%）；
  - 基准捕获时机：首轮输出行出现时 usage 必然未计入本轮输出（usage 在 response
    完成时才更新），此时捕获即为本轮真基准；基准不可信时回退纯文本估算——
    usage/基准缺失、增量为负、增量追不上已完成文本估算的一半（中途才挂载）。
- 计时起点按 turnId 捕获一次（组件 ref）：长轮把最早行裁出 rows.window 后，
  计时仍锚定真实生成起点，不随窗口裁剪漂移。
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
  （`estimateTokens` / `collectActiveTurnTokenStats` / `collectActiveTurnProgress` /
  `resolveTurnTokenCount` / `computeTokenRate` / `formatCompactTokenCount` /
  `formatCacheHitRate`）。
- 组件：`packages/ui/src/v4/StreamingTokenRateStrip.tsx`，渲染于 SessionPane 底部
  dock 的 **队列面板之前**（无可选横幅时即 composer 正上方），**右对齐**于输入框上方，
  样式与现有横幅族一致（`text-ui-*` 字号、`text-foreground-subtle` 弱化色、lucide 图标）；
  左组悬停显示已生成 token 数与耗时。
  **位置不可下移到队列面板之后**：队列面板用 `-mb-7 pb-7` 把自己的下沿塞进 composer
  卡片后面，夹在面板与 composer 之间的内容会被面板的不透明卡面（bg-surface +
  backdrop-blur）盖住——有队列时状态行会被遮盖（已修复的回归）。
- 增强指示：`ConversationComposer` 内 error 横幅与输入 surface 之间，同款样式、
  同样右对齐。
- i18n：`chat.streamingTokenRate` / `chat.streamingTokenRate.title` /
  `chat.sessionStatus.turnSteps` / `chat.sessionStatus.contextTokens` /
  `chat.sessionStatus.cacheHit` / `composer.promptEnhance.enhancing` /
  `composer.promptEnhance.rateResult`（zh-CN / en-US，只增不改）。

## 验收场景

1. 发送一条触发长回复的消息 → 输入框上方出现「N 轮 M 步 · ≈ R tok/s」与
   「X tok · 缓存命中 Y%」，随流式帧与每秒 ticker 动态更新；回复完成/停止后立即消失。
2. 模型执行工具（读文件/执行命令）期间 → 状态行**保持显示**（步数随工具执行递增），
   速率按累计时间回落；工具结束后正文继续流式输出，速率回升（回归场景，不再闪隐）。
3. 模型首轮直接进工具调用（无正文）→ 速率片段隐藏，轮次/步数与上下文片段照常显示。
4. 队列里有多个待发送命令时 → 状态行显示在队列卡片**上方**，不被队列面板遮盖
   （回归场景；队列面板下沿与 composer 的折叠区不得覆盖状态行）。
3. 先 reasoning 后正文的回复 → reasoning 阶段即开始计数；正文开始后速率计时
   不重置（同一轮次）。
4. 多轮工具调用 → 同轮跨 response 的 token 累计；新一轮用户输入开新轮重新计数。
5. 点提示词增强 → 显示增强计时；完成后显示估算速率 6 秒；失败/中途改草稿立即消失。
6. 桌面与手机 Web 均正常显示，主题切换（含黑客主题）颜色正常。
7. 单测覆盖：token 估算（中/英/混合/空）、phase 门控、工具间隙保持、跨 response
   累计、上轮不计入、无产出隐藏、速率阈值门控。
