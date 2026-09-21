import type { ZCodeBuiltinRelease } from "@zcode/provider-node";

interface FetchZCodeBuiltinRemoteReleaseOptions {
  readonly apiClient: unknown;
  readonly endpointOrigin: string;
  readonly appVersion: string;
  readonly platform: string;
  readonly signal?: AbortSignal;
}

/**
 * 定制版：不再从远端刷新内置 provider 配置。
 *
 * 上游流程是 GET /api/v1/client/configs 取 `builtin_provider_config_json` 的 CDN 地址再下载，
 * 即服务端可以改变本地模型目录 / provider 定义（含 base URL）。定制版要求本地行为不受远端控制，
 * 因此固定返回 null：synchronizer 把 null 视为 "missing"，继续使用随包内置的
 * resources/config/provider/zcode-builtin.json。
 */
export async function fetchZCodeBuiltinRemoteRelease(
  _options: FetchZCodeBuiltinRemoteReleaseOptions,
): Promise<ZCodeBuiltinRelease | null> {
  return null;
}
