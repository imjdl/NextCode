import {
  DesktopCommandIds,
  TID_WORKSPACE_HELP_MENU_RESOURCE_MANAGER,
  TID_WORKSPACE_HELP_MENU_TRIGGER,
} from "@zcode/shared";
import { ActivityIcon, CircleHelpIcon, InfoIcon } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { cn } from "@/components/lib/utils.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

/**
 * 帮助菜单只保留本地能力：资源管理器与关于。
 * 定制版不提供官方渠道入口（产品文档/用户社群/问题上报/提需求/检查更新），见
 * specs/remove-official-channel-entries.md。
 */
export function WorkspaceHelpMenuButton({
  className,
  isDesktop = false,
}: {
  className?: string;
  /**
   * 是否桌面端。由挂载处注入而不是在组件内嗅探：Web 的 IPlatformService 桩同样实现了
   * executeDesktopCommand（no-op），拿它判定会让 Web 端出现一个点了没反应的「资源管理器」。
   */
  isDesktop?: boolean;
}) {
  const { intl } = useZCodeIntl();
  const platform = usePlatform();
  const helpMenuLabel = intl.formatMessage({ id: "workspaceHeader.help.menu" });
  const handleOpenResourceManager = () => {
    void platform.executeDesktopCommand(DesktopCommandIds.OpenResourceManager);
  };

  const handleShowAbout = () => {
    void platform.executeDesktopCommand(DesktopCommandIds.ShowAbout);
  };

  return (
    <DropdownMenu>
      <ControlHintTooltip title={helpMenuLabel} side="bottom">
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-md"
            // Settings 页会把帮助按钮绝对定位在 Electron 顶部拖拽区上方。
            // 只依赖外层容器 no-drag 时，真实 trigger 仍可能被标题栏 drag 区吞掉点击。
            className={cn(
              "text-foreground hover:bg-hover hover:text-foreground [app-region:no-drag]",
              className,
            )}
            aria-label={helpMenuLabel}
            data-testid={TID_WORKSPACE_HELP_MENU_TRIGGER}
          >
            <CircleHelpIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
      </ControlHintTooltip>
      <DropdownMenuContent
        align="end"
        className="min-w-0 w-max [&_[data-slot=dropdown-menu-item]]:pr-6"
      >
        {/* Windows/Linux 没有原生菜单栏，自绘标题栏箭头菜单也已下线，
            资源管理器只能从这里进；Web 端没有该窗口，不渲染。 */}
        {isDesktop ? (
          <>
            <DropdownMenuItem
              data-testid={TID_WORKSPACE_HELP_MENU_RESOURCE_MANAGER}
              onSelect={handleOpenResourceManager}
            >
              <ActivityIcon className="size-4" />
              {intl.formatMessage({ id: "titleBar.menu.help.resourceManager" })}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleShowAbout}>
              <InfoIcon className="size-4" />
              {intl.formatMessage({ id: "titleBar.menu.help.about" })}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
