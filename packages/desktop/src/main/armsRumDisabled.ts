/**
 * 定制版 ARMS 上报的空实现。
 *
 * 上游使用 @arms/rum-electron（阿里云 RUM）。定制版要求"任何情况下都不外发遥测"，
 * 因此这里提供同签名空实现替换 SDK：
 * - 不 init、不建连、不发送任何事件；
 * - 保留 setConfig/getConfig/client 形状，避免调用方需要改结构；
 * - 与 `ZCODE_ARMS_RUM_ENDPOINT`（已固定为空）形成双重保证。
 *
 * 依赖方向说明：模块只导出纯对象，不做 IO，便于在各 telemetry 模块中原位替换 SDK import。
 */
const disabledArmsRum = {
  init: () => Promise.resolve(),
  sendCustom: () => {},
  sendEvent: () => {},
  setConfig: () => {},
  getConfig: () => ({ env: "local" as const }),
  client: {
    useReporter: () => {},
  },
} as const;

export default disabledArmsRum;
