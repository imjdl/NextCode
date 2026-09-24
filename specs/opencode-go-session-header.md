# OpenCode Go 会话头（x-opencode-session）

## 目标

用户把第三方供应商指向 OpenCode Go 订阅端点（`https://opencode.ai/zen/go/...`）时，
应用必须自动附加 Go 网关要求的 `x-opencode-session` 头；缺头时 Go 返回
400 MissingSessionID，被失败分类器呈现为「Provider rejected the model request」，
用户无法从该提示推断出真实原因。

## 规则

- 判定入口：`apps/zcode-cli/packages/adapters/src/model/opencode-session.ts`
  `isOpenCodeGoBaseUrl(baseURL)`，命中时 `runner-attribution.ts` 把内部会话 ID
  （剥离 `sess_` 等内部前缀）写入 `x-opencode-session`。
- 判定条件：hostname 为 `opencode.ai` 或其子域，且路径（去尾斜杠、小写化）等于
  `/zen/go` 或 `/zen/go/v1`。
- **必须同时接受 `/zen/go`**：anthropic-messages 类型在模型执行层
  （`normalizeAnthropicBaseURL`）会把缺 `/v1` 的 baseURL 补成 `/v1`，但会话头判定
  读到的是用户原始配置（`resolved.baseURL = config.api.baseUrl`）。两者不对齐时，
  用户少写 `/v1` 的请求 URL 仍然正确、会话头却被静默丢弃，Go 以 400 拒绝。
- 判定 fail closed：空值、非法 URL、非 opencode.ai 域名一律不带头。

## 状态所有者

- 判定函数为纯函数，无状态；会话头值由 runner attribution 在每次模型请求时生成，
  不持久化。

## 验收场景

1. baseURL 填 `https://opencode.ai/zen/go/v1`（anthropic-messages 或
   openai-chat-completions）→ 请求带 `x-opencode-session`，Go 正常应答。
2. baseURL 填 `https://opencode.ai/zen/go`（anthropic-messages，回归用例：
   2026-09-24 用户实测 400 MissingSessionID）→ 请求同样带会话头。
3. baseURL 为其它端点（如 `https://opencode.ai/inference/anthropic` 按量余额端点）
   → 不带会话头，行为不变。
4. 单测：`apps/zcode-cli/packages/adapters/test/opencodeGoSessionHeader.test.ts`。

## 用户侧配置事实（2026-09-24 实测）

- OpenCode Go 为订阅制，仅含开源模型；Claude 不在套餐内（403 Model access is disabled），
  按量余额端点才可用 Claude（需充值 Extra Usage）。
- 端点分族：`/zen/go/v1/chat/completions`（openai 兼容，GLM/Kimi/DeepSeek/LongCat 等）、
  `/zen/go/v1/messages`（anthropic 兼容，Qwen/MiniMax）、`/zen/go/v1/responses`
  （OpenAI Responses，Grok/GPT Luna/Muse）。模型清单以 opencode.ai/docs/go 为准。
- 两种类型在该配置下 base URL 都应填带 `/v1` 的 `https://opencode.ai/zen/go/v1`。
