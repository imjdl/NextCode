const OPENCODE_ROOT_DOMAIN = "opencode.ai";
// anthropic-messages 类型的执行层会把缺 /v1 的 baseURL 归一化补上 /v1（model-execution.ts
// normalizeAnthropicBaseURL），但会话头判定读到的是用户原始配置（runner-status.ts
// resolved.baseURL = config.api.baseUrl）。Go 端点（/zen/go/v1/messages）在请求缺
// x-opencode-session 头时返回 400 MissingSessionID，表层被失败分类器翻成
// 「Provider rejected the model request」。因此判定必须与归一化结果对齐：
// /zen/go 与 /zen/go/v1 都视为 Go 端点，避免用户少写 /v1 时会话头被静默丢掉。
const OPENCODE_GO_PATHS = new Set(["/zen/go", "/zen/go/v1"]);

export function isOpenCodeGoBaseUrl(baseURL: string | undefined): boolean {
  const trimmed = baseURL?.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.toLowerCase();
    const path = url.pathname.replace(/\/+$/u, "").toLowerCase();
    return (
      (hostname === OPENCODE_ROOT_DOMAIN || hostname.endsWith(`.${OPENCODE_ROOT_DOMAIN}`)) &&
      OPENCODE_GO_PATHS.has(path)
    );
  } catch {
    return false;
  }
}
