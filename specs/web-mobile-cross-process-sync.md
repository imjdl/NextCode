# Spec：跨端界面同步（桌面端变更在 Web/手机端可见）

## 背景与问题

用户报告：桌面端发生的变更（新任务、任务状态/标题变化等）在 Web 端/手机端看不到。
`pnpm dev:desktop` 的桌面窗口一切正常；只有打开 Web/手机界面时不同步。

## 根因（代码级证据）

三端的进程与数据拓扑：

| 端       | 进程                                                                                                              | 数据                                                                                       | 变更通知                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 桌面     | 窗口 Host 进程（services A + CLI 运行时 A）                                                                       | 写共享 SQLite                                                                              | CLI A topic → syncer A 写库 + **进程内 emitter** → 桌面 renderer 实时刷新 |
| Web/手机 | web-remote 服务进程（services B + CLI 运行时 B，**独立运行时**，见 `specs/desktop-web-remote-panel.md` 已知取舍） | 同一份共享 SQLite（`~/.zcode/v2/tasks-index.sqlite`、`~/.zcode/cli/db/db.sqlite`，均 WAL） | 同上，但只覆盖**自己进程**的变更                                          |

断点（三个，全部代码确认）：

1. CLI 的 sessions-index projection 是**纯内存归约、无 IO**（`sessions-index-projection.ts` 文件头自述），
   每进程一份——B 的 CLI 永远不知道 A 的会话，因此 B 的 v4 索引 topic 不会出现桌面端新建/变更的任务。
2. `WorkspaceTaskListChanged` 通过 syncer 的 **workspaceEmitters（进程内 Emitter）** 广播
   （`zcodeTaskIndexSyncer.ts`），A 的广播到不了 B 进程，也就到不了 B 的 ws 客户端。
3. 渲染层任务列表刷新**纯事件驱动**（`useWorkspaceTaskLists` + `taskListRefreshPolicy`），
   没有事件就没有重拉；无轮询、无可见性触发。

⇒ 数据本身是共享的（另一个进程重新查询即可读到桌面端的写入），**缺的只是跨进程的变更通知**。
桌面端变更只能在 Web/手机端手动整页刷新后才能看到——正是用户观察到的现象。

## 修复方案

不动"独立运行时"架构（attach 桌面 Host 是上游设计，工作量另计，仍为后续项）；
补一条**基于共享存储的跨进程变更通知**：

### 1. 服务端 watcher（`packages/services`）

新模块 `sharedTaskIndexChangeWatcher.ts`：

- 用**独立只读连接**打开 `tasks-index.sqlite`，每 1s 轮询 `PRAGMA data_version`
  （跨进程提交会令其变化；查询本身无 IO 负担）。
- 变化后 300ms 去抖触发回调；`dispose()` 停止定时器并关闭连接。
- 文件不存在/暂时打不开时静默重试（与 TaskIndexRepo 的初始化时序解耦）。

`zcodeTaskIndexSyncer` 增加选项 `crossProcessTaskIndexRefresh`：开启时内部启动 watcher，
检测到外部变化后对**已存在的每个 workspace emitter** fire
`WorkspaceTaskListChanged { reason: "task_meta_changed" }`（渲染层现有策略对该 reason 做
membership 重拉，从共享 SQLite 读回桌面端的行）。emitter 需同步记录创建时的 workspace
path/identity，保证事件字段正确。`disposeAll()` 一并释放 watcher。

### 2. 接线范围（关键约束）

只在 **Web 服务进程**启用：`packages/desktop/src/web-remote/server/index.ts`（手机端访问）与
`packages/server/src/entry-http.ts`（web dev/独立服务）给 `createLocalServices` 传
`crossProcessTaskIndexRefresh: true`。**桌面窗口 Host 不启用**——桌面已有真实事件流，
watcher 只会制造重复刷新。

### 3. 渲染层 focus 重拉（兜底）

