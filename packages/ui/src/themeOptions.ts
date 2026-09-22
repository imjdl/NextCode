import type { Theme } from "./useTheme.js";

/** 图标种类名而非组件：registry 不依赖 React/lucide，便于单测直接引用。 */
export type ThemeOptionIcon = "system" | "dark" | "light" | "hacker";

export interface ThemeOption {
  id: Theme;
  labelId: string;
  icon: ThemeOptionIcon;
}

/**
 * 可选界面主题的唯一来源：设置页下拉框与侧栏头像菜单都从这里渲染。
 *
 * 3.17.0 之前是两份硬编码列表：设置页用 settingsPageConfig 的 THEME_MODES（漏了 hacker-dark），
 * 侧栏另手写 4 项，于是出现"侧栏能选黑客、设置页只有系统/深色/浅色"的漂移。
 * 新增主题只需在此登记 + 补一条 settings.themeOption.* 文案（两语言），
 * packages/ui/test/themeOptions.test.ts 会校验漏登记与漏文案。
 */
export const THEME_OPTIONS: readonly ThemeOption[] = [
  { id: "system", labelId: "settings.themeOption.system", icon: "system" },
  { id: "zai-dark", labelId: "settings.themeOption.zai-dark", icon: "dark" },
  { id: "zai-light", labelId: "settings.themeOption.zai-light", icon: "light" },
  { id: "hacker-dark", labelId: "settings.themeOption.hacker-dark", icon: "hacker" },
];

/**
 * 不再作为选项暴露的历史主题 id：仅保留读取兼容（normalizeThemePreference 会映射到 zai-*）。
 * 测试用它与 Theme 联合做差集，确保"新增主题后没在任何入口暴露"会被发现。
 */
export const LEGACY_THEME_IDS: readonly Theme[] = ["light", "dark"];
