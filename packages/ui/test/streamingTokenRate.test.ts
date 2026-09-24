import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AssistantTextRow, ReasoningRow } from "@zcode/shared/zcode-protocol-v4";

import {
  collectStreamingResponseStats,
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

describe("collectStreamingResponseStats", () => {
  it("无 streaming 行返回 null（轮次结束 → 隐藏）", () => {
    const rows = [textRow({ state: "complete", text: "done" })];
    assert.equal(collectStreamingResponseStats(rows), null);
    assert.equal(collectStreamingResponseStats([]), null);
  });

  it("统计当前 response 的正文与 reasoning，起点取最早 createdAt", () => {
    const rows = [
      textRow({ rowId: 9, text: "user ask", state: "complete", kind: "assistantText" }),
      reasoningRow({
        rowId: 10,
        assistantResponseId: "resp-1",
        state: "complete",
        createdAt: 900,
        text: "thinking",
      }),
      textRow({
        rowId: 11,
        assistantResponseId: "resp-1",
        state: "streaming",
        createdAt: 1_200,
        text: "answer",
      }),
    ];
    const stats = collectStreamingResponseStats(rows);
    assert.ok(stats);
    assert.equal(stats.startedAt, 900);
    assert.equal(stats.tokens, estimateTokens("thinking") + estimateTokens("answer"));
  });

  it("上一个已完成 response 的 token 不累入当前 response", () => {
    const rows = [
      textRow({ rowId: 1, assistantResponseId: "resp-0", state: "complete", text: "old-old-old" }),
      textRow({ rowId: 2, assistantResponseId: "resp-1", state: "streaming", text: "new" }),
    ];
    const stats = collectStreamingResponseStats(rows);
    assert.ok(stats);
    assert.equal(stats.tokens, estimateTokens("new"));
    assert.equal(stats.startedAt, 1_000);
  });

  it("旧行缺 assistantResponseId 时退化为所有 streaming 行", () => {
    const rows = [
      reasoningRow({ rowId: 3, state: "streaming", createdAt: 800, text: "思考中" }),
      textRow({ rowId: 4, state: "streaming", createdAt: 1_100, text: "partial" }),
    ];
    const stats = collectStreamingResponseStats(rows);
    assert.ok(stats);
    assert.equal(stats.startedAt, 800);
    assert.equal(stats.tokens, estimateTokens("思考中") + estimateTokens("partial"));
  });

  it("工具行不参与计数", () => {
    const toolRow = {
      kind: "toolCall",
      rowId: 5,
      turnId: "turn-1",
      createdAt: 1_050,
      createdAtSeq: 5,
      state: "streaming",
      text: "should-not-count",
    } as unknown as AssistantTextRow;
    const rows = [toolRow, textRow({ rowId: 6, text: "abc" })];
    const stats = collectStreamingResponseStats(rows);
    assert.ok(stats);
    assert.equal(stats.tokens, estimateTokens("abc"));
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
