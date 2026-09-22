/**
 * 桌面端内置 Web 远控服务入口。
 *
 * 由 main 以 electron.utilityProcess.fork 启动，环境变量注入监听地址/端口/token/静态根：
 * - ZCODE_WEB_REMOTE_HOST / PORT / TOKEN
 * - ZCODE_WEB_REMOTE_STATIC_ROOT（Web 产物目录）
 *
 * 与 packages/server/src/entry-http.ts 同构：同一个 createHttpServer + createLocalServices。
 * 独立进程保证：服务崩溃或退出不影响 main 与 Host；关闭面板不停止服务，只有显式 stop 才终止。
 */
import { createLocalServices, getAppConfigDir } from "@zcode/services/node";
import { join } from "node:path";
import { createHttpServer } from "@zcode/server";

const READY_MESSAGE = "zcode-web-remote-ready";

function readPort(): number {
  const raw = Number(process.env["ZCODE_WEB_REMOTE_PORT"]);
  return Number.isInteger(raw) && raw > 0 && raw < 65536 ? raw : 3030;
}

async function main(): Promise<void> {
  const host = process.env["ZCODE_WEB_REMOTE_HOST"]?.trim() || "0.0.0.0";
  const port = readPort();
  const authToken = process.env["ZCODE_WEB_REMOTE_TOKEN"]?.trim();
  const staticRoot = process.env["ZCODE_WEB_REMOTE_STATIC_ROOT"]?.trim();
  if (!authToken) {
    throw new Error("ZCODE_WEB_REMOTE_TOKEN is required");
  }
  if (!staticRoot) {
    throw new Error("ZCODE_WEB_REMOTE_STATIC_ROOT is required");
  }

  const services = createLocalServices({
    // 与 entry-http 一致：内置 provider 配置落在应用配置目录，缺少时由服务自行物化。
    zcodeBuiltinProviderConfigFilePath: join(getAppConfigDir(), "provider", "zcode-builtin.json"),
    // 不启用 provider 预置目标，避免这条链路改写本机 provider 配置。
    providerProvisioningTargetEnabled: false,
    // Web 服务进程与桌面窗口 Host 是两个进程：把桌面端写入共享 tasks-index.sqlite 的变更
    // 翻译成本进程广播，手机/Web 侧栏才能看到桌面端的任务变化（specs/web-mobile-cross-process-sync.md）。
    crossProcessTaskIndexRefresh: true,
    // 桌面端继续生成的会话内容同样只落在共享会话库：检测到外部写入后触发
    // v4/conversation/refresh，让 CLI 重读持久化并把新快照推给已订阅的手机/Web 客户端。
    crossProcessConversationRefresh: true,
  });

  createHttpServer(services, port, {
    host,
    staticRoot,
    spaFallback: true,
    authToken,
    authRequired: true,
  });

  // 给 main 一个明确的 ready 信号：只有真正连上端口后才上报，避免"进程活着但服务没起来"。
  process.stdout.write(`${READY_MESSAGE} host=${host} port=${port}\n`);
}

void main().catch((error: unknown) => {
  // 失败原因要能被 main 读到（端口占用等），因此写 stderr 后以非零码退出。
  process.stderr.write(
    `[zcode-web-remote] startup failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
