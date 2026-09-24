import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  AssistantTextRow,
  ConversationRow,
  ReasoningRow,
} from "@zcode/shared/zcode-protocol-v4";

import {
  collectActiveTurnTokenStats,
  computeTokenRate,
  estimateTokens,
  TOKEN_RATE_MIN_ELAPSED_MS,
} from "@/v4/streamingTokenRate.js";

function textRow(overrides: Partial<AssistantTextRow>): AssistantTextRow {
  return {
    kind: "assistantText",
    rowId: 1,
    turnId: "turn-1",
    createdAt: 1_000,
    createdAtSeq: 1,
    text: "",
    state: "streaming",
    ...overrides,
  } as AssistantTextRow;
}

function reasoningRow(overrides: Partial<ReasoningRow>): ReasoningRow {
  return {
    kind: "reasoning",
    rowId: 2,
    turnId: "turn-1",
    createdAt: 1_000,
    createdAtSeq: 2,
    text: "",
    state: "streaming",
    ...overrides,
  } as ReasoningRow;
}

function toolRow(overrides: Record<string, unknown>): ConversationRow {
  return {
    kind: "toolCall",
    rowId: 99,
    turnId: "turn-1",
    createdAt: 1_500,
    createdAtSeq: 3,
    ...overrides,
  } as unknown as ConversationRow;
}

describe("estimateTokens", () => {
  it("空文本计 0", () => {
    assert.equal(estimateTokens(""), 0);
  });

  it("非空文本至少计 1 token", () => {
    assert.equal(estimateTokens("a"), 1);
  });

  it("英文按 ~4 字符/token 估算", () => {
    assert.equal(estimateTokens("abcdefgh"), 2);
  });

  it("中文按 ~0.6 token/字符 估算", () => {
    // 10 个 CJK 字符 → 6 token。
    assert.equal(estimateTokens("一二三四五六七八九十"), 6);
  });

  it("中英混合分别加权", () => {
    // 5 CJK(3.0) + 8 other(2.0) → 5。
    assert.equal(estimateTokens("一二三四五六七八九十".slice(0, 5) + "abcdefgh"), 5);
  });
});

describe("collectActiveTurnTokenStats", () => {
  it("phase 非 running 一律隐藏（轮次结束/draft/prewarming）", () => {
    const rows = [textRow({ state: "complete", text: "done" })];
    assert.equal(collectActiveTurnTokenStats(rows, "completedSuccess"), null);
    assert.equal(collectActiveTurnTokenStats(rows, "draft"), null);
    assert.equal(collectActiveTurnTokenStats(rows, "prewarming"), null);
    assert.equal(collectActiveTurnTokenStats(rows, null), null);
    assert.equal(collectActiveTurnTokenStats([], "running"), null);
  });

  it("工具执行间隙（最后行为 toolCall、无流式文本）仍保持统计——回归用例", () => {
    const rows = [
      reasoningRow({ rowId: 1, state: "complete", createdAt: 900, text: "思考过程" }),
      textRow({ rowId: 2, state: "complete", createdAt: 1_100, text: "先看下文件" }),
      toolRow({ rowId: 3, turnId: "turn-1" }),
    ];
    const stats = collectActiveTurnTokenStats(rows, "running");
    assert.ok(stats);
    assert.equal(stats.startedAt, 900);
    assert.equal(stats.tokens, estimateTokens("思考过程") + estimateTokens("先看下文件"));
  });

  it("同轮跨 model response 的正文/思考 token 累加", () => {
    const rows = [
      textRow({ rowId: 1, assistantResponseId: "resp-0", state: "complete", text: "first" }),
      toolRow({ rowId: 2, turnId: "turn-1" }),
      textRow({ rowId: 3, assistantResponseId: "resp-1", state: "streaming", text: "second" }),
    ];
    const stats = collectActiveTurnTokenStats(rows, "running");
    assert.ok(stats);
    assert.equal(stats.tokens, estimateTokens("first") + estimateTokens("second"));
  });

  it("上一轮的行不计入当前轮", () => {
    const rows = [
      textRow({ rowId: 1, turnId: "turn-0", state: "complete", text: "old-turn-output" }),
      textRow({ rowId: 2, turnId: "turn-1", state: "streaming", text: "new" }),
    ];
    const stats = collectActiveTurnTokenStats(rows, "running");
    assert.ok(stats);
    assert.equal(stats.tokens, estimateTokens("new"));
  });

  it("当前轮尚无正文/思考产出（首轮直接进工具）返回 null", () => {
    const rows = [toolRow({ rowId: 1, turnId: "turn-1" })];
    assert.equal(collectActiveTurnTokenStats(rows, "running"), null);
  });

  it("起点取当前轮最早正文/思考行的 createdAt", () => {
    const rows = [
      reasoningRow({ rowId: 1, state: "complete", createdAt: 800, text: "思考" }),
      textRow({ rowId: 2, state: "streaming", createdAt: 1_200, text: "answer" }),
    ];
    const stats = collectActiveTurnTokenStats(rows, "running");
    assert.ok(stats);
    assert.equal(stats.startedAt, 800);
  });
});

describe("computeTokenRate", () => {
  it("时长不足门控返回 null", () => {
    assert.equal(computeTokenRate(100, TOKEN_RATE_MIN_ELAPSED_MS - 1), null);
    assert.equal(computeTokenRate(0, 5_000), null);
  });

  it("tokens ÷ 秒", () => {
    assert.equal(computeTokenRate(50, 2_000), 25);
  });
});
