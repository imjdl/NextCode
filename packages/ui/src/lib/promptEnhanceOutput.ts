/**
 * 提示词增强输出的归一化。
 *
 * 模型常把改写结果包进代码围栏或成对引号，直接替换会污染输入框；
 * 这里只做「整段被包裹」时的解包，避免破坏正文里正常存在的引用与围栏。
 */
const WHOLE_FENCED_BLOCK = /^```[^\n]*\n([\s\S]*?)\n?```$/;
const PAIRED_WRAPPERS: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ["'", "'"],
  ["「", "」"],
];

function unwrapPairedQuotes(text: string): string {
  for (const [open, close] of PAIRED_WRAPPERS) {
    if (
      !text.startsWith(open) ||
      !text.endsWith(close) ||
      text.length < open.length + close.length
    ) {
      continue;
    }
    const inner = text.slice(open.length, text.length - close.length).trim();
    // 正文自身含同类引号时说明这不是一层包裹，保持原样。
    if (inner && !inner.includes(open) && !inner.includes(close)) {
      return inner;
    }
  }
  return text;
}

export function normalizePromptEnhanceOutput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  const fenced = WHOLE_FENCED_BLOCK.exec(trimmed);
  return unwrapPairedQuotes(fenced?.[1]?.trim() ?? trimmed);
}
