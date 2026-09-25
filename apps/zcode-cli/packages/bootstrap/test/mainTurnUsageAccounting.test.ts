// 会话累计 usage 的主轮不变量（specs/streaming-token-rate.md 依赖）：
// cumulative.outputTokens 只累计 main_turn 的模型输出——onModelComplete 对非主轮
// querySource（subagent/compact/session_title/goal_summary_title 等）在累计更新前
// early return。流式速率条按「轮次开始的累计值差值」归因主回复 token，
// 该不变量被破坏时速率条会把维护调用的输出算进主回复，本测试钉死它。
import assert from "node:assert/strict";
import { test } from "node:test";

import { SessionEventType, type SessionEvent } from "@zcode/contracts";

import { ProductProjection } from "../src/zcode-protocol-v4/product-projection.js";

const SESSION_ID = "sess-main-turn-usage-test";
const TURN_ID = "turn-usage-1";

let seq = 0;

function event(type: SessionEventType, payload: Record<string, unknown>, turnId?: string): SessionEvent {
  seq += 1;
  return {
    id: `evt-${seq}` as SessionEvent["id"],
    sessionId: SESSION_ID as SessionEvent["sessionId"],
    ...(turnId !== undefined ? { turnId: turnId as SessionEvent["turnId"] } : {}),
    type,
    timestamp: new Date(1_700_000_000_000 + seq * 1_000),
    traceId: "trace-1" as SessionEvent["traceId"],
    sequenceNumber: seq,
    payload,
  } as SessionEvent;
}

/** 组一个最小合法的 main turn 事件流，末尾的 ModelComplete 由用例定制。 */
function seedSession(projection: ProductProjection): void {
  projection.applyEvent(event(SessionEventType.SessionCreated, { mode: "default" }));
  projection.applyEvent(
    event(
      SessionEventType.TurnStarted,
      { turnNumber: 1, input: "hi", messageId: "msg-user-1" },
      TURN_ID,
    ),
  );
  projection.applyEvent(
    event(
      SessionEventType.ModelStreaming,
      { kind: "text_start", delta: "", done: false, assistantMessageId: "msg-a-1", partId: "part-a-1" },
      TURN_ID,
    ),
  );
  projection.applyEvent(
    event(
      SessionEventType.ModelStreaming,
      { kind: "text_delta", delta: "回答", done: false, assistantMessageId: "msg-a-1", partId: "part-a-1" },
      TURN_ID,
    ),
  );
  projection.applyEvent(
    event(SessionEventType.ModelStreaming, { kind: "text_end", delta: "", done: false, partId: "part-a-1" }, TURN_ID),
  );
}

function modelCompletePayload(querySource: string | undefined, outputTokens: number, stopReason = "end_turn") {
  return {
    content: "",
    ...(querySource !== undefined ? { querySource } : {}),
    stopReason,
    toolCallCount: 0,
    usage: { inputTokens: 10, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 },
  };
}

test("main_turn 的 ModelComplete 计入 cumulative.outputTokens", () => {
  const projection = new ProductProjection(SESSION_ID, "epoch-1");
  seedSession(projection);
  projection.applyEvent(event(SessionEventType.ModelComplete, modelCompletePayload("main_turn", 100), TURN_ID));
  assert.equal(projection.getSnapshot().usage.cumulative.outputTokens, 100);
});

test("subagent/compact/标题生成等维护调用不计入 cumulative.outputTokens", () => {
  const projection = new ProductProjection(SESSION_ID, "epoch-1");
  seedSession(projection);
  for (const source of ["subagent", "compact", "session_title", "goal_summary_title", "web_fetch_processing"]) {
    projection.applyEvent(event(SessionEventType.ModelComplete, modelCompletePayload(source, 50), TURN_ID));
  }
  projection.applyEvent(event(SessionEventType.ModelComplete, modelCompletePayload("main_turn", 80), TURN_ID));

  const cumulative = projection.getSnapshot().usage.cumulative;
  assert.equal(cumulative.outputTokens, 80);
});

test("旧事件缺 querySource：tool_internal 视为非主轮，其余按主轮计入", () => {
  const projection = new ProductProjection(SESSION_ID, "epoch-1");
  seedSession(projection);
  projection.applyEvent(
    event(SessionEventType.ModelComplete, modelCompletePayload(undefined, 200, "tool_internal"), TURN_ID),
  );
  projection.applyEvent(
    event(SessionEventType.ModelComplete, modelCompletePayload(undefined, 120, "tool_calls"), TURN_ID),
  );

  const cumulative = projection.getSnapshot().usage.cumulative;
  assert.equal(cumulative.outputTokens, 120);
});
