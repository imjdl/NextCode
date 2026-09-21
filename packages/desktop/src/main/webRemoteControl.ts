/**
 * 桌面端 Web 远控服务管理器（main 侧唯一所有者）。
 *
 * 职责：列本机可绑定地址、启动/停止 web-remote 子进程、维护服务状态与 token。
 * 子进程入口是桌面构建产物 out/web-remote/server.js（见 src/web-remote/server/index.ts），
 * 用 electron.utilityProcess.fork 启动：与 Host 同一套 Electron Node 运行时，asar 内路径可执行。
 */
import { utilityProcess, type UtilityProcess } from "electron";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { networkInterfaces } from "node:os";
import type { WebRemoteAddressInfo, WebRemoteStartRequest, WebRemoteState } from "@zcode/shared";

const DEFAULT_WEB_REMOTE_PORT = 3030;
const READY_LOG_PREFIX = "zcode-web-remote-ready";
const START_TIMEOUT_MS = 15_000;

/** 虚拟网卡名关键字：这些地址手机通常不可达，面板里标注出来并默认不选。 */
const VIRTUAL_ADAPTER_PATTERNS = [
  /vmware/i,
  /virtualbox/i,
  /hyper-v/i,
  /vethernet/i,
  /loopback/i,
  /tap-?windows/i,
  /wsl/i,
  /docker/i,
  /tailscale/i,
  /zerotier/i,
];

interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}

function isVirtualAdapter(name: string): boolean {
  return VIRTUAL_ADAPTER_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * 列出可用于对外提供服务的 IPv4 地址。始终包含 "0.0.0.0"（所有网卡）作为兜底选项。
 * recommended 用于面板默认值：第一张非虚拟网卡——多网卡机器上若默认选到 VMware/Hyper-V 地址，
 * 手机扫码后必然连不上，属于最容易被误判成"功能坏了"的坑。
 */
export function listWebRemoteAddresses(): WebRemoteAddressInfo[] {
  const entries: WebRemoteAddressInfo[] = [];
  for (const [name, infos] of Object.entries(networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family !== "IPv4" || info.internal) {
        continue;
      }
      // 169.254.x.x 是链路本地地址（网线未通/未拿到 DHCP），不能作为服务地址。
      if (info.address.startsWith("169.254.")) {
        continue;
      }
      entries.push({
        address: info.address,
        interfaceName: name,
        virtual: isVirtualAdapter(name),
        recommended: false,
      });
    }
  }
  const recommendedIndex = entries.findIndex((entry) => !entry.virtual);
  if (recommendedIndex >= 0) {
    const recommended = entries[recommendedIndex]!;
    entries[recommendedIndex] = { ...recommended, recommended: true };
  }
  return [
    ...entries,
    { address: "0.0.0.0", interfaceName: "", virtual: false, recommended: entries.length === 0 },
  ];
}

/** 选给二维码/链接用的展示地址：绑定 0.0.0.0 时用第一张非虚拟网卡。 */
function resolveDisplayAddress(host: string): string | null {
  if (host !== "0.0.0.0") {
    return host;
  }
  const candidate = listWebRemoteAddresses().find(
    (entry) => entry.address !== "0.0.0.0" && !entry.virtual,
  );
  return candidate?.address ?? null;
}

function isPortAvailable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    // 绑定 0.0.0.0 才能验证"所有网卡"是否可用；指定地址时按该地址探测。
    probe.listen({ host: host === "0.0.0.0" ? undefined : host, port });
  });
}

export interface WebRemoteControlOptions {
  logger: Logger;
  /** 打包态 static 目录（resources/web-remote-web）；开发态回退到仓库内 packages/web/dist。 */
  resolveStaticRoot: () => string | null;
  /** 子进程入口路径（out/web-remote/server.js）。 */
  resolveServerEntry: () => string;
}

