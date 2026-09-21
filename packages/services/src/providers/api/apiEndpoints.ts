import { resolveZaiBusinessBaseUrl } from "@zcode/shared";

// 定制版：/api/v1/client/scenes 已不再请求（服务端可下发提示词模板，属远程控制面），
// 常量与 fetcher 一并移除，避免留下可被重新接回的端点。

export const ZAI_API_HOST = resolveZaiBusinessBaseUrl(process.env);
