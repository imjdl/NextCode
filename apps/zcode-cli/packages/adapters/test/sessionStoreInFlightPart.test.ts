// 跨端流式镜像的持久层行为（specs/web-mobile-cross-process-sync.md 第三阶段）：
// savePart 同 id upsert 覆盖内容与 time_updated；inFlightUpdatedAt 随 data JSON 往返；
// 完成写（不带标记、带 end）覆盖后进行中标记消失——不产生第二行。
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteSessionStore } from "../src/storage/session-store/sqlite-session-store.js";
import type { MessagePart } from "@zcode/contracts";

const SESSION_ID = "sess-inflight-store-test" as never;
const MESSAGE_ID = "msg-assistant" as never;

function buildStore(): { store: SqliteSessionStore; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "zcode-inflight-store-"));
  const store = new SqliteSessionStore({ dbPath: join(dir, "db.sqlite") });
  return {
    store,
    cleanup: () => {
      try {
        store.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

async function seedSession(store: SqliteSessionStore): Promise<void> {
  await store.createSession({
    id: SESSION_ID,
    projectID: "proj-1" as never,
    slug: "inflight-test",
    directory: "E:\\tmp",
    title: "in-flight 存储测试",
    version: "0",
  } as never);
  await store.saveMessage({
    id: MESSAGE_ID,
    sessionID: SESSION_ID,
    role: "assistant",
    time: { created: Date.now() - 5_000 },
  } as never);
}

function inFlightTextPart(text: string, at: number): MessagePart {
  return {
    id: "part-text-1" as never,
    sessionID: SESSION_ID,
    messageID: MESSAGE_ID,
    type: "text",
    text,
    time: { start: Date.now() - 5_000 },
    inFlightUpdatedAt: at,
  };
}

test("进行中 part：同 id upsert 内容前进，标记随 JSON 往返", async () => {
  const { store, cleanup } = buildStore();
  try {
    await seedSession(store);
    const t1 = Date.now() - 2_000;
    await store.savePart(inFlightTextPart("第一段", t1));
    await store.savePart(inFlightTextPart("第一段+第二段", Date.now()));
    const [message] = await store.messages({ sessionID: SESSION_ID });
    const parts = message?.parts.filter((part) => part.type === "text") ?? [];
    assert.equal(parts.length, 1, "同 id upsert 不得产生第二行");
    const text = parts[0] as Extract<MessagePart, { type: "text" }>;
    assert.equal(text.text, "第一段+第二段");
    assert.notEqual(text.inFlightUpdatedAt, t1, "标记应随后一次 upsert 前进");
  } finally {
    cleanup();
  }
});

test("完成写覆盖：end 落位且 inFlightUpdatedAt 消失", async () => {
  const { store, cleanup } = buildStore();
  try {
    await seedSession(store);
    await store.savePart(inFlightTextPart("部分正文", Date.now()));
    await store.savePart({
      id: "part-text-1" as never,
      sessionID: SESSION_ID,
      messageID: MESSAGE_ID,
      type: "text",
      text: "部分正文",
      time: { start: Date.now() - 5_000, end: Date.now() },
    });
    const [message] = await store.messages({ sessionID: SESSION_ID });
    const text = message?.parts.find((part) => part.type === "text") as Extract<
      MessagePart,
      { type: "text" }
    >;
    assert.equal(text.text, "部分正文");
    assert.notEqual(text.time?.end, undefined, "完成写应落 end");
    assert.equal(text.inFlightUpdatedAt, undefined, "完成写应清掉进行中标记");
  } finally {
    cleanup();
  }
});
