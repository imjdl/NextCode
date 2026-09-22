import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  baseSecurityHeaders,
  htmlSecurityHeaders,
  inlineScriptHashes,
} from "../src/httpSecurityHeaders.js";

const sha256 = (value: string) =>
  `'sha256-${createHash("sha256").update(value, "utf8").digest("base64")}'`;

test("内联脚本哈希与实际文本逐字节一致（不做 trim）", () => {
  // 回归用例：首版实现先 trim 再哈希，浏览器按原始文本校验导致哈希不匹配、
  // 内联首屏主题脚本被 CSP 直接阻断。缩进/换行必须原样参与哈希。
  const html = ['<script>\n      const a = 1;\n    </script>'].join("");
  assert.deepEqual(inlineScriptHashes(html), [sha256("\n      const a = 1;\n    ")]);
  assert.notDeepEqual(inlineScriptHashes(html), [sha256("const a = 1;")]);
});

test("html 解析器会把 CRLF 折成 LF，Windows 产物按同规则哈希", () => {
  const html = "<script>\r\nconst a = 1;\r\n</script>";
  assert.deepEqual(inlineScriptHashes(html), [sha256("\nconst a = 1;\n")]);
});

test("只有带 src 的脚本不参与哈希，空脚本忽略", () => {
  assert.deepEqual(inlineScriptHashes('<script src="/assets/index.js"></script>'), []);
  assert.deepEqual(inlineScriptHashes("<script>   </script>"), []);
  assert.deepEqual(inlineScriptHashes("<p>无脚本</p>"), []);
});

test("多个内联脚本各自生成一个哈希", () => {
  const html = "<script>a()</script><script src=\"/x.js\"></script><script>b()</script>";
  assert.deepEqual(inlineScriptHashes(html), [sha256("a()"), sha256("b()")]);
});

test("无内联脚本时不产生脚本哈希（只留 'self' 与 wasm 许可）", () => {
  const policy = htmlSecurityHeaders("<html><body></body></html>")["Content-Security-Policy"] ?? "";
  assert.deepEqual(directiveTokens(policy, "script-src"), ["'self'", "'wasm-unsafe-eval'"]);
});

/** 取出某条 CSP 指令的取值 token（按空格切分，不含指令名）。 */
function directiveTokens(policy: string, name: string): string[] {
  const directive = policy.split("; ").find((part) => part.startsWith(`${name} `));
  return directive ? directive.split(/\s+/).slice(1) : [];
}

test("CSP 关键指令齐全，且不允许远程脚本与远程嵌入", () => {
  const policy = htmlSecurityHeaders("<script>x()</script>")["Content-Security-Policy"] ?? "";
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /script-src 'self' 'wasm-unsafe-eval' 'sha256-/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /base-uri 'self'/);
  assert.match(policy, /form-action 'self'/);
  // 手机端（Safari）对 CSP3 'self' 是否覆盖 ws:// 实现不一致，必须显式允许 ws/wss。
  assert.match(policy, /connect-src 'self' ws: wss:/);
});

test("script-src 只允许本服务、wasm 编译与内联脚本哈希", () => {
  // 回归用例：首版漏了 'wasm-unsafe-eval'，渲染层实例化 wasm 直接报 CompileError。
  const policy = htmlSecurityHeaders("<script>x()</script>")["Content-Security-Policy"] ?? "";
  const tokens = directiveTokens(policy, "script-src");
  assert.ok(tokens.includes("'self'"), "允许本服务脚本");
  assert.ok(tokens.includes("'wasm-unsafe-eval'"), "允许 WebAssembly 编译");
  assert.ok(
    tokens.some((token) => token.startsWith("'sha256-")),
    "允许哈希放行的内联脚本",
  );
  // 不能出现整段放开或远程来源（注意 'wasm-unsafe-eval' 含有 unsafe-eval 子串，故按 token 比较）。
  for (const forbidden of ["'unsafe-eval'", "'unsafe-inline'", "*", "'none'"]) {
    assert.ok(!tokens.includes(forbidden), `script-src 不应包含 ${forbidden}`);
  }
  assert.ok(!tokens.some((token) => /^https?:/.test(token)), "script-src 不应包含远程来源");
});

test("connect-src 不放开外网 https，官方配置请求被刻意拦截", () => {
  const policy = htmlSecurityHeaders("<script>x()</script>")["Content-Security-Policy"] ?? "";
  assert.deepEqual(directiveTokens(policy, "connect-src"), ["'self'", "ws:", "wss:"]);
});

test("基础安全头覆盖 nosniff / Referrer / 嵌入 / 媒体权限", () => {
  const headers = baseSecurityHeaders();
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  // 二维码 URL 携带 token，Referer 必须为空。
  assert.equal(headers["Referrer-Policy"], "no-referrer");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.match(headers["Permissions-Policy"] ?? "", /camera=\(\)/);
  assert.match(headers["Permissions-Policy"] ?? "", /microphone=\(\)/);
});

test("HTML 响应同时带基础安全头与 CSP", () => {
  const headers = htmlSecurityHeaders("<script>x()</script>");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.ok(headers["Content-Security-Policy"]?.includes("frame-ancestors 'none'"));
  assert.equal(headers["Cross-Origin-Resource-Policy"], "same-origin");
});
