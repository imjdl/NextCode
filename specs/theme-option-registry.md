# Spec：界面主题选项的唯一来源（registry）

## 背景与问题

「设置 → 外观」的界面主题下拉框只显示 **系统 / 深色 / 浅色**，看不到 Zai 主题与「黑客」主题；
而侧栏头像菜单里有 **系统默认 / 深色主题 / 浅色主题 / 黑客**。同一个偏好存在两条入口却各写一份列表：

| 入口 | 列表来源 | 标签键 |
| --- | --- | --- |
| 设置 → 外观 | `settingsPageConfig.ts` 的 `THEME_MODES`（system、zai-dark、zai-light） | `settings.themeMode.*` |
| 侧栏头像菜单 | `WorkspaceSidebarFooter.tsx` 内手写的 4 个 `DropdownMenuRadioItem` | `sidebar.settings.theme.*` |

两个具体缺陷：

1. `THEME_MODES` **漏了 `hacker-dark`** —— 3.17.0 加主题时只补了侧栏菜单与类型枚举，"设置页也能选到"这条验收没真正跑过就被当成做到了。
2. `settings.themeMode.zai-dark` / `.zai-light` 的文案就是「深色」/「浅色」，与旧的无前缀主题同名，
   所以在设置页看起来"只有系统/深色/浅色"，Zai 主题是否存在无法从标签判断。

## 规则

1. **唯一定义处**：`packages/ui/src/themeOptions.ts` 的 `THEME_OPTIONS`（id + 标签键 + 图标种类）。
   设置页下拉与侧栏菜单都从它渲染，任何一处不得再自行列举主题。
2. **标签值必须可区分**：Zai 主题写「Zai 深色」/「Zai 浅色」，黑客写「黑客」，
   否则用户无法从下拉项判断当前主题集合（这正是本次"看不到其他主题"的直接原因）。
3. **不再暴露的历史主题**：`light` / `dark` 仅保留读取兼容（`normalizeThemePreference` 会映射到
   `zai-light` / `zai-dark`），不作为可选项，登记在 `LEGACY_THEME_IDS`。
4. **数据与视图分离**：registry 只存图标**种类名**（`system|dark|light|hacker`），
   由各入口映射到具体图标组件；registry 不 import React/lucide，便于单测直接引用。
5. **新增主题的完整动作**（顺序固定）：`styles.css` 加 palette → `useTheme.ts` 注册 id 与亮暗归属
   → `THEME_OPTIONS` 登记 → 两个语言各补一条标签。缺任一步会被下面的测试挡住。
6. **标签键族统一**为 `settings.themeOption.*`；旧的 `settings.themeMode.*`（仅选项标签）与
   `sidebar.settings.theme.*` 随之废弃并删除（`settings.themeMode` 作为"界面主题"行标题仍然保留）。

## 状态所有者

- 可选主题集合：`themeOptions.ts`（唯一）。
- 主题 id 与亮暗归属：`useTheme.ts`（不变）。
- 主题值：`zcode-theme`（localStorage）+ Zustand broadcast（不变）。

## 验收场景

1. 「设置 → 外观 → 界面主题」与「侧栏头像菜单 → 界面主题」都列出 **系统 / Zai 深色 / Zai 浅色 / 黑客**，
   且选中项在两个入口一致。
2. 选「黑客」后立即生效（`<html>` = `dark theme-hacker-dark`），侧栏与设置页都显示为已选中；刷新后保持。
3. `packages/ui/test/themeOptions.test.ts` 通过，覆盖：
   - `THEME_OPTIONS` 的 id 无重复、且都属于 `Theme` 联合；
   - 每条 `labelId` 在 zh-CN 与 en-US 中都存在（防"加了主题忘了文案"）；
   - `Theme` 联合中的每个成员要么在 `THEME_OPTIONS`、要么在 `LEGACY_THEME_IDS` 中
     （防"加了主题但没在任何入口暴露"——本次漏项的根因）；
   - `THEME_OPTIONS` 中不含历史主题 id。
4. `pnpm typecheck`、`pnpm lint`、`pnpm i18n:dead-keys`（旧标签族已清理、无新增死键）通过。

## 非目标

- 不改主题配色、不新增主题（本任务只修"选项没暴露/标签分不清"）。
- 不动「代码设置」下的代码预览主题（`CODE_PREVIEW_THEME_OPTIONS`，独立体系）。
