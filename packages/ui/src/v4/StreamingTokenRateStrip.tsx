import { useEffect, useReducer } from "react";
import { GaugeIcon } from "lucide-react";

import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { SessionLease } from "@/v4/sessionDataLayer.js";
import { collectStreamingResponseStats, computeTokenRate } from "@/v4/streamingTokenRate.js";
import { useConversationProjection } from "@/v4/useConversationProjection.js";

/** 流停时仍按时间推进重算（速率为累计平均，停顿会自然拉低读数），空闲不占定时器。 */
const RATE_TICK_INTERVAL_MS = 1_000;

/**
 * 输入框上方的流式 token 速率条。真值来自 per-session projection store（只读订阅），
 * 速率为渲染期纯推导，见 specs/streaming-token-rate.md；无流式输出时渲染 null。
 */
export function StreamingTokenRateStrip({ lease }: { lease: SessionLease | null }) {
  const { intl } = useZCodeIntl();
  const snapshot = useConversationProjection(lease).snapshot;
  const stats = snapshot ? collectStreamingResponseStats(snapshot.rows.window) : null;
  const [, tick] = useReducer((value: number) => value + 1, 0);
  const active = stats !== null;

  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(tick, RATE_TICK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [active]);

  if (!stats) return null;
  const elapsedMs = Date.now() - stats.startedAt;
  const rate = computeTokenRate(stats.tokens, elapsedMs);
  if (rate === null) return null;

  return (
    <div className="mb-1 flex w-full items-center justify-center px-4 max-md:px-2">
      <div
        className="flex items-center gap-1.5 text-ui-xs text-foreground-subtle"
        title={intl.formatMessage(
          { id: "chat.streamingTokenRate.title" },
          {
            tokens: stats.tokens.toLocaleString(),
            seconds: Math.max(1, Math.round(elapsedMs / 1_000)).toString(),
          },
        )}
      >
        <GaugeIcon className="size-3.5 shrink-0" aria-hidden />
        <span>
          {intl.formatMessage(
            { id: "chat.streamingTokenRate" },
            { rate: Math.round(rate).toLocaleString() },
          )}
        </span>
      </div>
    </div>
  );
}
