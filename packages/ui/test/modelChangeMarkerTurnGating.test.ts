// model-change 标记的展示门控（specs/model-change-marker.md）：
// 只在所在轮次 running 时渲染；终态轮（实时完成/中断/失败、历史回放、重启水合）
// 一律不展示——含轮次边界/恢复路径写入的 from 为空的源缺失记录。
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  AssistantTextRow,
  ConversationRow,
  TimelineMarkerRow,
  TurnHeaderRow,
  UserInputRow,
} from "@zcode/shared/zcode-protocol-v4";

import { buildConversationTurnRenderUnits } from "@/v4/conversationTurnRenderUnits.js";

let nextRowId = 1;

function userInputRow(turnId: string): UserInputRow {
  return {
    kind: "userInput",
    rowId: nextRowId++,
    turnId,
    createdAt: 1_000,
    createdAtSeq: nextRowId,
    text: "问题",
    origin: "realUser",
  } as unknown as UserInputRow;
}

function modelChangeMarkerRow(turnId: string, sourceLess: boolean): TimelineMarkerRow {
  return {
    kind: "timelineMarker",
    rowId: nextRowId++,
    turnId,
    createdAt: 1_100,
    createdAtSeq: nextRowId,
    lane: "lightBoundary",
    marker: sourceLess
      ? {
          type: "modelChange",
          toProvider: "p-new",
          toModel: "model-b",
          toThought: "medium",
        }
      : {
          type: "modelChange",
          fromProvider: "p-old",
          fromModel: "model-a",
          toProvider: "p-new",
          toModel: "model-b",
          toThought: "medium",
        },
  } as unknown as TimelineMarkerRow;
}

function turnHeaderRow(turnId: string, state: TurnHeaderRow["state"]): TurnHeaderRow {
  return {
    kind: "turnHeader",
    rowId: nextRowId++,
    turnId,
    createdAt: 900,
    createdAtSeq: nextRowId,
    origin: "userInput",
    state,
    startedAt: 900,
  } as unknown as TurnHeaderRow;
}

function assistantTextRow(turnId: string, state: AssistantTextRow["state"]): AssistantTextRow {
  return {
    kind: "assistantText",
    rowId: nextRowId++,
    turnId,
    createdAt: 1_200,
    createdAtSeq: nextRowId,
    text: "回答",
    state,
  } as unknown as AssistantTextRow;
}

function collectModelChangeMarkerRows(
  units: readonly {
    leadingBoundaryRows?: TimelineMarkerRow[];
    renderRows?: ConversationRow[];
  }[],
): ConversationRow[] {
  const found: ConversationRow[] = [];
  const seenRowIds = new Set<number>();
  for (const unit of units) {
    // running 轮的 modelChange 走 leadingBoundaryRows（轮顶轻边界）；
    // 终态轮若泄漏会出现在任一渲染行集合里，全部扫描断言干净（按 rowId 去重）。
    for (const row of [...(unit.leadingBoundaryRows ?? []), ...(unit.renderRows ?? [])]) {
      if (
        row.kind === "timelineMarker" &&
        row.marker.type === "modelChange" &&
        !seenRowIds.has(row.rowId)
      ) {
        seenRowIds.add(row.rowId);
        found.push(row);
      }
    }
  }
  return found;
}

describe("model-change 标记只在所在轮次 running 时渲染", () => {
  it("running 轮的切换标记保留（含源缺失形态）", () => {
    const rows: ConversationRow[] = [
      turnHeaderRow("t1", "running"),
      modelChangeMarkerRow("t1", false),
      userInputRow("t1"),
      assistantTextRow("t1", "streaming"),
    ];
    const units = buildConversationTurnRenderUnits(rows, { sessionPhase: "running" });
    const markers = collectModelChangeMarkerRows(units);
    assert.equal(markers.length, 1);
  });

  it("轮次完成后标记退出时间线（实时完成场景）", () => {
    const rows: ConversationRow[] = [
      turnHeaderRow("t1", "completedSuccess"),
      modelChangeMarkerRow("t1", false),
      userInputRow("t1"),
      assistantTextRow("t1", "complete"),
    ];
    const units = buildConversationTurnRenderUnits(rows, { sessionPhase: "completedSuccess" });
    assert.equal(collectModelChangeMarkerRows(units).length, 0);
  });

  it("源缺失（from 为空）的历史记录不再展示——本轮修复的主残留形态", () => {
    const rows: ConversationRow[] = [
      turnHeaderRow("t1", "completedSuccess"),
      modelChangeMarkerRow("t1", true),
      userInputRow("t1"),
      assistantTextRow("t1", "complete"),
    ];
    const units = buildConversationTurnRenderUnits(rows, { sessionPhase: "completedSuccess" });
    assert.equal(collectModelChangeMarkerRows(units).length, 0);
  });

  it("中断/失败终态同样隐藏", () => {
    for (const state of ["completedInterrupted", "failed"] as const) {
      const rows: ConversationRow[] = [
        turnHeaderRow("t1", state),
        modelChangeMarkerRow("t1", false),
        userInputRow("t1"),
        assistantTextRow("t1", "interrupted"),
      ];
      const units = buildConversationTurnRenderUnits(rows, { sessionPhase: "error" });
      assert.equal(collectModelChangeMarkerRows(units).length, 0, state);
    }
  });

  it("多轮会话只保留仍在运行轮次的标记", () => {
    const rows: ConversationRow[] = [
      turnHeaderRow("t1", "completedSuccess"),
      modelChangeMarkerRow("t1", false),
      userInputRow("t1"),
      assistantTextRow("t1", "complete"),
      turnHeaderRow("t2", "running"),
      modelChangeMarkerRow("t2", false),
      userInputRow("t2"),
      assistantTextRow("t2", "streaming"),
    ];
    const units = buildConversationTurnRenderUnits(rows, { sessionPhase: "running" });
    const markers = collectModelChangeMarkerRows(units);
    assert.equal(markers.length, 1);
    assert.equal(markers[0]?.turnId, "t2");
  });

  it("缺 turnHeader 的旧投影：marker 本身不是 completion-blocking 行 → 判非 running，隐藏", () => {
    const rows: ConversationRow[] = [
      modelChangeMarkerRow("t1", false),
      userInputRow("t1"),
      assistantTextRow("t1", "complete"),
    ];
    const units = buildConversationTurnRenderUnits(rows, { sessionPhase: "completedSuccess" });
    assert.equal(collectModelChangeMarkerRows(units).length, 0);
  });
});
