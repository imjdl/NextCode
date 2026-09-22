import { NEXTCODE_MARK_PATHS, NEXTCODE_MARK_VIEW_BOX } from "@/assets/brand-mark-paths.js";
import type { ReactNode } from "react";
import { cn } from "@/components/lib/utils.js";

interface RootStartupLoadingProps {
  label: string;
  children?: ReactNode;
  busy?: boolean;
}

export function RootStartupLoading({ label, children, busy = true }: RootStartupLoadingProps) {
  return (
    <div
      // Web 端全局 html/body/#root 为 Electron 透明背景让路，React 接管后会替换 HTML 启动壳。
      // 这里必须由阻塞态自身承接主题背景，否则远控链接会在 Root 恢复期间继续露出浏览器白底。
      className="flex h-full min-h-dvh flex-col items-center justify-center gap-6 bg-background text-foreground"
      role="status"
      aria-busy={busy}
      aria-label={label}
      data-testid="root-startup-loading"
    >
      <NextCodeStartupLogoBadge />
      {children}
    </div>
  );
}

/** 初始化与引导共用品牌图标，保持底色、描边、圆角和标志比例一致。 */
export function NextCodeStartupLogoBadge({ animated = true }: { animated?: boolean }) {
  return (
    <div className="relative flex size-24 items-center justify-center rounded-3xl bg-[linear-gradient(180deg,#000000_0%,#151718_100%)] text-[#ffffff] shadow-xl/20 before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:border before:border-[rgba(255,255,255,0.1)] before:content-['']">
      <NextCodeStartupLogo className="h-auto w-14" animated={animated} />
    </div>
  );
}

function NextCodeStartupLogo({
  className,
  animated = true,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="118"
      height="100"
      fill="none"
      viewBox={NEXTCODE_MARK_VIEW_BOX}
      className={cn("shrink-0 text-current", className)}
      aria-hidden="true"
      focusable="false"
    >
      {/* 呼吸动画作用在整枚标记上（保持原行为），不要下沉到单条路径。 */}
      {animated ? (
        <animate
          attributeName="opacity"
          begin="3s"
          dur="1.8s"
          repeatCount="indefinite"
          values="1;0.4;1"
        />
      ) : null}
      {NEXTCODE_MARK_PATHS.map((d) => (
        <path key={d} fill="currentColor" d={d} />
      ))}
    </svg>
  );
}