export function createWebRemoteControl(options: WebRemoteControlOptions) {
  let child: UtilityProcess | null = null;
  let state: WebRemoteState = {
    running: false,
    host: "0.0.0.0",
    port: DEFAULT_WEB_REMOTE_PORT,
    token: "",
    url: "",
    lastError: "",
  };

  function setState(next: Partial<WebRemoteState>): WebRemoteState {
    state = { ...state, ...next };
    return state;
  }

  function buildUrl(host: string, port: number, token: string): string {
    const displayAddress = resolveDisplayAddress(host);
    if (!displayAddress) {
      return "";
    }
    return `http://${displayAddress}:${port}/?token=${encodeURIComponent(token)}`;
  }

  function disposeChild(): void {
    if (!child) {
      return;
    }
    const target = child;
    child = null;
    target.removeAllListeners();
    try {
      target.kill();
    } catch (error) {
      options.logger.warn("[web-remote] 结束服务进程失败", { error });
    }
  }

  async function start(request: WebRemoteStartRequest): Promise<WebRemoteState> {
    if (child) {
      disposeChild();
    }
    const host = request.host.trim() || "0.0.0.0";
    const port =
      Number.isInteger(request.port) && request.port > 0 && request.port < 65536
        ? request.port
        : DEFAULT_WEB_REMOTE_PORT;

    const staticRoot = options.resolveStaticRoot();
    if (!staticRoot) {
      return setState({
        running: false,
        host,
        port,
        token: "",
        url: "",
        lastError: "Web 资源未就绪：先构建 Web 产物（pnpm --filter @zcode/web build）",
      });
    }

    if (!(await isPortAvailable(host, port))) {
      return setState({
        running: false,
        host,
        port,
        token: "",
        url: "",
        lastError: `端口 ${port} 已被占用，请换一个端口`,
      });
    }

    const token = randomBytes(24).toString("base64url");
    const entry = options.resolveServerEntry();
    // 用 utilityProcess（不是 child_process.fork）：后者会用 Electron 二进制再起一个 app 实例，
    // 而 utilityProcess 以 Electron 的 Node 运行时执行 ESM 入口，asar 内路径与依赖解析都与 Host 一致。
    const serverProcess = utilityProcess.fork(entry, [], {
      serviceName: "zcode-web-remote",
      stdio: "pipe",
      env: {
        ...process.env,
        ZCODE_WEB_REMOTE_HOST: host,
        ZCODE_WEB_REMOTE_PORT: String(port),
        ZCODE_WEB_REMOTE_TOKEN: token,
        ZCODE_WEB_REMOTE_STATIC_ROOT: staticRoot,
      },
    });
    child = serverProcess;

    const ready = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const timer = setTimeout(
        () => resolve({ ok: false, error: "启动超时：服务未在 15 秒内就绪" }),
        START_TIMEOUT_MS,
      );
      serverProcess.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        if (text.includes(READY_LOG_PREFIX)) {
          clearTimeout(timer);
          resolve({ ok: true });
        }
      });
      serverProcess.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8").trim();
        options.logger.warn("[web-remote] 服务进程输出", { text });
        clearTimeout(timer);
        resolve({ ok: false, error: text });
      });
      serverProcess.once("exit", (code) => {
        clearTimeout(timer);
        resolve({ ok: false, error: `服务进程退出（code=${code ?? "null"}）` });
      });
    });

    if (!ready.ok) {
      disposeChild();
      return setState({
        running: false,
        host,
        port,
        token: "",
        url: "",
        lastError: ready.error ?? "启动失败",
      });
    }

    serverProcess.once("exit", (code) => {
      if (child !== serverProcess) {
        return;
      }
      child = null;
      options.logger.info("[web-remote] 服务进程已退出", { code });
      setState({ running: false, token: "", url: "", lastError: `服务已退出（code=${code ?? "null"}）` });
    });

    options.logger.info("[web-remote] 服务已启动", { host, port });
    return setState({ running: true, host, port, token, url: buildUrl(host, port, token), lastError: "" });
  }

  function stop(): WebRemoteState {
    disposeChild();
    options.logger.info("[web-remote] 服务已停止");
    return setState({ running: false, token: "", url: "", lastError: "" });
  }

  return {
    listAddresses: listWebRemoteAddresses,
    start,
    stop,
    getState: (): WebRemoteState => state,
    dispose: disposeChild,
  };
}

export { DEFAULT_WEB_REMOTE_PORT };
export type WebRemoteControl = ReturnType<typeof createWebRemoteControl>;