`useWorkspaceTaskLists` 增加 `visibilitychange → visible` 时的 refresh 触发（3s 节流）。
覆盖服务重启等 watcher 空窗；对桌面端无害（最多多一次廉价查询）。

## 状态所有者

- tasks-index SQLite：仍是唯一事实源（两进程共写共读，WAL）。
- 变更事件：各进程自己的 workspaceEmitters；watcher 只是把**其他进程的写入**翻译成本进程的
  `task_meta_changed` 事件，不引入第二事实源。
- 轮询节奏：watcher 自持（1s/300ms 去抖），不进协议。

## 已知限制（诚实记录，不隐藏）

- **实时流式不同步**：桌面端正在运行的会话，其流式输出不会实时推到手机端（那需要 attach 桌面
  Host 的架构，本修复不做）。手机端看到的是任务列表与任务状态的自动更新；会话**内容**在重新
  打开该任务时经 cold resume 从共享持久化读到最新。
- watcher 只盯 `tasks-index.sqlite`（任务列表/状态/标题）；会话正文库 `db.sqlite` 的变更不轮询
  （正文更新由打开会话时的 resume 覆盖）。
- `data_version` 无法区分"谁写"，本进程自己的写入也会触发一次额外广播——频率为任务级操作节奏，
  可接受（换来的是无需侵入 TaskIndexRepo 的写路径）。

## 验收场景

1. **单测**：`packages/services/test/sharedTaskIndexChangeWatcher.test.ts` —— 另一连接提交后
   回调在 interval 内触发；无写入不触发；dispose 后停止。
2. **跨进程端到端**：起 web 服务进程（选项开启）+ 浏览器（手机视口）打开工作区；用**独立进程**
   直接向同一 `tasks-index.sqlite` 插入/更新该 workspace 的任务行（模拟桌面 Host 写入）；
   断言页面侧栏在 ~5s 内自动出现/更新该任务，**无需手动刷新**。
3. **桌面端不受影响**：桌面装配不启用该选项（grep 验证）；现有 typecheck/lint/单测全绿。
4. focus 兜底：页面切入后台再切回，任务列表触发一次重拉（节流内只一次）。

## 会话内容同步（第二阶段，2026-09-22 深夜追加）

用户实测补充的两个症状，与上面的断点同根但落在会话内容层：

- 历史记录与提问内容能同步（cold resume 读共享 SQLite；user message 持久化早）。
- **AI 后续生成内容不同步**；另一端查看该会话时状态显示**「已停止」**。

### 根因（代码级）

1. **「已停止」**：transcript-hydration 把"最后一条 assistant 无 error 且无收口"的 turn
   收口为 interrupted（`transcript-hydration.ts` collectTurnOutput，注释自述"本轮按
   interrupted 收口"）。单进程世界这是对的（进程退出=中断）；双进程下，另一端的 CLI
   cold-resume 一个"桌面端仍在跑"的 turn 时，把它误判成已停止。
2. **后续内容不同步**：订阅期间 hydration 是一次性的；桌面端之后写入持久化的内容，
   本进程内存投影永远不知道（无跨进程事件），订阅者收不到任何新帧。水合读取路径读
   session_entry 事件日志（非 message/part 行）。

### 修复（v4/conversation/refresh 协议 + 双 watcher）

