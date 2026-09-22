import { createHash } from "node:crypto";

/**
 * Web 服务响应安全头（局域网 Web 远控 / 独立 Web 服务）。
 *
 * 目标不是传输加密（局域网内是明文 http），而是限制页面自身的能力，缩小"页面被注入
 * 内容后能做什么"的范围：
 *  - 禁止加载远程脚本：脚本只能来自本服务，且内联脚本必须逐个哈希匹配（首屏主题脚本
 *    是内联的，所以按实际发送的文件内容算哈希，随文件变化自动失效/生效）。
 *  - 禁止被跨站嵌入（frame-ancestors/X-Frame-Options），避免点击劫持覆盖 UI。
 *  - Referrer-Policy 置空：二维码 URL 里带 token，禁止通过 Referer 外泄。
 *  - 媒体权限收敛：本页面不使用摄像头/麦克风/定位/支付/USB。
 *
 * 不收敛 connect-src 到仅 'self'：Safari 对 CSP3 的 'self' 是否覆盖 ws:// 实现不一致，
 * 而手机端（Safari）扫码后必须能建立同源 WebSocket。脚本注入已被 script-src 阻断，
 * 因此保留 ws:/wss: 的兼容性收益大于风险。
 */
const INLINE_SCRIPT_PATTERN = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;

/** 所有响应共用的头；对静态资源与 API 响应都安全。 */
export function baseSecurityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    // 二维码 URL 携带 token，禁止把完整 URL 作为 Referer 发给外部站点。
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  };
}

/** 内联脚本的 sha256 哈希（CSP 语法形式）。空脚本不参与。 */
export function inlineScriptHashes(html: string): string[] {
  const hashes = new Set<string>();
  for (const match of html.matchAll(INLINE_SCRIPT_PATTERN)) {
    const body = match[1];
    // 必须按浏览器解析后的脚本文本原样哈希：不能 trim、不能改空白，否则哈希对不上、
    // 内联脚本被直接阻断（实测过一次：trim 后浏览器报 hash mismatch）。
    // 唯一需要归一化的是换行：HTML 解析器会把 CRLF 折成 LF，Windows 构建产物必须同规则。
    if (!body?.trim()) continue;
    const parsed = body.replace(/\r\n?/g, "\n");
    hashes.add(`'sha256-${createHash("sha256").update(parsed, "utf8").digest("base64")}'`);
  }
  return [...hashes];
}

/**
 * HTML 响应的 CSP。传入的是**实际发送的** index.html 内容，
 * 因此内联脚本哈希与页面始终一致（不存在"改了页面忘了改哈希"）。
 */
export function htmlSecurityHeaders(html: string): Record<string, string> {
  const scriptSources = ["'self'", ...inlineScriptHashes(html)].join(" ");
  const policy = [
    "default-src 'self'",
    `script-src ${scriptSources}`,
    // 样式由 Tailwind 与内联 style 属性产生，无法逐个哈希。
    "style-src 'self' 'unsafe-inline'",
    // 头像等账号图片来自 https 外链；data:/blob: 用于二维码、截图与本地预览。
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    "connect-src 'self' ws: wss:",
    "worker-src 'self' blob:",
    "frame-src 'self' blob: data:",
    "child-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  return {
    ...baseSecurityHeaders(),
    "Content-Security-Policy": policy,
    // 明文 http 下无法使用 HSTS/Secure Cookie；至少禁止按 MIME 嗅探执行下载内容。
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}
