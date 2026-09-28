# Web 客户端服务 hooks 的调用顺序（Rules of Hooks）

## 目标

web/手机端在加载期 workspacePath 从空变为有值时，应用不得崩溃或挂死；
任务列表与会话内容与桌面端表现一致。

## 规则

- `packages/ui/src/hooks/` 的 `useZCodeSessionService` / `useZCodeAgentService` /
  `useZCodeTaskService` 必须无条件按相同顺序调用全部 hooks：
  `useWorkspaceServices(...)` 与 `useServices()` 都调用，再按 `workspacePath`
  是否存在挑选结果。**禁止** `workspacePath ? useWorkspaceServices(...) : useServices()`
  式条件分支。
- 依据：web/手机端的项目信息异步就位，workspacePath 在渲染间会从 undefined 变为
  有值；条件分支使两次渲染走到不同 hook 序列，React 报「Hooks 顺序变化」并使
  内部 hook 链损坏（`areHookInputsEqual` 读 undefined 崩溃），子树崩溃或渲染挂死
  ——表现为任务列表全部停在加载转圈、会话内容打不开。桌面端 workspacePath 由
  原生层同步提供、恒有值，因此从未触发。
- `useWorkspaceServices` 只按元数据解析目标（远程/本地服务选择），不因
  workspacePath 为空产生连接副作用，无条件调用安全。

## 状态所有者

- 无状态变化：本规则只是渲染层 hook 调用顺序约束。

## 验收场景

1. 390px 手机视口加载 web 应用：打开侧栏抽屉 → 点击任意任务 → 会话正文完整
   渲染、页面保持响应、控制台无「order of Hooks」错误。
2. workspacePath 从空到有值的过渡（首次加载/切项目）不产生任何子树崩溃。
3. 桌面端行为不变（workspacePath 有值路径与原实现等价）。

## 后续修复（2026-09-28，手机端三问题）

1. **冷启动空白 → 明确加载态**：非草稿会话在 `connecting || snapshot 未到` 时，
   时间线 emptyState 渲染 Spinner + 「正在加载会话…」（`chat.conversation.loading`）。
   此前 emptyState 为 null——web/手机端首次打开其它 workspace 的会话需现起运行时并
   水合（实测本地 2-4s、手机过 WiFi 更长），期间正文区完全空白，用户看到的就是
   「点进去内容为空」。实测修复后冷启动窗口显示加载态、内容到达后替换，全程无空白。
2. **system32 幽灵项目**：webRemote 子进程（utilityProcess.fork 未设 cwd，Windows 上
   继承 `C:\WINDOWS\system32`）被服务端 `resolveServerWorkspaces` 注册为默认工作区
   （`process.cwd()` 回退），web 客户端取 `workspaces[0]` 作初始工作区 → 手机端出现
   system32 项目。修复：`WebRemoteStartRequest` 增加 `workspacePath`（面板传桌面当前
   激活工作区），main 转发为 `ZCODE_SERVER_WORKSPACE` 环境变量。
3. **提示词优化倒计时跨会话泄漏**：`ConversationComposer` 实例跨会话复用（key 固定），
   `enhanceProgress` 在 sessionId 变化时立即清除（含 6s 完成态定时器），
   倒计时/完成提示只在发起优化的会话中显示。
