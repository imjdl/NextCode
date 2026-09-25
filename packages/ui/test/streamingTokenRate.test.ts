import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  AssistantTextRow,
  ConversationRow,
  ReasoningRow,
} from "@zcode/shared/zcode-protocol-v4";

import {
  collectActiveTurnProgress,
  collectActiveTurnTokenStats,
  computeTokenRate,
  estimateTokens,
  formatCacheHitRate,
  formatCompactTokenCount,
  resolveTurnTokenCount,
  TOKEN_RATE_MIN_ELAPSED_MS,
} from "@/v4/streamingTokenRate.js";

function turnHeaderRow(turnId: string, rowId: number): ConversationRow {
  return {
    kind: "turnHeader",
    rowId,
    turnId,
    createdAt: 500,
    createdAtSeq: rowId,
    origin: "userInput",
    state: "running",
    startedAt: 500,
  } as unknown as ConversationRow;
}

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

  it("英文按 ~4 字符/token 估算（0.24 token/字符）", () => {
    // 8 × 0.24 = 1.92 → 2。
    assert.equal(estimateTokens("abcdefgh"), 2);
  });

  it("中文按 ~0.95 token/字符 估算（会话库实测校准）", () => {
    // 10 个 CJK 字符 × 0.95 = 9.5 → 10。
    assert.equal(estimateTokens("一二三四五六七八九十"), 10);
  });

  it("中英混合分别加权", () => {
    // 5 CJK(4.75) + 8 other(1.92) = 6.67 → 7。
    assert.equal(estimateTokens("一二三四五六七八九十".slice(0, 5) + "abcdefgh"), 7);
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
    assert.equal(stats.turnId, "turn-1");
    assert.equal(stats.startedAt, 900);
    assert.equal(stats.completedTokens, estimateTokens("思考过程") + estimateTokens("先看下文件"));
    assert.equal(stats.streamingTokens, 0);
  });

  it("同轮跨 model response 的行按完成/流中分别累计", () => {
    const rows = [
      textRow({ rowId: 1, assistantResponseId: "resp-0", state: "complete", text: "first" }),
      toolRow({ rowId: 2, turnId: "turn-1" }),
      textRow({ rowId: 3, assistantResponseId: "resp-1", state: "streaming", text: "second" }),
    ];
    const stats = collectActiveTurnTokenStats(rows, "running");
    assert.ok(stats);
    assert.equal(stats.completedTokens, estimateTokens("first"));
    assert.equal(stats.streamingTokens, estimateTokens("second"));
  });

  it("上一轮的行不计入当前轮", () => {
    const rows = [
      textRow({ rowId: 1, turnId: "turn-0", state: "complete", text: "old-turn-output" }),
      textRow({ rowId: 2, turnId: "turn-1", state: "streaming", text: "new" }),
    ];
    const stats = collectActiveTurnTokenStats(rows, "running");
    assert.ok(stats);
    assert.equal(stats.turnId, "turn-1");
    assert.equal(stats.streamingTokens, estimateTokens("new"));
    assert.equal(stats.completedTokens, 0);
  });

  it("当前轮尚无正文/思考产出（首轮直接进工具）返回 null", () => {
    const rows = [toolRow({ rowId: 1, turnId: "turn-1" })];
    assert.equal(collectActiveTurnTokenStats(rows, "running"), null);
  });

  it("流式中的思考（reasoning）行计入 streamingTokens——思考过程参与速率", () => {
    const rows = [
      reasoningRow({ rowId: 1, state: "streaming", createdAt: 850, text: "正在思考的中间过程" }),
    ];
    const stats = collectActiveTurnTokenStats(rows, "running");
    assert.ok(stats);
    assert.equal(stats.streamingTokens, estimateTokens("正在思考的中间过程"));
    assert.equal(stats.startedAt, 850);
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

describe("resolveTurnTokenCount（混合计数）", () => {
  const stats = { turnId: "t", startedAt: 1_000, completedTokens: 100, streamingTokens: 20 };

  it("真实增量可信时：增量 + 流中估算（覆盖工具参数 token）", () => {
    assert.equal(
      resolveTurnTokenCount(stats, { usageOutputTokens: 560, baselineOutputTokens: 450 }),
      130,
    );
  });

  it("usage 或基准缺失回退纯文本估算", () => {
    assert.equal(
      resolveTurnTokenCount(stats, { usageOutputTokens: null, baselineOutputTokens: 450 }),
      120,
    );
    assert.equal(
      resolveTurnTokenCount(stats, { usageOutputTokens: 560, baselineOutputTokens: null }),
      120,
    );
  });

  it("增量为负（usage 重载）回退估算", () => {
    assert.equal(
      resolveTurnTokenCount(stats, { usageOutputTokens: 100, baselineOutputTokens: 450 }),
      120,
    );
  });

  it("基准中途才捕获（增量追不上已完成文本一半）回退估算", () => {
    assert.equal(
      resolveTurnTokenCount(stats, { usageOutputTokens: 480, baselineOutputTokens: 450 }),
      120,
    );
  });

  it("增量略低于已完成估算但过半时仍信真实值（估算有 ±10% 噪声）", () => {
    // delta 80 ≥ 100×0.5 → 80 + 20 = 100。
    assert.equal(
      resolveTurnTokenCount(stats, { usageOutputTokens: 530, baselineOutputTokens: 450 }),
      100,
    );
  });
});

describe("collectActiveTurnProgress（轮次序号 + 步数）", () => {
  it("phase 非 running 或空窗口返回 null", () => {
    assert.equal(collectActiveTurnProgress([toolRow({ rowId: 1 })], "completedSuccess"), null);
    assert.equal(collectActiveTurnProgress([], "running"), null);
  });

  it("首轮直接进工具调用（无正文）仍给出轮次与步数——状态行保持可见", () => {
    const rows = [
      turnHeaderRow("turn-1", 1),
      toolRow({ rowId: 2, turnId: "turn-1" }),
      toolRow({ rowId: 3, turnId: "turn-1" }),
    ];
    const progress = collectActiveTurnProgress(rows, "running");
    assert.ok(progress);
    assert.equal(progress.turnOrdinal, 1);
    assert.equal(progress.stepCount, 2);
  });

  it("多轮窗口：取活跃轮次的序号，只数该轮步数", () => {
    const rows = [
      turnHeaderRow("turn-1", 1),
      toolRow({ rowId: 2, turnId: "turn-1" }),
      turnHeaderRow("turn-2", 3),
      toolRow({ rowId: 4, turnId: "turn-2" }),
      textRow({ rowId: 5, turnId: "turn-2", state: "streaming", text: "第二轮的回复" }),
    ];
    const progress = collectActiveTurnProgress(rows, "running");
    assert.ok(progress);
    assert.equal(progress.turnOrdinal, 2);
    assert.equal(progress.stepCount, 1);
  });
});

describe("formatCompactTokenCount / formatCacheHitRate", () => {
  it("紧凑 token 格式：千位以下原样、K 取整、M 一位小数", () => {
    assert.equal(formatCompactTokenCount(950), "950");
    assert.equal(formatCompactTokenCount(113_400), "113K");
    assert.equal(formatCompactTokenCount(1_250_000), "1.3M");
    assert.equal(formatCompactTokenCount(-5), "0");
  });

  it("缓存命中率：比率换算百分比并夹取边界", () => {
    assert.equal(formatCacheHitRate(0.92), "92%");
    assert.equal(formatCacheHitRate(0), "0%");
    assert.equal(formatCacheHitRate(1), "100%");
    assert.equal(formatCacheHitRate(1.4), "100%");
    assert.equal(formatCacheHitRate(null), null);
    assert.equal(formatCacheHitRate(undefined), null);
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
