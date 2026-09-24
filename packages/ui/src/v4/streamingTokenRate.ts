import type { ConversationRow, SessionPhase } from "@zcode/shared/zcode-protocol-v4";

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
  // 非空文本至少计 1 token，避免首帧 0 token 把速率判成空。
  return Math.max(1, Math.round(estimate));
}

export interface ActiveTurnTokenStats {
  /** 当前轮首个正文/思考行的 createdAt（epoch ms）。 */
  startedAt: number;
  /** 当前轮已产出正文 + 思考的 token 估算值（跨 model response 累计）。 */
  tokens: number;
}

/**
 * 统计「当前回复轮次」的速率分子/起点。返回 null = 展示层隐藏：
 * - phase 不是 running（轮次已结束、draft、prewarming 尚无产出）；
 * - 当前轮还没有任何正文/思考行（模型首轮直接进工具调用）。
 *
 * 统计范围是**整个 turn** 而非单个 model response：工具执行间隙（读文件/执行命令）
 * 没有流式文本行，但轮次仍在 running，此时保持显示、速率按累计时间自然回落；
 * 同轮跨 response 的 token 累加（用户语境里的「这条回复」是整个轮次）。
 */
export function collectActiveTurnTokenStats(
  rows: readonly ConversationRow[],
  phase: SessionPhase | null | undefined,
): ActiveTurnTokenStats | null {
  if (phase !== "running") return null;
  if (rows.length === 0) return null;
  // running 期间最新一行必然属于当前活跃轮次（轮次内行按序追加）。
  const activeTurnId = rows[rows.length - 1]!.turnId;
  let tokens = 0;
  let startedAt = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    if (row.turnId !== activeTurnId) continue;
    if (row.kind !== "assistantText" && row.kind !== "reasoning") continue;
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
