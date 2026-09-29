# 模型切换标记的展示门控

## 目标

模型切换提示（「已从 X 切换到 Y」/「正在使用 X」分隔行）是**过程性**反馈：
只在发生切换的那一轮仍在运行时展示；任何会话/轮次结束后（实时完成、中断、
失败、历史回放、重启水合）都不再展示模型切换历史。

## 背景与历次修复

1. 首版：切换即落 timeline marker 行 + toast，历史持久回放。
2. 第一轮修复（44111e0）：`isRedundantModelChangeLabel`——渲染标签相同的切换
   （同模型不同 provider 身份）不再显示标记行与 toast。
3. 残留复现：轮次边界/恢复路径写入的 **from 为空的源缺失 model_change 记录**
   （会话库实锤：只有 toModel，如 `provider-uuid/deepseek-flash`）。它们没有
   from 标签，「标签相同抑制」天然盖不到，且持久化后在每次水合回放中永久展示。

## 规则（本轮收口）

- **唯一裁决点**：`packages/ui/src/v4/conversationTurnRenderUnits.ts`
  `materializeDraftUnit`——轮次非 running 时，modelChange marker 行从
  renderedRows / visibleAssistantWorkRows 一并剔除，对下游所有装配面
  （轮顶轻边界、正文流、工作段）生效。
- running 判定复用既有 `resolveTurnRunning`：turnHeader.state 为权威；
  缺 header 的旧投影按 completion-blocking 行回退（marker 本身不算，
  即旧投影的 marker 一律按非 running 处理 → 隐藏）。
- 该收口同时覆盖：实时完成后的 UI、重启/换端水合回放（持久化 part 重放、
  MC-cold 边界合成）、分享只读时间线、subagent 子会话——全部走同一 builder。
- CLI 侧写入（`recordPendingModelChange` / 水合合成 ModelSelected）**不改**：
  事实数据保留用于 resume 选型恢复与审计，只是不再进入展示。
- toast（`SessionPane.showModelChangeNotice`）只由实时 ModelSelected 事件触发，
  会话结束后无事件，天然不受影响；其冗余抑制仍由 `isRedundantModelChangeLabel` 承担。

## 验收场景

1. 运行中的轮次发生切换 → 标记行可见；轮次完成 → 标记行从时间线退出。
2. 打开任意历史会话（含含源缺失记录的旧会话）→ 无任何模型切换分隔行。
3. 多轮会话只有当前运行轮的标记可见，历史轮的不可见。
4. 中断/失败终态同样隐藏；分享视图与子会话视图一致。
5. 单测：`packages/ui/test/modelChangeMarkerTurnGating.test.ts`（6 例）。
