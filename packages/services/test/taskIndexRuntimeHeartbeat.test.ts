// 运行心跳在 tasks-index 的写入往返（specs/web-mobile-cross-process-sync.md 第三阶段）：
// applyAgentPatch 设置/保留/清除 runtimeHeartbeatAt，meta_json 经 zod schema 往返不丢。
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskIndexRepo } from "../src/session/taskIndexRepo.js";
import type { ZCodeTaskMeta } from "@zcode/shared";

function buildRepo(): { repo: TaskIndexRepo; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "zcode-heartbeat-test-"));
  const repo = new TaskIndexRepo(join(dir, "tasks-index.sqlite"));
  return { repo, cleanup: () => repo.close() || rmSync(dir, { recursive: true, force: true }) };
}

function baseMeta(now: number): ZCodeTaskMeta {
  return {
    taskId: "task-heartbeat-repo",
    traceId: "trace-repo",
    title: "心跳往返测试",
    workspacePath: "E:\\ws-heartbeat",
    createdAt: now - 10_000,
    updatedAt: now - 10_000,
    mode: "auto",
  };
}

async function readBack(repo: TaskIndexRepo): Promise<ZCodeTaskMeta | undefined> {
  const rows = await repo.listTaskMetas({ workspacePath: "E:\\ws-heartbeat" });
  return rows.find((row) => row.taskId === "task-heartbeat-repo");
}

test("心跳写入 → meta_json 往返可读回", async () => {
  const { repo, cleanup } = buildRepo();
  try {
    const now = Date.now();
    await repo.seedTaskMetaIfMissing(baseMeta(now));
    const patched = await repo.applyAgentPatch({
      workspacePath: "E:\\ws-heartbeat",
      taskId: "task-heartbeat-repo",
      patch: { status: "running", runtimeHeartbeatAt: now, updatedAt: now },
    });
    assert.equal(patched?.status, "running");
    assert.equal(patched?.runtimeHeartbeatAt, now);
    const reread = await readBack(repo);
    assert.equal(reread?.runtimeHeartbeatAt, now, "心跳应经 schema 校验后从 meta_json 读回");
  } finally {
    cleanup();
  }
});

test("不带心跳的 patch 保留现值；终态 patch(null) 清除", async () => {
  const { repo, cleanup } = buildRepo();
  try {
    const now = Date.now();
    await repo.seedTaskMetaIfMissing(baseMeta(now));
    await repo.applyAgentPatch({
      workspacePath: "E:\\ws-heartbeat",
      taskId: "task-heartbeat-repo",
      patch: { status: "running", runtimeHeartbeatAt: now, updatedAt: now },
    });
    // 不带 runtimeHeartbeatAt 的 patch（如标题更新）不得清心跳。
    await repo.applyAgentPatch({
      workspacePath: "E:\\ws-heartbeat",
      taskId: "task-heartbeat-repo",
      patch: { title: "新标题", updatedAt: now + 1 },
    });
    assert.equal((await readBack(repo))?.runtimeHeartbeatAt, now);
    // 终态清除：null → undefined。
    await repo.applyAgentPatch({
      workspacePath: "E:\\ws-heartbeat",
      taskId: "task-heartbeat-repo",
      patch: {
        status: "completed",
        lastError: undefined,
        runtimeHeartbeatAt: null,
        updatedAt: now + 2,
      },
    });
    const cleared = await readBack(repo);
    assert.equal(cleared?.status, "completed");
    assert.equal(cleared?.runtimeHeartbeatAt, undefined, "终态应清除心跳");
  } finally {
    cleanup();
  }
});
