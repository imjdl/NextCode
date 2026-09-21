import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  DesktopCommandIds,
  isWebRemoteState,
  type WebRemoteAddressInfo,
  type WebRemoteState,
} from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { Switch } from "@/components/ui/switch.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { logger } from "@/logger.js";

const DEFAULT_PORT = 3030;

function isAddressList(value: unknown): value is WebRemoteAddressInfo[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as WebRemoteAddressInfo).address === "string",
    )
  );
}

/**
 * Web 远控控制面板：开启/关闭本机 Web 服务、选择内网 IP、展示扫码二维码。
 *
 * 状态唯一所有者在 main（见 src/main/webRemoteControl.ts），这里只读状态与下发命令，
 * 面板内的 IP/端口是本地草稿，不落盘。
 */
export function WebRemoteControlDialog({
  open,
  onOpenChange,
  onStateChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 状态变化回传给入口按钮（footer 用它给手机图标上色）。 */
  onStateChange?: (state: WebRemoteState) => void;
}) {
  const platform = usePlatform();
  const { intl } = useZCodeIntl();
  const [addresses, setAddresses] = useState<WebRemoteAddressInfo[]>([]);
  const [state, setState] = useState<WebRemoteState | null>(null);
  const [host, setHost] = useState("0.0.0.0");
  const [port, setPort] = useState(String(DEFAULT_PORT));
  const [busy, setBusy] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [list, current] = await Promise.all([
          platform.executeDesktopCommand(DesktopCommandIds.WebRemoteListAddresses),
          platform.executeDesktopCommand(DesktopCommandIds.WebRemoteGetState),
        ]);
        if (cancelled) {
          return;
        }
        if (isAddressList(list)) {
          setAddresses(list);
          const preferred = list.find((item) => item.recommended) ?? list[0];
          if (preferred) {
            // 已在运行时不覆盖用户看到的监听地址，避免与真实状态不一致。
            setHost((current as WebRemoteState | null)?.running ? "" : preferred.address);
          }
        }
        if (isWebRemoteState(current)) {
          setState(current);
          onStateChange?.(current);
          if (current.running) {
            setHost(current.host);
            setPort(String(current.port));
          }
        }
      } catch (error) {
        logger.warn("[web-remote] 读取服务状态失败", { error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onStateChange, open, platform]);

  useEffect(() => {
    if (!state?.url) {
      setQrDataUrl("");
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(state.url, { width: 480, margin: 2, errorCorrectionLevel: "M" })
      .then((dataUrl) => {
        if (!cancelled) {
          setQrDataUrl(dataUrl);
        }
      })
      .catch((error: unknown) => logger.warn("[web-remote] 生成二维码失败", { error }));
    return () => {
      cancelled = true;
    };
  }, [state?.url]);

  const handleToggle = useCallback(
    async (next: boolean) => {
      setBusy(true);
      try {
        const nextState = await platform.executeDesktopCommand(
          next ? DesktopCommandIds.WebRemoteStart : DesktopCommandIds.WebRemoteStop,
          next ? { host: host || "0.0.0.0", port: Number(port) || DEFAULT_PORT } : undefined,
        );
        if (isWebRemoteState(nextState)) {
          setState(nextState);
          onStateChange?.(nextState);
        }
      } catch (error) {
        logger.warn("[web-remote] 切换服务状态失败", { error });
        setState((current) =>
          current
            ? { ...current, running: false, url: "", token: "", lastError: String(error) }
            : current,
        );
      } finally {
        setBusy(false);
      }
    },
    [host, onStateChange, platform, port],
  );

  const running = state?.running === true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{intl.formatMessage({ id: "webRemote.title" })}</DialogTitle>
          <DialogDescription>
            {intl.formatMessage({ id: "webRemote.description" })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-ui-base font-medium text-foreground">
              {intl.formatMessage({ id: "webRemote.enable" })}
            </span>
            <Switch
              checked={running}
              disabled={busy}
              aria-label={intl.formatMessage({ id: "webRemote.enable" })}
              onCheckedChange={(checked: boolean) => {
                void handleToggle(checked);
              }}
            />
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="web-remote-host">
                {intl.formatMessage({ id: "webRemote.address" })}
              </Label>
              <Select value={host} onValueChange={setHost} disabled={running || busy}>
                <SelectTrigger id="web-remote-host">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {addresses.map((item) => (
                    <SelectItem key={`${item.address}:${item.interfaceName}`} value={item.address}>
                      {item.address === "0.0.0.0"
                        ? intl.formatMessage({ id: "webRemote.addressAll" })
                        : `${item.address}${item.interfaceName ? ` (${item.interfaceName})` : ""}${
                            item.virtual
                              ? ` · ${intl.formatMessage({ id: "webRemote.addressVirtual" })}`
                              : ""
                          }`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="web-remote-port">
                {intl.formatMessage({ id: "webRemote.port" })}
              </Label>
              <Input
                id="web-remote-port"
                className="w-24"
                inputMode="numeric"
                value={port}
                disabled={running || busy}
                onChange={(event) => setPort(event.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>
          </div>

          {running && state?.url ? (
            <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
              <div className="flex justify-center">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={intl.formatMessage({ id: "webRemote.qrAlt" })}
                    className="size-44 rounded-lg bg-white p-1"
                  />
                ) : (
                  <span className="py-16 text-ui-sm text-foreground-subtle">
                    {intl.formatMessage({ id: "webRemote.qrLoading" })}
                  </span>
                )}
              </div>
              <div className="break-all text-ui-sm text-foreground-subtle">{state.url}</div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  void navigator.clipboard?.writeText(state.url);
                }}
              >
                {intl.formatMessage({ id: "webRemote.copyLink" })}
              </Button>
              <p className="text-ui-xs leading-relaxed text-foreground-subtle">
                {intl.formatMessage({ id: "webRemote.securityNotice" })}
              </p>
            </div>
          ) : null}

          {state?.lastError ? (
            <p className="text-ui-sm text-destructive">{state.lastError}</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
