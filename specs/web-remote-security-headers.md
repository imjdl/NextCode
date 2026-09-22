# Spec：Web 服务响应安全头（CSP 等）

## 目标与背景

局域网 Web 远控 / 独立 Web 服务的页面由 `createHttpServer` 以**明文 http** 提供，二维码 URL 里带
token。原实现只设置 `Cache-Control` 与 `Content-Type`，页面没有任何能力限制：

- 一旦渲染层出现可注入点（Markdown/HTML 预览、模型返回内容），注入的内容可以加载任意远程脚本；
- 页面可被任意站点 iframe 嵌入，覆盖真实 UI 做点击劫持；
- 带 token 的完整 URL 会随 Referer 发给外链（头像等）；
- 页面默认拥有摄像头/麦克风/定位等能力，实际一个都不用。

本次为 HTTP 响应补安全头，**不改任何功能与协议**。

## 状态所有者与边界

- 唯一所有者：`packages/server/src/httpSecurityHeaders.ts`（纯函数），由 `packages/server/src/http.ts`
  在响应阶段应用。
- 作用范围：仅 `createHttpServer` 提供的 http 页面（局域网远控、`entry-http` 独立服务）。
  **桌面渲染层不经此服务**（Electron 走 `loadFile`/自定义页面），因此桌面端行为不受影响。
- 不去动传输层加密：局域网内是 http，HSTS/Secure Cookie 无从谈起；本任务只做"能力收敛"。

## 行为规则

1. **所有响应**带基础头：`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`、
   `X-Frame-Options: DENY`、`Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`。
2. **HTML 响应**额外带 CSP：
   - `default-src 'self'`、`object-src 'none'`、`base-uri 'self'`、`form-action 'self'`、`frame-ancestors 'none'`。
   - `script-src 'self' <内联脚本 sha256>`：内联脚本逐个哈希放行，禁止远程脚本。
     **哈希必须按浏览器解析后的文本原样计算**（不 trim、不改空白，CRLF 折成 LF），
     否则哈希不匹配会让内联脚本被直接阻断。
   - `style-src 'self' 'unsafe-inline'`：Tailwind 与内联 style 属性无法逐个哈希。
   - `img-src 'self' data: blob: https:`：二维码/截图用 data:/blob:，账号头像用 https 外链。
   - `connect-src 'self' ws: wss:`：**不收敛到仅 `'self'`**——Safari 对 CSP3 的 `'self'` 是否覆盖
     `ws://` 实现不一致，而手机端（Safari）扫码后必须能建立同源 WebSocket；脚本注入已由
     `script-src` 阻断，兼容性收益大于风险。
   - `worker-src 'self' blob:`：Vite 可能把 worker 内联为 blob。
3. CSP **只加在 HTML 响应**上：静态资源不需要；API/预览响应加 CSP 会误伤内嵌内容。
4. 静态 HTML 的缓存策略由"仅 index.html 不缓存"改为"所有 .html 不缓存"（入口文档不应被长缓存）。

## 验收场景

1. `curl -D - "http://<host>:<port>/?token=..."` 能看到全部安全头与 CSP，且 `script-src` 中的
   哈希与**实际发送的** `index.html` 内联脚本一致。
2. 手机视口（390×844，移动 UA）加载页面：无 CSP 违规、无控制台错误、无请求失败，
   首屏主题类（如 `theme-zai-dark`）已应用（证明内联脚本执行成功）。
3. 内联脚本变化后（重新构建 web 产物）哈希自动跟随，不需要人工维护。
4. `packages/server/test/httpSecurityHeaders.test.ts` 覆盖：哈希不做 trim 的回归用例、
   CRLF 归一化、`src` 脚本与空脚本不参与哈希、CSP 关键指令存在且 `script-src` 不含
   `unsafe-inline`/通配。
5. `pnpm typecheck`、`pnpm lint`、`pnpm architecture:check --changed` 通过。

## 已知遗留

- 明文 http 下的 token 仍可能被同网段被动嗅探；如需防嗅探要走 TLS 或改为一次性配对码换
  cookie（未做，属后续增强）。
- 未加 `Permissions-Policy: display-capture=()`：桌面端浏览器视图依赖 `getDisplayMedia`，
  收敛该项需先确认 Web 远控场景是否也要用。
