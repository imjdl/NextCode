import type { ConversationRow, SessionPhase } from "@zcode/shared/zcode-protocol-v4";

/**
 * 流式回复 token 速率的纯推导。
 *
 * token 计数是**混合值**：已完成 response 用会话累计 usage 的真实增量
 * （`usage.cumulative.outputTokens`，含工具参数 JSON——这部分不存在 text/reasoning
 * 行里，文本估算永远追不上，实测纯文本估算对含工具轮次偏差 38%）；仅流式中的行用
 * 启发式估算。v4 帧不携带逐帧真值 usage（sessionUsageState 在消息完成时更新累计值），
 * 流式期间按字符估算并在 UI 上以「≈」标示，不得暗示精确值。
 *
 * 估算系数按会话库 21 条纯文本 GLM 消息（无 tool part）实测最小二乘拟合：
 * CJK ≈ 0.95 token/字符，其它 ≈ 0.24 token/字符，样本整体误差 3.7%。
 */

/** CJK 统一表意区 + 部首/标点 + 全角形（BMP 范围；增补平面按 2 个其它字符计，偏差可忽略）。 */
function isCjkCodeUnit(code: number): boolean {
  return (
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xffef)
  );
}

export const CJK_TOKENS_PER_CHAR = 0.95;
export const OTHER_TOKENS_PER_CHAR = 0.24;

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
  const estimate = cjk * CJK_TOKENS_PER_CHAR + other * OTHER_TOKENS_PER_CHAR;
  // 非空文本至少计 1 token，避免首帧 0 token 把速率判成空。
  return Math.max(1, Math.round(estimate));
}

export interface ActiveTurnTokenStats {
  turnId: string;
  /** 当前轮首个正文/思考行的 createdAt（epoch ms）。 */
  startedAt: number;
  /** 已完成行（complete/interrupted/failed）的文本估算值。 */
  completedTokens: number;
  /** 流式中的行（streaming）的文本估算值。 */
  streamingTokens: number;
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
  const lastRow = rows[rows.length - 1]!;
  const activeTurnId = lastRow.turnId;
  let completedTokens = 0;
  let streamingTokens = 0;
  let startedAt = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    if (row.turnId !== activeTurnId) continue;
    if (row.kind !== "assistantText" && row.kind !== "reasoning") continue;
    if (row.state === "streaming") {
      streamingTokens += estimateTokens(row.text);
    } else {
      completedTokens += estimateTokens(row.text);
    }
    startedAt = Math.min(startedAt, row.createdAt);
  }
  if (!Number.isFinite(startedAt)) return null;
  return {
    turnId: activeTurnId,
    startedAt,
    completedTokens,
    streamingTokens,
  };
}

export interface ActiveTurnProgress {
  turnId: string;
  /** 当前轮在已加载窗口内的序号（1 基；长轮把 header 裁出窗口时退化为窗口内 header 数）。 */
  turnOrdinal: number;
  /** 当前轮已执行的工具调用步数（toolCall 行数，不区分成败）。 */
  stepCount: number;
}

/**
 * 当前轮的进度（轮次序号 + 步数）。与 token 统计分开：模型首轮直接进工具调用时
 * 没有任何正文/思考行，速率不成立，但「第几轮、第几步」仍然成立、照常显示。
 */
export function collectActiveTurnProgress(
  rows: readonly ConversationRow[],
  phase: SessionPhase | null | undefined,
): ActiveTurnProgress | null {
  if (phase !== "running") return null;
  if (rows.length === 0) return null;
  const lastRow = rows[rows.length - 1]!;
  const activeTurnId = lastRow.turnId;
  let headerCount = 0;
  let activeTurnOrdinal = 0;
  let stepCount = 0;
  for (const row of rows) {
    if (row.kind === "turnHeader") {
      headerCount += 1;
      if (row.turnId === activeTurnId) activeTurnOrdinal = headerCount;
      continue;
    }
    if (row.turnId !== activeTurnId) continue;
    if (row.kind === "toolCall") stepCount += 1;
  }
  return {
    turnId: activeTurnId,
    // 窗口内序号；长轮把本轮 header 裁出窗口时退化为窗口内 header 总数（可能低估）。
    turnOrdinal: activeTurnOrdinal > 0 ? activeTurnOrdinal : Math.max(1, headerCount),
    stepCount,
  };
}

/** 113K / 1.2M 紧凑格式；< 1000 原样，K 取整，M 保留一位。 */
export function formatCompactTokenCount(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens < 0) return "0";
  if (tokens < 1_000) return String(Math.round(tokens));
  if (tokens < 1_000_000) return `${Math.round(tokens / 1_000)}K`;
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}

/** 缓存命中率：投影侧 hitRate 是 cacheRead/input 的比率（0-1），展示为百分比。 */
export function formatCacheHitRate(hitRate: number | null | undefined): string | null {
  if (hitRate === null || hitRate === undefined || !Number.isFinite(hitRate)) return null;
  const percent = Math.round(Math.min(1, Math.max(0, hitRate)) * 100);
  return `${percent}%`;
}

/**
 * 混合计数：真实 usage 增量（覆盖已完成 response 的全部输出，含工具参数）+
 * 流式中文本估算。真实基准不可信时整体回退到纯文本估算：
 * - usage 或基准缺失（旧 CLI / 会话中途才挂载展示层）；
 * - 增量为负（usage 重载/重置）；
 * - 增量明显追不上已完成行的文本估算（基准在本轮中途才捕获，漏掉了前面的 response）。
 */
export function resolveTurnTokenCount(
  stats: ActiveTurnTokenStats,
  usage: {
    usageOutputTokens: number | null;
    baselineOutputTokens: number | null;
  },
): number {
  const estimated = stats.completedTokens + stats.streamingTokens;
  const { usageOutputTokens, baselineOutputTokens } = usage;
  if (usageOutputTokens === null || baselineOutputTokens === null) return estimated;
  const realDelta = usageOutputTokens - baselineOutputTokens;
  if (realDelta < 0 || realDelta < stats.completedTokens * 0.5) return estimated;
  return realDelta + stats.streamingTokens;
}

/** 生成不足该时长不显示：首帧抖动大，累计平均值失真。 */
export const TOKEN_RATE_MIN_ELAPSED_MS = 750;

/** tokens/秒；未达门控（时长或 token 过小）返回 null。 */
export function computeTokenRate(tokens: number, elapsedMs: number): number | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs < TOKEN_RATE_MIN_ELAPSED_MS) return null;
  if (tokens < 1) return null;
  return tokens / (elapsedMs / 1_000);
}
