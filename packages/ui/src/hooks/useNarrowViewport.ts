import { useEffect, useState } from "react";

/**
 * 窄视口断点（px）。Web 端手机浏览器与桌面窄窗口共用同一判据：
 * 小于该宽度时侧栏改为覆盖抽屉、默认收起，避免"侧栏 + 聊天列 min-w-[320px]"相加超出视口被裁切。
 */
export const NARROW_VIEWPORT_MAX_WIDTH_PX = 768;

function readNarrowViewport(maxWidthPx: number): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    // 无 window（如测试环境）按宽视口处理，保持既有桌面行为。
    return false;
  }
  return window.matchMedia(`(max-width: ${maxWidthPx}px)`).matches;
}

/**
 * 订阅视口是否处于窄视口。用 matchMedia 而不是 resize 监听：只在跨越断点时触发一次重渲染，
 * 拖动窗口大小不会让整棵 workspace 子树跟着每帧 commit。
 */
export function useNarrowViewport(maxWidthPx: number = NARROW_VIEWPORT_MAX_WIDTH_PX): boolean {
  const [isNarrow, setIsNarrow] = useState(() => readNarrowViewport(maxWidthPx));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }
    const query = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
    const sync = () => setIsNarrow(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [maxWidthPx]);

  return isNarrow;
}
