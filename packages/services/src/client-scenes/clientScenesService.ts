import type { ClientScenesResponse, IClientScenesService } from "./clientScenes.js";

/**
 * 定制版：不再请求 /api/v1/client/scenes。
 *
 * 上游该接口由服务端下发自动化模板与建议提示词的正文（含 prompt 模板），属于"服务端可改写
 * 本地呈现/输入内容"的远程控制面；定制版要求本地行为不受远端控制，因此固定返回空目录。
 * 消费方（useAutomationTemplates / 建议提示词容器）在空目录时已有既有降级：保留手动创建入口，
 * 不显示远程模板，无需新增兜底分支。
 */
export function createClientScenesService(): IClientScenesService {
  return {
    list: async (): Promise<ClientScenesResponse> => ({ code: 0, msg: "", data: [] }),
  };
}