| 层          | 改动                                                                                                                                                                                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| shared 协议 | 新方法 `v4/conversation/refresh`（空参；结果 `{ack:{refreshedCount}}`，与 resync 的 ack 包装惯例一致）                                                                                                                                                                                       |
| CLI gateway | `refreshConversationsFromPersistence()`：遍历 publishers，对"有订阅者、无流式行、过 2s 节流"的会话执行 `hydratedSessions.delete + hydratePublisher(force)`；hydration 尾部自动向现有订阅者 emitReservation 推新快照（复用既有 forceRebuild 通道，先例见权限授权恢复路径）                    |
| CLI server  | `V4_METHODS.conversationRefresh` case，ACK-only                                                                                                                                                                                                                                              |
| services    | `zcodeAgentService.refreshConversationsFromPersistenceV4()`：对每个已活跃 runtime 各发一次（单 runtime 失败不阻断）；`getSessionStoreDatabasePath()` 与 CLI 默认 `storage.sessionDbPath` 完全同源（`~/` → homedir；CLI 不读 ZCODE_DATA_BASE_DIR/ZCODE_HOME，watcher 也不能读，否则盯错文件） |
| 驱动        | `crossProcessConversationRefresh` 选项（仅 Web 入口开启）：db.sqlite 的 data_version watcher → 串行化下发 refresh（in-flight 合并）                                                                                                                                                          |
| 健壮性      | transcript-hydration 对 `state` 缺失的历史 tool part 行源头跳过（真实库上首次踩到：`part.state.input` TypeError 让整个会话的水合失败，refresh 永远无效）                                                                                                                                     |

### 验证（真实 home、零写入污染）

- **协议链路**：独立进程（B=services+watcher+订阅；A=桌面 CLI 持续写真实库）：
  B 订阅当前活跃会话 → watcher 自动触发 → CLI 日志出现连续
  `hydrate_three_source_merge`（2s 节流节奏）且 `gateway_error × 0`；订阅期间收到新帧
  （无需重订/刷新）。修复前对照：每 2s 一条 `v4.hydrate` 崩溃
  （`Cannot read properties of undefined (reading 'input')`），refresh 全部无效。
- **单元**：`sharedSqliteChangeWatcher.test.ts` 3/3。
- 桌面端不受影响：选项只在两个 Web 入口为 true；桌面窗口 Host 不调用 refresh（自己就是写者）。

### 残余限制（记录在案）

- 桌面端**正在生成期间**，手机端仍短暂显示「已停止」（水合无法区分"被中断"与"他端进行中"，
  需 attach 架构才能根除）；桌面端收口后 ≤ 数秒内自动收敛为完成态并补全内容。
- refresh 只重水合"有订阅者"的会话；无人在看的会话在下次被打开时经 cold resume 读到最新。
- CLI 侧每会话 2s 节流 + watcher 1s 轮询/300ms 去抖：内容同步延迟量级为秒级，非流式实时。

### Review 后修正（2026-09-22）

- **缺口**：第一版只在 Web 服务进程启用刷新，「手机端发起、桌面端查看」方向完全未覆盖
  （桌面 runtime 永不重读手机端的写入）。已在桌面 Host 的 createLocalServices 同样开启
  两个选项（流式守卫保护桌面自己生成中的会话；自身写入的冗余触发由节流吸收）。
- **验证边界（如实记录）**：已证实——watcher 触发、CLI 对有订阅者会话重水合（日志
  `hydrate_three_source_merge` 持续出现、脏行崩溃已修、gateway_error 归零）、订阅期间
  收到新帧。**未证实**——帧内容包含桌面端新增文本的逐字节比对（rowsRange 需要 trusted
  connection，脚本层无法直查投影）与真实浏览器/手机界面的可视化更新。后者需重打安装包后
  由用户真机验证：桌面端发消息 → 手机端不刷新页面，数秒内出现后续内容且「已停止」在
  turn 收口后自动变为「已处理」。

## 第三阶段：运行状态实时化 + 流式内容准实时（2026-09-22 追加）

用户实测的两个残余症状（第二阶段"残余限制"的具体化）：

1. **运行动画缺失**：桌面侧栏会话条目运行时有旋转动画；网页版同一界面无动画。
2. **内容非流式**：thinking/正文只有整轮结束后才一次性出现在网页版，无生成过程呈现。

### 根因（代码级，四路调查确认）

