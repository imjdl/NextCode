// 跨端运行心跳的 UI 判定链（specs/web-mobile-cross-process-sync.md 第三阶段）：
// 本进程 live phase 优先；新鲜心跳让"另一进程驱动中"的会话转圈；陈旧心跳不采信。
import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveTaskLeadingIndicator } from "../src/lib/taskListItemPresentation.js";
import {
  attachTaskListRowActivity,
  isTaskListRowActive,
  type TaskListMetaWithActivity,
} from "../src/v4/taskListRowActivity.js";
import { RUNTIME_HEARTBEAT_FRESH_MS } from "@zcode/shared";
import type { ZCodeTaskMeta } from "@zcode/shared";

function baseTask(overrides: Partial<ZCodeTaskMeta> = {}): ZCodeTaskMeta {
  return {
    taskId: "task-heartbeat",
    traceId: "trace-1",
    title: "心跳测试任务",
    workspacePath: "E:\\ws",
    createdAt: 1_000,
    updatedAt: 2_000,
    mode: "auto",
    ...overrides,
  };
}

function withActivity(
  task: ZCodeTaskMeta,
  phase: "running" | "prewarming" | "completedSuccess" | "error",
): ZCodeTaskMeta {
  return attachTaskListRowActivity(task, {
    phase,
    lastActivityAt: task.updatedAt,
    hasBackgroundWork: false,
  });
}

test("新鲜心跳（另一进程驱动中）→ loading 转圈", () => {
  const task = withActivity(
    baseTask({ status: "running", runtimeHeartbeatAt: Date.now() - 1_000 }),
    "completedSuccess",
  );
  assert.equal(
    deriveTaskLeadingIndicator(task, (task as TaskListMetaWithActivity).__zcodeSessionActivity),
    "loading",
  );
  assert.equal(isTaskListRowActive(task), true);
});

test("陈旧心跳 → 不转圈（历史任务不因残留 running 假转）", () => {
  const task = withActivity(
    baseTask({
      status: "running",
      runtimeHeartbeatAt: Date.now() - RUNTIME_HEARTBEAT_FRESH_MS - 5_000,
    }),
    "completedSuccess",
  );
  assert.equal(
    deriveTaskLeadingIndicator(task, (task as TaskListMetaWithActivity).__zcodeSessionActivity),
    "none",
  );
  assert.equal(isTaskListRowActive(task), false);
});

test("无心跳 → 不转圈（旧语义不变）", () => {
  const task = withActivity(baseTask({ status: "running" }), "completedSuccess");
  assert.equal(
    deriveTaskLeadingIndicator(task, (task as TaskListMetaWithActivity).__zcodeSessionActivity),
    "none",
  );
});

test("本进程 live phase 依然优先：running/prewarming 直接转圈，无需心跳", () => {
  for (const phase of ["running", "prewarming"] as const) {
    const task = withActivity(baseTask({}), phase);
    assert.equal(
      deriveTaskLeadingIndicator(task, (task as TaskListMetaWithActivity).__zcodeSessionActivity),
      "loading",
    );
  }
});

test("error phase 优先于心跳（本地错误事实最权威）", () => {
  const task = withActivity(baseTask({ status: "error", runtimeHeartbeatAt: Date.now() }), "error");
  assert.equal(
    deriveTaskLeadingIndicator(task, (task as TaskListMetaWithActivity).__zcodeSessionActivity),
    "error",
  );
});

test("无 activity sidecar 时新鲜心跳仍可兜底（sessions-index 尚未水合）", () => {
  const task = baseTask({ runtimeHeartbeatAt: Date.now() });
  assert.equal(deriveTaskLeadingIndicator(task, null), "loading");
});
