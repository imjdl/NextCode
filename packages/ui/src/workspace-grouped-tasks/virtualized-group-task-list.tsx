import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ZCodeTaskMeta } from "@zcode/shared";
import { buildTaskWorkspaceKey } from "@/lib/taskQueryCache.js";
import { GroupedTaskItem } from "@/workspace-grouped-tasks/task-item.js";
import { taskKey } from "@/workspace-grouped-tasks/ids.js";
import {
  isPotentialVerticalScrollContainer,
  scrollGroupedTaskVirtualizerToOffset,
} from "@/workspace-grouped-tasks/virtualized-scroll.js";
import type { TaskGroupMenuItem } from "@/workspace-grouped-tasks/types.js";

const GROUPED_TASK_ROW_ESTIMATE_PX = 32;
const GROUPED_TASK_VIRTUALIZATION_THRESHOLD = 80;
const GROUPED_TASK_VIRTUALIZATION_OVERSCAN = 12;

function shouldVirtualizeGroupedTasks(taskCount: number): boolean {
  return taskCount > GROUPED_TASK_VIRTUALIZATION_THRESHOLD;
}

function findNearestScrollableAncestor(element: HTMLElement): HTMLElement | null {
  let current = element.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    if (isPotentialVerticalScrollContainer(style.overflowY)) {
      // group 展开动画刚开始时，祖先容器可能还没被内容撑到 scrollHeight > clientHeight。
      // 如果因此返回 null，react-virtual 会短暂没有 scrollElement，表现成内容区有高度但行不渲染。
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function resolveScrollMargin(listElement: HTMLElement, scrollElement: HTMLElement): number {
  return (
    listElement.getBoundingClientRect().top -
    scrollElement.getBoundingClientRect().top +
    scrollElement.scrollTop
  );
}

function isRowVisibleInScrollContainer(row: HTMLElement, container: HTMLElement): boolean {
  const rowRect = row.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return rowRect.top >= containerRect.top && rowRect.bottom <= containerRect.bottom;
}

export function VirtualizedGroupedTaskList({
  tasks,
  groupId,
  groups,
  activeWorkspacePath,
  activeWorkspaceIdentity,
  activeTaskId,
  getTaskRemoteSessionId,
  getTaskWorkspaceLabel,
  onSelectTask,
  onCloseTask,
  onOpenFileTree,
  onMoveTaskToGroup,
  onMoveTaskToTop,
  onStartRenameTask,
  onArchiveTask,
  onMarkTaskAsUnread,
  activeDragTaskKey,
  tooltipsDisabled,
}: {
  tasks: ZCodeTaskMeta[];
  groupId: string;
  groups: TaskGroupMenuItem[];
  activeWorkspacePath: string;
  activeWorkspaceIdentity?: string;
  activeTaskId: string | null;
  getTaskRemoteSessionId: (task: ZCodeTaskMeta) => string | undefined;
  getTaskWorkspaceLabel: (task: ZCodeTaskMeta) => string;
  onSelectTask: (workspacePath: string, taskId: string, workspaceIdentity?: string) => void;
  onCloseTask: (task: ZCodeTaskMeta) => void;
  onOpenFileTree?: (task: ZCodeTaskMeta) => void;
  onMoveTaskToGroup: (task: ZCodeTaskMeta, groupId: string | null) => void;
  onMoveTaskToTop: (task: ZCodeTaskMeta) => void;
  onStartRenameTask: (task: ZCodeTaskMeta) => void;
  onArchiveTask: (task: ZCodeTaskMeta) => void;
  onMarkTaskAsUnread: (task: ZCodeTaskMeta) => void;
  activeDragTaskKey?: string | null;
  tooltipsDisabled?: boolean;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const shouldVirtualize = shouldVirtualizeGroupedTasks(tasks.length);
  const getItemKey = useCallback(
    (index: number) => taskKey(tasks[index] ?? { workspacePath: "", taskId: String(index) }),
    [tasks],
  );

  const updateScrollMargin = useCallback(() => {
    const listElement = listRef.current;
    if (!listElement) {
      return;
    }
    const nextScrollElement = findNearestScrollableAncestor(listElement);
    setScrollElement(nextScrollElement);
    if (!nextScrollElement) {
      setScrollMargin(0);
      return;
    }
    setScrollMargin(resolveScrollMargin(listElement, nextScrollElement));
  }, []);
  const resolveInitialScrollOffset = useCallback(() => {
    const listElement = listRef.current;
    const currentScrollElement =
      scrollElement ?? (listElement ? findNearestScrollableAncestor(listElement) : null);
    return currentScrollElement?.scrollTop ?? 0;
  }, [scrollElement]);

  useLayoutEffect(() => {
    if (!shouldVirtualize) {
      setScrollElement(null);
      setScrollMargin(0);
      return undefined;
    }
    updateScrollMargin();
    const listElement = listRef.current;
    const resizeObserver =
      typeof ResizeObserver === "undefined" || !listElement
        ? null
        : new ResizeObserver(updateScrollMargin);
    if (listElement) {
      resizeObserver?.observe(listElement);
    }
    const animationFrame = window.requestAnimationFrame(updateScrollMargin);
    window.addEventListener("resize", updateScrollMargin);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateScrollMargin);
      resizeObserver?.disconnect();
    };
  }, [groupId, shouldVirtualize, tasks.length, updateScrollMargin]);

  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? tasks.length : 0,
    getScrollElement: () => scrollElement,
    estimateSize: () => GROUPED_TASK_ROW_ESTIMATE_PX,
    getItemKey,
    overscan: GROUPED_TASK_VIRTUALIZATION_OVERSCAN,
    scrollMargin,
    scrollToFn: scrollGroupedTaskVirtualizerToOffset,
    // group 内虚拟列表会和顶层列表共用左侧滚动容器。
    // 当 group 行在中段滚动时重新挂载，react-virtual 默认 initialOffset=0
    // 会在 _willUpdate 里 scrollTo(0)。这里从 DOM 现场反查真实 scrollTop，
    // 避免首个 layout effect 里 scrollElement state 尚未写回时提前缓存 0。
    initialOffset: resolveInitialScrollOffset,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const measureElement = rowVirtualizer.measureElement;

  // 激活任务自动揭示：activeTaskId 变化（含挂载时已存在）后，把该行滚动到共享容器可视区。
  // 每个任务只揭示一次；行已可见时跳过，避免点击可视行引起列表跳动。
  const lastRevealedTaskKeyRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!activeTaskId) {
      return;
    }
    const activeWorkspaceKey = buildTaskWorkspaceKey(activeWorkspacePath, activeWorkspaceIdentity);
    const index = tasks.findIndex(
      (task) =>
        task.taskId === activeTaskId &&
        buildTaskWorkspaceKey(task.workspacePath, task.workspaceIdentity) === activeWorkspaceKey,
    );
    if (index === -1) {
      return;
    }
    const nextTaskKey = taskKey(tasks[index]!);
    if (nextTaskKey === lastRevealedTaskKeyRef.current) {
      return;
    }
    if (shouldVirtualize && !scrollElement) {
      // 虚拟化滚动容器尚未就绪；scrollElement 写回后本 effect 会重放，先不记已揭示。
      return;
    }
    const listElement = listRef.current;
    const rowElement = listElement?.querySelector<HTMLElement>(
      `[data-grouped-task-key="${encodeURIComponent(nextTaskKey)}"]`,
    );
    const revealContainer =
      scrollElement ?? (listElement ? findNearestScrollableAncestor(listElement) : null);
    if (
      rowElement &&
      revealContainer &&
      isRowVisibleInScrollContainer(rowElement, revealContainer)
    ) {
      lastRevealedTaskKeyRef.current = nextTaskKey;
      return;
    }
    lastRevealedTaskKeyRef.current = nextTaskKey;
    if (shouldVirtualize && scrollElement) {
      rowVirtualizer.scrollToIndex(index, { align: "center" });
      return;
    }
    rowElement?.scrollIntoView({ block: "center" });
  }, [
    activeTaskId,
    activeWorkspaceIdentity,
    activeWorkspacePath,
    rowVirtualizer,
    scrollElement,
    shouldVirtualize,
    tasks,
  ]);

  const renderTask = useCallback(
    (task: ZCodeTaskMeta) => (
      <GroupedTaskItem
        key={taskKey(task)}
        task={task}
        groupId={groupId}
        groups={groups}
        remoteSessionId={getTaskRemoteSessionId(task)}
        workspaceLabel={getTaskWorkspaceLabel(task)}
        activeWorkspacePath={activeWorkspacePath}
        activeWorkspaceIdentity={activeWorkspaceIdentity}
        activeTaskId={activeTaskId}
        onSelectTask={onSelectTask}
        onCloseTask={onCloseTask}
        onOpenFileTree={onOpenFileTree}
        onMoveTaskToGroup={onMoveTaskToGroup}
        onMoveTaskToTop={onMoveTaskToTop}
        onStartRenameTask={onStartRenameTask}
        onArchiveTask={onArchiveTask}
        onMarkTaskAsUnread={onMarkTaskAsUnread}
        dragId={taskKey(task)}
        dragging={activeDragTaskKey === taskKey(task)}
        tooltipsDisabled={tooltipsDisabled}
      />
    ),
    [
      activeTaskId,
      activeWorkspaceIdentity,
      activeWorkspacePath,
      getTaskRemoteSessionId,
      getTaskWorkspaceLabel,
      groupId,
      groups,
      onArchiveTask,
      onCloseTask,
      onMarkTaskAsUnread,
      onMoveTaskToGroup,
      onMoveTaskToTop,
      onOpenFileTree,
      onSelectTask,
      onStartRenameTask,
      activeDragTaskKey,
      tooltipsDisabled,
    ],
  );

  const renderedVirtualTasks = useMemo(
    () =>
      virtualRows.map((virtualRow) => {
        const task = tasks[virtualRow.index];
        if (!task) {
          return null;
        }
        return (
          <div
            key={virtualRow.key}
            // 行高不再恒定：挂着工作流运行行的会话是 48px 而不是 28px。估算值只作初值，
            // 真实高度由 measureElement 量回，否则相邻行会叠在一起。
            ref={measureElement}
            data-index={virtualRow.index}
            className="absolute left-0 top-0 w-full"
            style={{
              transform: `translateY(${virtualRow.start - scrollMargin}px)`,
            }}
          >
            {renderTask(task)}
          </div>
        );
      }),
    [measureElement, renderTask, scrollMargin, tasks, virtualRows],
  );

  if (!shouldVirtualize) {
    // contents 包装不参与布局，只为激活任务揭示提供行查询锚点（listRef）。
    return (
      <div ref={listRef} className="contents">
        {tasks.map((task) => renderTask(task))}
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="relative w-full"
      style={{
        height: `${rowVirtualizer.getTotalSize()}px`,
        overflowAnchor: "none",
      }}
    >
      {/* 大 group 以前一次渲染所有 task 行，2000 条会制造数万 DOM 节点并拖高
          JS/布局 CPU。这里只挂载滚动窗口内的行，保持点击和菜单操作可用。 */}
      {/* group 内虚拟行会在滚动时不断挂载/卸载，浏览器滚动锚点可能误把
          这些绝对定位行当成稳定锚点，测量回写时就可能把 scrollTop 拉回顶部。
          禁用虚拟列表子树的锚点选择，避免和 react-virtual 的定位计算打架。 */}
      {renderedVirtualTasks}
    </div>
  );
}

export {
  GROUPED_TASK_ROW_ESTIMATE_PX,
  GROUPED_TASK_VIRTUALIZATION_THRESHOLD,
  shouldVirtualizeGroupedTasks,
};