- **动画**：转圈唯一依据是 sessions-index 帧的 `phase ∈ {running, prewarming}`
  （`taskListItemPresentation.ts`，且策略明确不信任落盘 status）；phase 是每个 CLI 进程内
  纯内存投影。网页版订阅 web-remote 自己的 runtime B，B 对桌面驱动的会话只有冷启动种子
  硬编码的 `phase: "completedSuccess"`（`v4-bridge.ts` loadStoredSessionSummaries）→ 永不转。
  tasks-index 虽有 `task_status` 列，但只在首次入索引/seeding 时写 running，第 2 轮起
  停留在上一轮终态；且 UI 刻意不拿它驱动动画（防历史任务假转）。
- **流式**：text/reasoning 增量只进驱动进程内存（30ms flush），生成期间**零落库**
  （model step 完成才写完整 part，`turn-model-step.ts`）；跨进程只有轮询重水合（秒级）。
  两面叠加：即使轮询再快，库里也没有进行中正文可读。

### 方案（不新建 IPC；驱动进程落库 + 消费进程按新鲜度采信）

**A. 运行状态心跳（tasks-index，修动画）**

- 写侧（驱动进程的 `zcodeTaskIndexSyncer`）：进程内 sessions-index 观察到某会话
  phase 进入 running/prewarming → upsert `task_status="running"` + meta 增记
  `runtimeHeartbeatAt`（epoch ms）；运行期间每 ~3s touch 一次；终态迁移时同批清除心跳。
  双向对称：谁驱动谁写（桌面驱动桌面写，手机驱动 web-remote 写）。
- 读侧（UI，两端口径一致）：leading 判定链改为
  **本进程 sessions-index live phase > 新鲜心跳（`now-runtimeHeartbeatAt < 15s`）的落盘
  running > 现状**。新鲜度窗口保证驱动进程崩溃后最多 15s 假转即回落——保留原策略
  "不信任陈旧 running"的初衷，只放宽"新鲜且被证实"的一类。
- 通知：复用第二阶段 tasks-index watcher（心跳 touch 即外部写入 → 对端 membership 重拉）。

**B. 流式增量落库 + 水合保活（db.sqlite，修流式）**

- 写侧（CLI `turn-model-step`）：text/reasoning 流式回调里以 ~1s 节流（首拍立即）
  把**已累计全文** upsert 为进行中 part（不写完成标记，touch 行的更新时间）；
  model step 完成时的最终写不受影响（同 id 覆盖为完成态）。取消路径不变。
- 读侧（`transcript-hydration` / `cold-event-merge`）：发现"未完成且更新时间新鲜
  （<10s）"的尾部 text/reasoning part → 投影为 streaming 行、**不合成 cancelled 收口**、
  turn 保持打开；新鲜度过期 → 回落现有 interrupted 收口（进程崩溃语义不丢）。
- gateway：refresh 守卫从"快照含 streaming 行即跳过"改为"仅本进程 live 的会话跳过"
  （镜像出来的 streaming 行不能关掉自己的刷新）；每会话节流 2s→1s。
- 端到端节奏：写 1s + watcher 1s/300ms + 节流 1s ⇒ 网页版 ~1–3s 一拍的准流式呈现
  （含 thinking），turn 收口后自动转完成态。

### 状态所有者

- tasks-index 心跳：驱动进程唯一写者；消费端只读 + 新鲜度判定，不回写。
- db.sqlite 进行中 part：CLI 唯一写者；完成态覆盖写；水合只读。
- 新鲜度阈值（15s/10s）常量集中在 shared，双端同源。

### 验收场景

1. 单测：心跳新鲜度判定（新鲜转/过期不转/终态清除）；水合对"新鲜未完成 part"
   产出 streaming 行且不收口、对"过期未完成 part"维持 interrupted；leading 判定链
   降级顺序。
2. e2e（真实 home、双进程）：A 进程驱动 CLI 生成长回答，B 进程订阅 → 侧栏动画在
   ~5s 内出现；会话内容以 1–3s 一拍持续增长（含 reasoning 行）；A 收口后 B 自动变
   完成态；A 中途被杀后 B 心跳过期回落「已停止」。
