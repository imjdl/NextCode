// 跨端流式镜像的水合投影（specs/web-mobile-cross-process-sync.md 第三阶段）：
// 新鲜 in-flight part → streaming 行、turn 不收口；过期 → 维持 interrupted 收口；
// 正常完成 → success 收口（回归保护）。
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HYDRATION_IN_FLIGHT_FRESH_MS,
  synthesizeEventsFromMessages,
} from "../src/zcode-protocol-v4/transcript-hydration.js";
import type { MessageWithParts } from "@zcode/contracts";

const SESSION_ID = "sess-hydrate-test";

function buildTranscript(options: {
  assistantCompleted?: number;
  textInFlightAt?: number;
  reasoningInFlightAt?: number;
}): MessageWithParts[] {
  const now = Date.now();
  return [
    {
      info: {
        id: "msg-user",
        sessionID: SESSION_ID,
        role: "user",
        time: { created: now - 60_000 },
      },
      parts: [
        {
          id: "part-user-text",
          sessionID: SESSION_ID,
          messageID: "msg-user",
          type: "text",
          text: "请分析一下",
        },
      ],
    },
    {
      info: {
        id: "msg-assistant",
        sessionID: SESSION_ID,
        role: "assistant",
        time: {
          created: now - 30_000,
          ...(options.assistantCompleted !== undefined
            ? { completed: options.assistantCompleted }
            : {}),
        },
      },
      parts: [
        {
          id: "part-reasoning",
          sessionID: SESSION_ID,
          messageID: "msg-assistant",
          type: "reasoning",
          text: "思考中：先看结构……",
          time: { start: now - 30_000 },
          ...(options.reasoningInFlightAt !== undefined
            ? { inFlightUpdatedAt: options.reasoningInFlightAt }
            : {}),
        },
        {
          id: "part-text",
          sessionID: SESSION_ID,
          messageID: "msg-assistant",
          type: "text",
          text: "目前已经生成的部分回答……",
          time: {
            start: now - 30_000,
            ...(options.assistantCompleted !== undefined
              ? { end: options.assistantCompleted }
              : {}),
          },
          ...(options.textInFlightAt !== undefined
            ? { inFlightUpdatedAt: options.textInFlightAt }
            : {}),
        },
      ],
    },
  ];
}

function streamingKindsOf(events: ReturnType<typeof synthesizeEventsFromMessages>) {
  return events
    .filter((event) => event.type === "model_streaming")
    .map((event) => (event.payload as { kind?: string }).kind);
}

function turnCompletesOf(events: ReturnType<typeof synthesizeEventsFromMessages>) {
  return events
    .filter((event) => event.type === "turn_complete")
    .map((event) => (event.payload as { resultType?: string }).resultType);
}

test("新鲜 in-flight part：不收口 text/reasoning，turn 保持打开（无 TurnComplete）", () => {
  const now = Date.now();
  const events = synthesizeEventsFromMessages(
    buildTranscript({ textInFlightAt: now - 500, reasoningInFlightAt: now - 500 }),
    { sessionId: SESSION_ID },
  );
  const kinds = streamingKindsOf(events);
  assert.ok(kinds.includes("text_start"));
  assert.ok(kinds.includes("text_delta"));
  assert.ok(kinds.includes("reasoning_start"));
  assert.ok(kinds.includes("reasoning_delta"));
  assert.ok(!kinds.includes("text_end"), "进行中 text 不应发 text_end");
  assert.ok(!kinds.includes("reasoning_end"), "进行中 reasoning 不应发 reasoning_end");
  assert.deepEqual(turnCompletesOf(events), [], "进行中 turn 不应合成 TurnComplete");
});

test("过期 in-flight part：回落 interrupted 收口（进程崩溃语义保留）", () => {
  const now = Date.now();
  const staleAt = now - HYDRATION_IN_FLIGHT_FRESH_MS - 60_000;
  const events = synthesizeEventsFromMessages(
    buildTranscript({ textInFlightAt: staleAt, reasoningInFlightAt: staleAt }),
    { sessionId: SESSION_ID },
  );
  const kinds = streamingKindsOf(events);
  assert.ok(kinds.includes("text_end"), "过期后应恢复 text_end 收口");
  assert.ok(kinds.includes("reasoning_end"), "过期后应恢复 reasoning_end 收口");
  assert.deepEqual(turnCompletesOf(events), ["cancelled"], "过期未完成应按 cancelled 收口");
});

test("正常完成消息：success 收口（回归保护，不受镜像改动影响）", () => {
  const now = Date.now();
  const events = synthesizeEventsFromMessages(
    buildTranscript({ assistantCompleted: now - 1_000 }),
    { sessionId: SESSION_ID },
  );
  assert.deepEqual(turnCompletesOf(events), ["success"]);
  assert.ok(streamingKindsOf(events).includes("text_end"));
});

test("无心跳的未完成消息：维持旧 cancelled 语义（旧库数据兼容）", () => {
  const events = synthesizeEventsFromMessages(buildTranscript({}), {
    sessionId: SESSION_ID,
  });
  assert.deepEqual(turnCompletesOf(events), ["cancelled"]);
});
