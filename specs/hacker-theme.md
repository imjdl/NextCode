# Spec：新增「黑客」主题（hacker-dark）

## 目标

在现有 4 个实体主题（`:root`、`.dark`、`.theme-zai-light`、`.theme-zai-dark`）之外，新增一个黑底绿字的终端风主题，用户可在侧栏主题菜单与设置页选择。

## 主题体系约束（实现依据）

- 主题 = **完整 token 覆盖**：每个主题块声明同一套 140 个 `--color-*`（实测 `.dark` 与 `.theme-zai-dark` token 集完全相同），`@theme` 已注册这些变量，故**只改值、不改 Tailwind 配置**。
- 主题靠 `<html>` 上的类名切换；`applyTheme()` 必须同时切 `dark`（供 `dark:` 变体）与 `theme-<id>` 类。
- 所有亮/暗判断收敛为二元 `resolveTheme()`：新主题需声明归属。黑客主题归属 **dark**，从而自动继承原生标题栏、`color-scheme`、代码高亮、mermaid/office 预览等亮暗分叉行为。
- 主题值是 localStorage `zcode-theme`，并作为 Zustand broadcast 字段同步多窗口。

## 行为规则

1. **主题 id**：`hacker-dark`（沿用 `zai-dark` 的 `<family>-<light|dark>` 命名），归属 dark。
2. **配色语义**（遵守 `DESIGN.md`）：
   - 底色近黑带绿调（`#050a06`），面板/卡片用深绿黑阶；不用 `--color-brand` 当整页背景。
   - 正文用浅绿（保证在近黑底上的对比度），次要/最次要文本沿用 `color-mix(..., transparent)` 的既有写法。
   - 品牌/主色为霓虹绿；边框为低透明绿。
   - **语义色保留色相语义**：destructive 红、warning 琥珀、git/diff 增删色、terminal 的 red/yellow/blue/magenta 仍可区分——纯绿 ANSI 会让错误与 diff 不可读。
3. **可选入口**：侧栏 footer 主题菜单与设置页主题选择器都能选到；label 为「黑客」/「Hacker」。
   > 修正（2026-09-22）：本次交付时**只有侧栏菜单真的能选到**，设置页用的另一份硬编码列表
   > （`settingsPageConfig.ts` 的 `THEME_MODES`）漏了 `hacker-dark`，而且 `settings.themeMode.zai-dark`
   > 的文案写作"深色"，用户看到的下拉框只有 系统/深色/浅色。现已把可选主题收敛成单一来源
   > `@/themeOptions.ts`，两个入口都从它渲染；规则与守卫见 `specs/theme-option-registry.md`。
   > 教训：验收场景里写"两个入口都能选到"就必须**两个入口都实际点开看**，不能只改类型与枚举点。
4. **首屏不闪错底色**：`packages/web/index.html` 的 `BROWSER_THEME_COLORS` 与主题归一化脚本需包含该主题（桌面渲染层无此映射，不需改）。
5. **`applyTheme` 泛化**：由"硬编码 3 个 classList.toggle"改为按主题注册表清理并切换 `theme-*` 类，避免每加一个主题都要改这一处（本次连同实现）。

## 状态所有者与边界

- 主题定义唯一来源：`packages/ui/src/styles.css` 的主题块；主题 id 与亮暗归属唯一来源：`packages/ui/src/useTheme.ts`。
- 不做主题预览缩略图、不做主题编辑器（超出本次范围）。

## 验收场景

1. 选「黑客」后：页面底色近黑带绿调、正文为浅绿、品牌/选中态为霓虹绿；切换后立即生效且刷新后保持。
2. `system` 模式不受影响；切回 zai-dark/zai-light 正常（类名清理无残留，不会出现两套主题叠加）。
3. 原生窗口/标题栏按 dark 处理；`color-scheme` 为 dark；Web 端刷新首帧不闪白/蓝。
4. 语义色仍可辨识：错误红、警告琥珀、git 增删绿/红、diff 增删可读。
5. `pnpm typecheck`、`pnpm lint`、`pnpm architecture:check --changed` 通过。
