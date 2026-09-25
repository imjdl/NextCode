import { useEffect, useReducer, useRef } from "react";
import { DatabaseIcon, HistoryIcon } from "lucide-react";

import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { SessionLease } from "@/v4/sessionDataLayer.js";
import {
  collectActiveTurnProgress,
  collectActiveTurnTokenStats,
  computeTokenRate,
  formatCacheHitRate,
  formatCompactTokenCount,
  resolveTurnTokenCount,
} from "@/v4/streamingTokenRate.js";
import { useConversationProjection } from "@/v4/useConversationProjection.js";

/** 流停时仍按时间推进重算（速率为累计平均，停顿会自然拉低读数），空闲不占定时器。 */
const RATE_TICK_INTERVAL_MS = 1_000;

/**
 * 输入框上方的会话状态行（右对齐）。两个信息组：
 * - 轮次 · 步数 · 生成速率：轮次/步数来自 projection 行（工具轮无正文也可显示），
 *   速率是混合计数（已完成 response 用 usage 真实增量、流中部分用文本估算）；
 * - 上下文 token · 缓存命中：usage.contextWindow 的 usedTokens 与 hitRate。
 *
 * 真值来自 per-session projection store（只读订阅），显示为渲染期纯推导，
 * 见 specs/streaming-token-rate.md；非 running（含轮次结束）时渲染 null。
 * usage.cumulative.outputTokens 投影侧只累计 main_turn（subagent/compact/标题生成
 * 等维护调用在累计更新前 early return，回归测试
 * apps/zcode-cli/packages/bootstrap/test/mainTurnUsageAccounting.test.ts）。
 * 基准与计时起点按 turnId 懒捕获——首轮输出行出现时 usage 必然还未计入本轮输出
 * （usage 在 response 完成时才更新），此时捕获即为本轮真基准。
 */
export function StreamingTokenRateStrip({ lease }: { lease: SessionLease | null }) {
  const { intl } = useZCodeIntl();
  const snapshot = useConversationProjection(lease).snapshot;
  const rows = snapshot?.rows.window;
  const phase = snapshot?.control.phase;
  const progress = rows ? collectActiveTurnProgress(rows, phase) : null;
  const stats = rows ? collectActiveTurnTokenStats(rows, phase) : null;
  const usageOutputTokens = snapshot?.usage?.cumulative?.outputTokens ?? null;
  const turnAnchorRef = useRef<{
    turnId: string;
    startedAt: number;
    baseline: number | null;
  } | null>(null);
  if (stats && turnAnchorRef.current?.turnId !== stats.turnId) {
    turnAnchorRef.current = {
      turnId: stats.turnId,
      startedAt: stats.startedAt,
      baseline: usageOutputTokens,
    };
  }
  const anchor = turnAnchorRef.current;
  const tokens = stats
    ? resolveTurnTokenCount(stats, {
        usageOutputTokens,
        baselineOutputTokens: anchor?.turnId === stats.turnId ? anchor.baseline : null,
      })
    : 0;
  const startedAt =
    stats && anchor?.turnId === stats.turnId ? anchor.startedAt : (stats?.startedAt ?? 0);
  const [, tick] = useReducer((value: number) => value + 1, 0);
  const active = progress !== null;

  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(tick, RATE_TICK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [active]);

  if (!progress) return null;
  const rate = stats ? computeTokenRate(tokens, Date.now() - startedAt) : null;
  const contextWindow = snapshot?.usage?.contextWindow ?? null;
  const contextTokens =
    contextWindow && Number.isFinite(contextWindow.usedTokens)
      ? formatCompactTokenCount(contextWindow.usedTokens)
      : null;
  const cacheHit = formatCacheHitRate(contextWindow?.cache?.hitRate);
  const usageParts = [
    contextTokens
      ? intl.formatMessage({ id: "chat.sessionStatus.contextTokens" }, { tokens: contextTokens })
      : null,
    cacheHit ? intl.formatMessage({ id: "chat.sessionStatus.cacheHit" }, { rate: cacheHit }) : null,
  ].filter((part): part is string => part !== null);

  return (
    <div className="mb-1 flex w-full items-center justify-end gap-4 px-4 max-md:px-2">
      <div
        className="flex items-center gap-1.5 text-ui-xs text-foreground-subtle"
        {...(stats && rate !== null
          ? {
              title: intl.formatMessage(
                { id: "chat.streamingTokenRate.title" },
                {
                  tokens: tokens.toLocaleString(),
                  seconds: Math.max(1, Math.round((Date.now() - startedAt) / 1_000)).toString(),
                },
              ),
            }
          : {})}
      >
        <HistoryIcon className="size-3.5 shrink-0" aria-hidden />
        <span>
          {intl.formatMessage(
            { id: "chat.sessionStatus.turnSteps" },
            { steps: String(progress.stepCount), turns: String(progress.turnOrdinal) },
          )}
          {rate !== null
            ? ` · ${intl.formatMessage(
                { id: "chat.streamingTokenRate" },
                { rate: Math.round(rate).toLocaleString() },
              )}`
            : null}
        </span>
      </div>
      {usageParts.length > 0 ? (
        <div className="flex items-center gap-1.5 text-ui-xs text-foreground-subtle">
          <DatabaseIcon className="size-3.5 shrink-0" aria-hidden />
          <span>{usageParts.join(" · ")}</span>
        </div>
      ) : null}
    </div>
  );
}
