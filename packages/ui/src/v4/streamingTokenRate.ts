import type { ConversationRow } from "@zcode/shared/zcode-protocol-v4";

/**
 * 流式回复 token 速率的纯推导。
 *
 * v4 帧不携带逐帧真值 usage（sessionUsageState 只在消息完成时更新会话累计值），
 * 流式期间只能按启发式估算 token：CJK ≈ 0.6 token/字符（GLM/Claude 系词表经验值），
 * 其它字符 ≈ 1 token/4 字符。展示层必须带「≈」标示，不得暗示精确值。
 */

/** CJK 统一表意区 + 部首/标点 + 全角形（BMP 范围；增补平面按 2 个其它字符计，偏差可忽略）。 */
function isCjkCodeUnit(code: number): boolean {
  return (
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xffef)
  );
}

export const CJK_TOKENS_PER_CHAR = 0.6;
export const OTHER_CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (isCjkCodeUnit(text.charCodeAt(index))) {
      cjk += 1;
    } else {
      other += 1;
    }
  }
  const estimate = cjk * CJK_TOKENS_PER_CHAR + other / OTHER_CHARS_PER_TOKEN;
  // 非空文本至少计 1 token，避免首帧 0  token 把速率判成空。
  return Math.max(1, Math.round(estimate));
}

export interface StreamingResponseStats {
  /** 当前 response 首个输出行的 createdAt（epoch ms）。 */
  startedAt: number;
  /** 该 response 已产出文本 + reasoning 的 token 估算值。 */
  tokens: number;
}

/**
 * 定位「当前正在流式输出的 model response」并统计其速率分子/起点。
 * 返回 null = 当前没有流式输出行（含轮次已结束），展示层据此隐藏。
 */
export function collectStreamingResponseStats(
  rows: readonly ConversationRow[],
): StreamingResponseStats | null {
  // 当前 response 以第一个 streaming 输出行的 assistantResponseId 定位；
  // 旧帧缺 id 时退化为「所有 streaming 行」。
  let responseId: string | undefined;
  let hasStreamingRow = false;
  for (const row of rows) {
    if ((row.kind === "assistantText" || row.kind === "reasoning") && row.state === "streaming") {
      responseId = row.assistantResponseId;
      hasStreamingRow = true;
      break;
    }
  }
  if (!hasStreamingRow) return null;

  let tokens = 0;
  let startedAt = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    if (row.kind !== "assistantText" && row.kind !== "reasoning") continue;
    const belongs =
      responseId === undefined ? row.state === "streaming" : row.assistantResponseId === responseId;
    if (!belongs) continue;
    tokens += estimateTokens(row.text);
    startedAt = Math.min(startedAt, row.createdAt);
  }
  if (!Number.isFinite(startedAt)) return null;
  return { startedAt, tokens };
}

/** 生成不足该时长不显示：首帧抖动大，累计平均值失真。 */
export const TOKEN_RATE_MIN_ELAPSED_MS = 750;

/** tokens/秒；未达门控（时长或 token 过小）返回 null。 */
export function computeTokenRate(tokens: number, elapsedMs: number): number | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs < TOKEN_RATE_MIN_ELAPSED_MS) return null;
  if (tokens < 1) return null;
  return tokens / (elapsedMs / 1_000);
}
