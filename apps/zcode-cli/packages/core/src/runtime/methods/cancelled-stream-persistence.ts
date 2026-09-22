import { createPartId } from "../deps.js";
import type { MessageId, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { RuntimeModelStreamSnapshot } from "../types.js";
import { hasAssistantReasoningContent } from "./turn-output-token-continuation.js";

export async function persistCancelledStreamSnapshot(
  runtime: AgentRuntimeInternal,
  options: {
    assistantCreatedAt: number;
    assistantMessageId: MessageId;
    snapshot: RuntimeModelStreamSnapshot;
    traceContext: TraceContext;
    /** 流式镜像已 upsert 的进行中 part id；取消 flush 复用同 id 覆盖，避免重复正文。 */
    inFlightPartIds?: {
      textPartId: ReturnType<typeof createPartId>;
      reasoningPartIds: ReturnType<typeof createPartId>[];
    };
  },
): Promise<void> {
  // 用户 stop 时模型请求会以异常退出，成功路径里的最终 text/reasoning
  // 持久化不会执行；这里只 flush 已经到达本进程的 text/reasoning，工具仍等终态路径处理。
  // flush 写不带 inFlightUpdatedAt：同 id 覆盖后进行中标记消失，水合按完成态收口。
  const completedAt = Date.now();
  const reasonings = options.snapshot.reasoning;
  for (let index = 0; index < reasonings.length; index += 1) {
    const reasoning = reasonings[index]!;
    if (!hasAssistantReasoningContent(reasoning)) continue;
    await runtime.persistPart(
      {
        id: options.inFlightPartIds?.reasoningPartIds[index] ?? createPartId(),
        sessionID: runtime.sessionId,
        messageID: options.assistantMessageId,
        type: "reasoning",
        text: reasoning.text,
        metadata: reasoning.providerOptions,
        time: {
          start: options.assistantCreatedAt,
          end: completedAt,
        },
      },
      options.traceContext,
    );
  }
  if (!options.snapshot.text) {
    return;
  }
  await runtime.persistPart(
    {
      id: options.inFlightPartIds?.textPartId ?? createPartId(),
      sessionID: runtime.sessionId,
      messageID: options.assistantMessageId,
      type: "text",
      text: options.snapshot.text,
      time: {
        start: options.assistantCreatedAt,
        end: completedAt,
      },
    },
    options.traceContext,
  );
}
