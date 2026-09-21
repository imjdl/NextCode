# Spec：定制版去远程控制 与 数据外发收口

## 目标

定制版安装包**不受服务端远程控制**，且**除功能必需调用外不外发数据**。两条硬要求：

1. 服务端不得能开关本地行为、不得能推送行为内容（提示词）、不得能强制升级。
2. 遥测类外发（ARMS/数仓/OTLP）在编译期硬关断：即使设置了运行时环境变量也无法开启。

## A. 硬关断：远程控制面

| 通道 | 处置 | 证据/说明 |
| --- | --- | --- |
| `/api/v1/client/configs` → `desktopContextPrompt` 旗标 | **移除**：不再创建 rollout、不再请求 | 服务端原本可启用"桌面上下文提示词"，并把开关经 env 传给 Host |
| `/api/v1/client/configs` → `rendererActionTrace` 旗标 | **移除** | 服务端原本可按分组启用渲染层行为追踪导出 |
| 首个 Host 前的"灰度裁决等待" | **移除** | 只服务于上述旗标，去掉后 Host 启动不再等网络 |
| `/api/v1/client/configs` → `offPeak.enable_offpeak_task` | **改为本地判定** | 闲时任务可用性不再由服务端开关决定（有可用模型即可用；能否排队仍由票据接口决定） |
| `/api/v1/client/configs` → `dynamicWorkflow` | **改为本地判定** | 动态工作流开关只认本地 env/默认值 |
| `/api/v1/client/configs` → forceUpdate 配置 | **返回 null** | 不再读取远端强制升级要求 |
| `/api/v1/client/configs` → `builtin_provider_config_json`（provider-node 下载） | **不再刷新** | 服务端原本可改写本地模型目录/provider 定义（含 base URL）；改为始终使用随包 `resources/config/provider/zcode-builtin.json` |
| `/api/v1/client/scenes` 远程提示词模板 | **移除网络请求**，返回空目录 | 服务端原本可下发自动化模板与建议提示词正文；消费方失败时已保留手动创建入口 |
| `/api/v1/releases/electron/manifest` 更新清单 | **代码路径移除** | `autoUpdater` 增加编译期硬门禁 `customBuildUpdatesDisabled`，永不配置 feed、永不检查更新 |
| 强制升级配置（`maybeBlockStartupForForceUpdate`） | **调用与 import 移除** | 启动不再可能被服务端 minimalVersion 阻塞；`forceUpdateGuard`/`forceUpdatePrompt` 已无外部引用 |
| `/api/v1/client/configs` → 抓取器本体 | **删除** | 桌面端两个 rollout 模块与 `singleFeatureRollout` 机制整体删除 |

保留（功能必需，非"控制"）：OAuth 登录、provider registry（模型目录，本地内置为准）、权益/额度/计费、闲时任务票据、MCP 用量。这些是"用官方服务所需的请求"，会携带账户/设备标识（`X-Device-Mid`）与功能参数，但不改变本地行为开关。

## B. 硬关断：数据外发（遥测）

- `packages/shared/src/env.ts`：
  - `ZCODE_TELEMETRY_ENABLED` 固定 `false`，**不再读环境变量**；
  - `ZCODE_TELEMETRY_REPORT_ENDPOINT`、`ZCODE_ARMS_RUM_ENDPOINT` 固定 `""`，**不再读环境变量**。
  效果：即使外部设置了 `ZCODE_ARMS_RUM_ENDPOINT` / `ZCODE_TELEMETRY_REPORT_ENDPOINT` / `OTEL_EXPORTER_OTLP_*`，也无法开启上报（OTLP 导出器读到的端点为空即不创建）。
- 移除 ARMS RUM 初始化（`appARMSBootstrap.startArmsRum` 调用点）：主进程不再 `armsRum.init()`，SDK 的浏览器侧自动注入（`autoInject`）也随之消失。
- 新增 `packages/desktop/src/main/armsRumDisabled.ts` 空实现，7 个遥测模块（stability/resource/network/MCP/数据体积/DB 启动/ARMS bootstrap）的 `@arms/rum-electron` import 全部重定向到它 —— 编译期彻底切断 SDK 依赖，`sendCustom`/`setConfig`/`init` 均无副作用。
- 移除 ARMS 身份同步（`createArmsUserIdentitySync`）。
- 遥测上报器（网络/资源/MCP/每日活跃）以 `ZCODE_TELEMETRY_ENABLED` 为门禁：常量恒 false，定时器不再注册。
- 崩溃上报保持仅本地（`uploadToServer: false`，既有行为）。

## C. 不改动（并记录）

- 模型推理：提示词与 Agent 读取到的文件内容仍会发送到所选模型提供方；内置 Coding Plan 走官方代理（`zcode.z.ai/api/v1/zcode-plan`）。要"代码不出本机"需改用自定义 provider 指向本地推理。
- 用户主动触发：会话分享、反馈提交、插件安装。
- device_mid：功能与计费请求头，保留。

## 验收场景

1. 设置 `ZCODE_ARMS_RUM_ENDPOINT`/`ZCODE_TELEMETRY_REPORT_ENDPOINT`/`OTEL_EXPORTER_OTLP_ENDPOINT` 后启动定制包：产物中不存在这些端点的读取路径（编译期常量），无任何遥测请求。
2. 抓包（或读日志）确认启动与日常使用不出现 `/api/v1/client/configs`、`/api/v1/client/scenes`、`/api/v1/releases/electron/manifest` 请求。
3. 服务端无法通过任何响应改变本地开关：代码中已无消费远程旗标的路径（off-peak / 动态工作流 / desktopContextPrompt / rendererActionTrace / forceUpdate 均已本地化或移除）。
4. 产物主进程 bundle（`out/main/*.js`）中不含 `@arms/rum-electron`、`client/configs`、`releases/electron/manifest`；随包 `node_modules` 里 SDK 文件不再被任何代码引用（可选：后续从 desktop 依赖中移除，需同步更新 lockfile 与 patch 条目）。
5. 应用功能可用：登录、模型选择、对话、闲时任务（有模型即可用）、自动化（手动创建）正常。