3. 桌面端回归：桌面自驱动的动画/流式不受影响（live phase 恒优先）；终态迁移与
   最终结果同步链路（第二阶段验收）原样通过。

### 实施与验证记录（2026-09-23）

改动清单（30 处补丁 + e2e 期间追加 1 处修复）：

| 层 | 文件 | 内容 |
| --- | --- | --- |
| shared | zcode-task-types-core.ts / validation.ts | `ZCodeTaskMeta.runtimeHeartbeatAt` + `RUNTIME_HEARTBEAT_FRESH_MS=15s` + `isFreshRuntimeHeartbeat`；schema 增字段 |
| repo | taskIndexRepo.ts | `TaskIndexStatePatch.runtimeHeartbeatAt?: number \| null`；applyAgentPatch 设置/保留(null 清除) |
| syncer | zcodeTaskIndexSyncer.ts | 运行中会话 3s 节流写 status=running+心跳（事件驱动 + 空闲定时器双通道）；终态同批清除；disposeAll 释放 |
| UI | taskListRowActivity.ts / taskListItemPresentation.ts | leading 判定链：live phase > 新鲜心跳 > 不转；排序运行层同步放宽 |
| contracts | session-store.port.ts | TextPart/ReasoningPart 增 `inFlightUpdatedAt?` |
| CLI 写侧 | turn-model-step.ts / cancelled-stream-persistence.ts | onStreamSnapshot ~1s 节流 upsert 进行中 text/reasoning part（预分配 part id）；完成/取消写复用同 id 覆盖收口 |
| CLI 水合 | transcript-hydration.ts | `in_progress` resultType；新鲜进行中 part 不发 text/reasoning_end、不合成 TurnComplete（过期回落 cancelled）；`HYDRATION_IN_FLIGHT_FRESH_MS=10s` |
| gateway | v4-gateway.ts | refresh 守卫改 locallyDrivenTurns（TurnStarted/TurnComplete 记账 + 120s 死账兜底）；节流 2s→1s；**e2e 发现的修复：record 被驻留池空闲驱逐后 refresh 直接 force 水合会清空投影（loadPersistedEvents 无 record 分支返回空事件），先经 ensureColdReadyPublisher 重建 record** |

验证：

- **单测 17/17**：水合投影（新鲜 streaming 不收口/过期 interrupted 回落/正常 success 回归/旧库兼容）、UI 判定链（live 优先/新鲜转/陈旧不转/error 优先/无 sidecar 兜底）、repo 心跳往返（设置/保留/终态清除）、存储层同 id upsert 与完成覆盖、watcher 回归。
- **双进程 e2e（真实 home、真 CLI dist、真 HTTP/WS、零模型调用、临时行已清理）**：
  手工向真实 db.sqlite 写进行中 part 模拟对端流式落库 → B 进程 services+watcher+WS 订阅：
  ① 冷恢复**首帧**即含 streaming 进行中正文；② 外部进行中 upsert 在数秒内推来**新的
  streaming 帧**（旧守卫会跳过 streaming 会话，此路径为本次修复核心）；③ 完成写后帧收敛
  `state=complete`（最终结果同步不破坏）。期间 syncer 对该会话的心跳/终态写路径被真实
  触发（任务索引出现过临时行，已清理）。
- **门禁**：根 typecheck 0 错；bootstrap/core/contracts/adapters typecheck 0 错
  （**注意：CLI dist 是 esbuild 打包不做类型检查，且各包 exports 指向 dist——改 CLI
  侧代码后需重跑各包 tsc 构建再重打 cli bundle，否则 dev/打包用的都是旧代码**）；
  根 lint 90 警告 0 错误（与基线持平）。

仍未证实（需重打安装包后真机）：turn-model-step 在真实模型流中的落库节奏、
真实浏览器/手机界面的动画与内容呈现、心跳 15s 回落在真崩溃场景的表现。
