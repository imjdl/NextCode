import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createRequire } from "node:module";
import { createSharedSqliteChangeWatcher } from "../src/zcode-agent/sharedSqliteChangeWatcher.js";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

/** 建一个最小 tasks 库并返回读写连接（模拟另一进程的写入方）。 */
function createWriterDatabase(path: string) {
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY, title TEXT)");
  db.exec("INSERT INTO tasks (title) VALUES ('seed')");
  return db;
}

function waitFor(predicate: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const startAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - startAt > timeoutMs) {
        reject(new Error(`等待超时: ${label}`));
        return;
      }
      setTimeout(tick, 20);
    };
    tick();
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("另一连接提交后触发回调（模拟桌面 Host 写入）", { timeout: 15_000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "task-index-watcher-"));
  const dbPath = join(dir, "tasks-index.sqlite");
  const writer = createWriterDatabase(dbPath);
  let changes = 0;
  const watcher = createSharedSqliteChangeWatcher({
    databasePath: dbPath,
    onExternalChange: () => {
      changes += 1;
    },
    intervalMs: 40,
    debounceMs: 30,
  });
  t.after(() => {
    watcher.dispose();
    try {
      writer.close();
    } catch {
      // 已关闭
    }
    rmSync(dir, { recursive: true, force: true });
  });

  // 建库写入发生在 watcher 基线之前：先等基线稳定，断言无回调
  await sleep(150);
  assert.equal(changes, 0);

  writer.exec("INSERT INTO tasks (title) VALUES ('from-desktop')");
  await waitFor(() => changes >= 1, 5_000, "外部写入触发回调");
});

test("无写入不触发；dispose 后停止", { timeout: 15_000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "task-index-watcher-"));
  const dbPath = join(dir, "tasks-index.sqlite");
  const writer = createWriterDatabase(dbPath);
  let changes = 0;
  const watcher = createSharedSqliteChangeWatcher({
    databasePath: dbPath,
    onExternalChange: () => {
      changes += 1;
    },
    intervalMs: 40,
    debounceMs: 30,
  });
  t.after(() => {
    watcher.dispose();
    try {
      writer.close();
    } catch {
      // 已关闭
    }
    rmSync(dir, { recursive: true, force: true });
  });

  await sleep(200);
  assert.equal(changes, 0);

  watcher.dispose();
  writer.exec("INSERT INTO tasks (title) VALUES ('after-dispose')");
  await sleep(200);
  assert.equal(changes, 0);
});

test("数据库文件不存在时不抛错，创建后可正常检测", { timeout: 15_000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "task-index-watcher-"));
  const dbPath = join(dir, "tasks-index.sqlite");
  let changes = 0;
  const watcher = createSharedSqliteChangeWatcher({
    databasePath: dbPath,
    onExternalChange: () => {
      changes += 1;
    },
    intervalMs: 40,
    debounceMs: 30,
  });
  let writer: InstanceType<typeof DatabaseSync> | null = null;
  t.after(() => {
    watcher.dispose();
    try {
      writer?.close();
    } catch {
      // 已关闭
    }
    rmSync(dir, { recursive: true, force: true });
  });

  // watcher 启动时文件不存在：先空转若干轮（不抛错），随后另一“进程”建库。
  // 建库发生在基线之前不算外部变化；基线稳定后的写入才应触发回调。
  await sleep(150);
  writer = createWriterDatabase(dbPath);
  await sleep(150);
  assert.equal(changes, 0);

  writer.exec("INSERT INTO tasks (title) VALUES ('after-create')");
  await waitFor(() => changes >= 1, 5_000, "建库后的写入被检测到");
});
