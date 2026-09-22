import { NEXTCODE_MARK_PATHS, NEXTCODE_MARK_VIEW_BOX } from "@/assets/brand-mark-paths.js";
import { cn } from "@/components/lib/utils.js";

/**
 * NextCode 字母标记（欢迎页 / 引导页）。
 * 字形路径由 `scripts/generate-brand-assets.mjs` 生成，与徽标 SVG、应用图标同源同参数，
 * 避免"组件里画一份、SVG 里画一份"再次漂移（原 ZCodeAboutLogo 就是内联硬编码的）。
 */
export function NextCodeLogo({ className }: { className?: string }) {
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
      {NEXTCODE_MARK_PATHS.map((path) => (
        <path key={path} fill="currentColor" d={path} />
      ))}
    </svg>
  );
}
