/**
 * 跨进程 SQLite 变更观察器（Web 服务进程专用）。
 *
 * 背景（specs/web-mobile-cross-process-sync.md）：Web/手机端跑在独立 services 进程里，
 * 与桌面窗口 Host 共享同一批 SQLite 文件（tasks-index.sqlite / cli/db/db.sqlite），但变更
 * 通知都是进程内的，桌面端的写入永远到不了 Web 客户端——数据在库里，缺的只是通知。
 *
 * 做法：独立只读连接轮询 `PRAGMA data_version`（任意其它连接提交都会令其自增，查询本身
 * 无数据页 IO）；变化后去抖回调。不区分写入方：本进程自己的写入也会触发一次回调，
 * 调用侧自行消化冗余（任务索引侧多广播一次、会话侧 CLI 节流跳过），换来不侵入写路径。
 */
import { createRequire } from "node:module";
import { createServiceLogger } from "#src/logger/serviceLogger.js";

const logger = createServiceLogger("task-index-change-watcher");

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

export interface SharedSqliteChangeWatcher {
  dispose(): void;
}

export interface CreateSharedSqliteChangeWatcherOptions {
  /** tasks-index.sqlite 的绝对路径。 */
  databasePath: string;
  /** 检测到其它进程写入（去抖后）触发一次。 */
  onExternalChange: () => void;
  /** 轮询间隔，默认 1000ms。 */
  intervalMs?: number;
  /** 变化后的去抖窗口，默认 300ms。 */
  debounceMs?: number;
}

export function createSharedSqliteChangeWatcher(
  options: CreateSharedSqliteChangeWatcherOptions,
): SharedSqliteChangeWatcher {
  const intervalMs = options.intervalMs ?? 1_000;
  const debounceMs = options.debounceMs ?? 300;

  let disposed = false;
  let db: import("node:sqlite").DatabaseSync | null = null;
  let lastVersion: number | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const readDataVersion = (): number | null => {
    if (!db) {
      try {
        // 只读连接：WAL 模式下只读客户端可以读其它连接的已提交数据。
        db = new DatabaseSync(`file:${options.databasePath.replaceAll("\\", "/")}?mode=ro`, {
          readOnly: true,
        });
      } catch {
        // 文件尚未创建或暂时不可读（与 TaskIndexRepo 初始化竞态）：下一轮再试。
        return null;
      }
    }
    try {
      const row = db.prepare("PRAGMA data_version").get() as { data_version?: number } | undefined;
      const version = typeof row?.data_version === "number" ? row.data_version : null;
      if (version === null) return null;
      if (lastVersion === null) {
        lastVersion = version;
        return null;
      }
      return version;
    } catch {
      // 读失败（如文件被替换）：丢弃连接，下一轮重建。
      try {
        db.close();
      } catch {
        // 关闭失败无需处理
      }
      db = null;
      return null;
    }
  };

  const fireOnce = () => {
    debounceTimer = null;
    if (disposed) return;
    try {
      options.onExternalChange();
    } catch (error) {
      logger.warn(undefined, "task-index 变更回调失败", error);
    }
  };

  const poll = () => {
    if (disposed) return;
    const version = readDataVersion();
    if (version === null) return;
    if (version !== lastVersion) {
      lastVersion = version;
      if (debounceTimer === null) {
        debounceTimer = setTimeout(fireOnce, debounceMs);
      }
    }
  };

  pollTimer = setInterval(poll, intervalMs);
  // 立即跑一次建立基线，避免把"启动前的历史写入"当成外部变化。
  poll();

  return {
    dispose() {
      disposed = true;
      if (pollTimer !== null) clearInterval(pollTimer);
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      try {
        db?.close();
      } catch {
        // 关闭失败无需处理
      }
      db = null;
    },
  };
}
