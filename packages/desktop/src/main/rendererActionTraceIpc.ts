import { BrowserWindow, ipcMain } from "electron";
import { PlatformChannels, type RendererActionTraceConfigV1 } from "@zcode/shared";
import type { RendererActionTraceBroker } from "./rendererActionTraceBroker.js";

const RENDERER_ACTION_TRACE_REFRESH_INTERVAL_MS = 60_000;

/**
 * 行为追踪开关的取值来源。定制版不接远端灰度（原来的 SingleFeatureRollout 机制已移除），
 * 因此这里只保留一个最小形状，缺省即恒关闭。
 */
export interface RendererActionTraceRollout {
  getSnapshot(): RendererActionTraceConfigV1;
  refresh(): Promise<RendererActionTraceConfigV1>;
}

export function registerRendererActionTraceIpc(options: {
  /** 远端灰度旗标；定制版不传，恒关闭（仍注册 IPC 让渲染层调用有响应，但不采集不导出）。 */
  rollout?: RendererActionTraceRollout;
  broker: RendererActionTraceBroker;
  env?: Record<string, string | undefined>;
  logger: {
    debug(...args: unknown[]): void;
    warn(...args: unknown[]): void;
  };
}): () => void {
  type RendererInstanceBinding = {
    current?: string;
    stale: Set<string>;
    dispose: () => void;
  };
  const rendererInstances = new Map<number, RendererInstanceBinding>();
  const bindRendererLifecycle = (sender: Electron.WebContents, senderId: number) => {
    let awaitingNewInstance = false;
    const binding: RendererInstanceBinding = {
      stale: new Set(),
      dispose: () => {
        sender.removeListener("did-start-loading", reset);
        sender.removeListener("did-navigate", completeNavigation);
        sender.removeListener("render-process-gone", reset);
        sender.removeListener("destroyed", destroy);
      },
    };
    const reset = () => {
      if (binding.current) {
        binding.stale.add(binding.current);
        binding.current = undefined;
      }
      awaitingNewInstance = true;
    };
    const completeNavigation = () => {
      // did-start-loading 与 did-navigate 可能属于同一次加载，避免二次退休新实例。
      if (awaitingNewInstance) {
        awaitingNewInstance = false;
        return;
      }
      reset();
    };
    const destroy = () => {
      binding.dispose();
      rendererInstances.delete(senderId);
    };
    sender.on("did-start-loading", reset);
    sender.on("did-navigate", completeNavigation);
    sender.on("render-process-gone", reset);
    sender.once("destroyed", destroy);
    rendererInstances.set(senderId, binding);
    return binding;
  };
  const disabledRolloutConfig: RendererActionTraceConfigV1 = { enabled: false };
  const readRolloutConfig = (): RendererActionTraceConfigV1 =>
    options.rollout?.getSnapshot() ?? disabledRolloutConfig;
  let lastConfig = resolveRuntimeConfig(readRolloutConfig(), options.env ?? process.env);

  const refresh = async (): Promise<RendererActionTraceConfigV1> => {
    const rolloutConfig = options.rollout ? await options.rollout.refresh() : disabledRolloutConfig;
    const next = resolveRuntimeConfig(rolloutConfig, options.env ?? process.env);
    if (JSON.stringify(next) !== JSON.stringify(lastConfig)) {
      lastConfig = next;
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send(PlatformChannels.RendererActionTraceConfigChanged, next);
        }
      }
    }
    return next;
  };

  ipcMain.handle(PlatformChannels.GetRendererActionTraceConfig, refresh);
  ipcMain.on(PlatformChannels.ReportRendererActionTraceBatch, (event, batch: unknown) => {
    if (typeof batch !== "object" || batch === null) return;
    const rendererInstanceId = (batch as { rendererInstanceId?: unknown }).rendererInstanceId;
    if (typeof rendererInstanceId !== "string" || rendererInstanceId.length === 0) return;
    const senderId = event.sender.id;
    const binding =
      rendererInstances.get(senderId) ?? bindRendererLifecycle(event.sender, senderId);
    if (binding.stale.has(rendererInstanceId)) {
      options.logger.warn("[renderer-action-trace] stale renderer instance for sender", {
        senderId,
      });
      return;
    }
    if (binding.current && binding.current !== rendererInstanceId) {
      options.logger.warn("[renderer-action-trace] renderer instance changed for sender", {
        senderId,
      });
      return;
    }
    binding.current ??= rendererInstanceId;
    options.broker.enqueue(batch);
  });

  const refreshTimer = setInterval(() => {
    void refresh().catch((error) => {
      options.logger.debug("[renderer-action-trace] refresh failed", { error });
    });
  }, RENDERER_ACTION_TRACE_REFRESH_INTERVAL_MS);
  refreshTimer.unref();

  return () => {
    clearInterval(refreshTimer);
    ipcMain.removeHandler(PlatformChannels.GetRendererActionTraceConfig);
    ipcMain.removeAllListeners(PlatformChannels.ReportRendererActionTraceBatch);
    for (const binding of rendererInstances.values()) binding.dispose();
    rendererInstances.clear();
  };
}

function resolveRuntimeConfig(
  config: RendererActionTraceConfigV1,
  env: Record<string, string | undefined>,
): RendererActionTraceConfigV1 {
  if (isTruthy(env.ZCODE_LOCAL_TTFT_ENABLED)) config = { ...config, localTtftEnabled: true };
  if (!isTruthy(env.ZCODE_RENDERER_ACTION_TRACE_ENABLED)) return config;
  return {
    ...config,
    enabled: true,
    sampleRatio: 1,
    enabledGroups: ["core", "settings"],
    configVersion: "local-explicit",
  } as RendererActionTraceConfigV1;
}

function isTruthy(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}
