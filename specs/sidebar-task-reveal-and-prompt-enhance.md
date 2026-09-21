# Spec：侧栏任务自动揭示 与 输入框提示词增强

## A. 侧栏任务列表：激活任务自动揭示

### 行为规则

- 触发条件：激活项目/任务变化（点击行、恢复历史会话、其它 surface 选中、移动端远控），以及组件挂载时已有激活项。
- **workspace 模式（默认，按项目分组）**：`WorkspaceSidebar` 负责项目卡片级揭示——
  1. 所属项目卡片若折叠（`expandedWorkspacePaths` 不含该路径），自动展开（幂等 `expandAllWorkspaceTabs`），展开后重跑再定位；
  2. 卡片头部不在可视区时把卡片对齐到视口顶部（`block: "start"`）；头部已可见则不滚动；
  3. 卡片内的任务行滚动由既有 `TaskList` 逻辑完成（`block: "nearest"`，仅在项目展开后挂载，因此必须先展开）。
- **grouped 模式（按分组）**：`VirtualizedGroupTaskList` 负责行级揭示——
  1. 激活任务所在分组若折叠，由 `WorkspaceGroupedTasksSection` 自动展开（不从持久化偏好中永久移除其它组）；
  2. 行不在可视区时：组内虚拟化（>80 行）走 `scrollToIndex(index, { align: "center" })`；非虚拟化走 `scrollIntoView({ block: "center" })`。
- 已可见时不滚动，避免点击可见行导致列表跳动；每个激活值只揭示一次（流式刷新重渲不会把用户手动滚离的位置拉回）。
- 不改变列表排序与分组（保留手动拖拽顺序）；只做"揭示"，不做"置顶"。

### 状态所有者与边界

- 折叠状态所有者：项目展开 = `tabStore.expandedWorkspacePaths`（自动展开用幂等 `expandAllWorkspaceTabs`，不翻转用户偏好）；分组折叠 = `WorkspaceSidebar` 的 `collapsedGroupedTaskGroupIds`。
- 可见性判定：项目卡片用头部元素 rect（`data-testid=workspace-item-<path>` 挂在 CollapsibleTrigger 上，任务列表是其兄弟节点，故判定的是头部可见性）；任务行用行根元素 rect。
- 未覆盖：`timeline`（按时间）与 `archived` 视图无自动揭示；顶层节点数超过 80 触发顶层虚拟化时，目标分组可能未挂载，仅完成展开、不保证滚动到位。

### 验收场景

1. workspace 模式下激活长列表下方的项目里的旧任务：所属项目自动展开，项目卡片滚动到视口顶部，任务行随后滚入可视区。
2. grouped 模式下激活折叠分组内的任务：该组自动展开并滚动到该行居中。
3. 激活当前已可见的项目/行：列表不发生滚动跳动。
4. 手动拖拽排序与分组折叠偏好不受影响（自动展开只影响被激活项所在容器）。

## B. 输入框：提示词增强

### 行为规则

- 发送按钮左侧新增图标按钮（Sparkles，`ControlHintTooltip` 提示）。
- 点击行为（`ConversationComposer` 内）：
  1. 取当前输入文本（trim 后非空，否则按钮禁用）；
  2. 解析当前模型选择：`telemetryDraftConfig ?? snapshot.config ?? draftConfig` 的 `modelSelection`（与发送埋点同源的降级链）；缺失时按钮禁用；
  3. 调用 `zcodeAgentService.generateWorkspaceText`，`querySource: "composer_prompt_enhance"`，携带固定改写指令（要求：补全模糊意图、结构化、保留用户语言与 @ 引用等原文关键信息、只输出改写结果本身）；
  4. 成功：以结果 trim 后替换输入框文本（`inputApiRef.setText` + `updateText`，走既有草稿持久化链路）；空结果视为失败。
  5. 失败：toast 提示，输入框保持原文。
- 进行中：按钮 loading（Spinner），重复点击忽略；发送按钮不受影响。
- 无服务上下文（`useOptionalServices` 无 `zcodeAgentService`，如独立挂载的只读面板）时隐藏按钮。
- Stop 状态（任务运行中）下按钮仍可用（只改草稿，不触碰会话）。

### 状态所有者

- 增强请求不产生任何会话事件写入；模型调用经由 agent 服务 `generateWorkspaceText`（一次性生成，含用量记录与遥测，querySource 区分）。
- 草稿文本所有者不变：Lexical 输入 + `updateText`/草稿 store；增强只通过 `setText` 写入。

### 验收场景

1. 输入简短模糊提示词 → 点增强 → 按钮转圈 → 文本被结构化改写版本替换，语言与原输入一致。
2. 增强失败（网络/模型错误）→ toast 报错，原文保留。
3. 空输入 → 按钮禁用；无模型选择 → 按钮禁用。
4. 任务运行中（Stop 显示）→ 增强按钮仍可用且只影响草稿。
