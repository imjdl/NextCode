import { isFreshRuntimeHeartbeat } from "@zcode/shared";
import type { ZCodeTaskMeta } from "@zcode/shared";
import type { TaskListRowActivity } from "@/v4/taskListRowActivity.js";

export function deriveTaskLeadingIndicator(
  task: ZCodeTaskMeta,
  activity: TaskListRowActivity | null,
): "error" | "unread" | "loading" | "none" {
  if (activity?.phase === "error") {
    return "error";
  }

  // 搜索结果或 sessions-index 尚未水合时可能没有 activity sidecar。
  // 这种情况仅回退持久化 error；一旦有 sessions-index，phase 就是实时权威。
  if (!activity && task.status === "error") {
    return "error";
  }

  // unread 是 tasks-index membership 字段，蓝点必须直接读取当前
  // query-cache row；不再回退旧 Zustand map，避免两个未读权威互相打架。
  if (typeof task.unreadAt === "number") {
    return "unread";
  }

  if (activity?.phase === "prewarming" || activity?.phase === "running") {
    return "loading";
  }

  // 跨端心跳（specs/web-mobile-cross-process-sync.md）：本进程 sessions-index 对
  // "另一进程正在跑的会话"只有缺省完成态种子；驱动进程写入的新鲜心跳
  // （RUNTIME_HEARTBEAT_FRESH_MS 内）是"仍在运行"的落盘证据，同样转圈。
  // 陈旧心跳依旧不采信——历史列表不会把上次未完成的 task 一直显示成转圈。
  if (isFreshRuntimeHeartbeat(task.runtimeHeartbeatAt)) {
    return "loading";
  }

  return "none";
}

export function formatTaskRelativeTime(
  timestamp: number,
  intl: {
    formatMessage: (desc: { id: string }, values?: Record<string, string>) => string;
  },
): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return intl.formatMessage({ id: "taskList.justNow" });
  if (minutes < 60) {
    return intl.formatMessage({ id: "taskList.minutesAgo" }, { minutes: String(minutes) });
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return intl.formatMessage({ id: "taskList.hoursAgo" }, { hours: String(hours) });
  }

  const days = Math.floor(hours / 24);
  return intl.formatMessage({ id: "taskList.daysAgo" }, { days: String(days) });
}
