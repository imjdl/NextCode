// 快照整替的行引用保全（specs/web-mobile-cross-process-sync.md 抖动修复）：
// 跨端镜像每 1–2s 送达整快照，内容未变的行必须沿用旧对象引用，
// 否则引用记忆化全部失效、对话页整列表重渲染（表现即"抖动"）。
import assert from "node:assert/strict";
import { test } from "node:test";
import { preserveSnapshotRowIdentities } from "../src/v4/conversationProjectionStore.js";
import type { ConversationSnapshot, ConversationRow } from "@zcode/shared/zcode-protocol-v4";

function row(rowId: number, text: string): ConversationRow {
  return {
    rowId,
    kind: "assistantText",
    turnId: `turn-${rowId}`,
    messageId: "m1",
    partId: `p${rowId}`,
    text,
    state: "streaming",
  } as unknown as ConversationRow;
}

function snapshot(window: ConversationRow[], seq = 1): ConversationSnapshot {
  return {
    topicSeq: seq,
    seq,
    logEpoch: "epoch",
    control: { phase: "running", sessionEnded: false, canStop: true } as never,
    rows: { window, totalCount: window.length, firstRowId: window[0]?.rowId ?? null },
  } as unknown as ConversationSnapshot;
}

test("内容全未变：行对象与 rows 容器全部沿用旧引用", () => {
  const prev = snapshot([row(1, "a"), row(2, "b")]);
  const next = snapshot([row(1, "a"), row(2, "b")]);
  const merged = preserveSnapshotRowIdentities(prev, next);
  assert.equal(merged.rows, prev.rows, "全未变时 rows 容器应沿用旧引用");
  assert.equal(merged.rows.window[0], prev.rows.window[0]);
  assert.equal(merged.rows.window[1], prev.rows.window[1]);
});

test("单行内容变化：只有该行换新引用，其余行保引用", () => {
  const prev = snapshot([row(1, "a"), row(2, "b"), row(3, "c")]);
  const next = snapshot([row(1, "a"), row(2, "b2!"), row(3, "c")]);
  const merged = preserveSnapshotRowIdentities(prev, next);
  assert.equal(merged.rows.window[0], prev.rows.window[0], "未变行沿用旧引用");
  assert.equal(merged.rows.window[2], prev.rows.window[2], "未变行沿用旧引用");
  assert.equal(merged.rows.window[1], next.rows.window[1], "变化行使用新对象");
  assert.equal(merged.rows.window[1]?.text, "b2!");
});

test("新增/删除行：正常换新容器，未变行仍保引用", () => {
  const prev = snapshot([row(1, "a"), row(2, "b")]);
  const next = snapshot([row(1, "a"), row(2, "b"), row(3, "new")]);
  const merged = preserveSnapshotRowIdentities(prev, next);
  assert.notEqual(merged.rows, prev.rows);
  assert.equal(merged.rows.window.length, 3);
  assert.equal(merged.rows.window[0], prev.rows.window[0]);
  assert.equal(merged.rows.window[2], next.rows.window[2]);
});

test("无旧快照（首帧）：原样返回", () => {
  const next = snapshot([row(1, "a")]);
  assert.equal(preserveSnapshotRowIdentities(null, next), next);
});

test("深比较：嵌套字段（metadata）不同视为变化", () => {
  const prevRow = { ...row(1, "a"), metadata: { x: 1 } } as ConversationRow;
  const nextRow = { ...row(1, "a"), metadata: { x: 2 } } as ConversationRow;
  const prev = snapshot([prevRow]);
  const next = snapshot([nextRow]);
  const merged = preserveSnapshotRowIdentities(prev, next);
  assert.equal(merged.rows.window[0], nextRow, "嵌套变化应换新引用");
});
