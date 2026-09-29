# 深色主题：纯黑（OLED）（2026-09）

## 目标

新增深色主题**纯黑（OLED）**：真黑底（#000）+ zai-dark 中性色相，OLED 屏省电、
对比度最高。归属 dark；设置页下拉与侧栏主题菜单同时可选，桌面与 web/手机端一致。

## 过程记录

2026-09-28 曾一次性加入五套社区深色主题（Dracula/Nord/东京夜色/Catppuccin + 纯黑），
用户过目后仅保留纯黑，其余四套撤除（完整实现保留在 git 历史，需要时可找回）。

## 规则

- 主题是 `packages/ui/src/styles.css` 里与 zai-dark 同构的完整 token 覆盖
  （`theme-oled-black` 块，~145 个 `--color-*`）；表面压到真黑、边框/surface 用
  低透明白，沿用 zai-dark 的语义色相。
- 语义色约束：error/warning/git/成功/删除在底色上保持可辨对比（沿用 zai-dark 值，
  实测正文对比 13.4:1）。
- 注册点（新增主题必须全部同步，themeOptions 守卫测试会拦截漏项）：
  1. `packages/ui/src/useTheme.ts`：Theme 联合、`THEME_CLASS_IDS`、`DARK_THEME_IDS`、`isTheme`
  2. `packages/ui/src/themeOptions.ts`：`THEME_OPTIONS` 登记项（侧栏菜单与设置页共用此单源）
  3. i18n：`settings.themeOption.<id>`（zh/en 各一条）
  4. `packages/web/src/webThemeSeed.ts`：`WebThemeSeed` 联合与校验
  5. `packages/web/index.html`：`BROWSER_THEME_COLORS` 登记底色（防刷新首帧闪
     zai-dark）+ `THEMED_CLASSES` 集合
  6. `packages/ui/test/themeOptions.test.ts`：`THEME_UNION` 清单
  7. `packages/ui/src/openWorkspacePageThemeHero.tsx`：主题首页插画（可选，缺省回落
     default 渐变）
- **变更入口守卫单源**：主题合法性校验必须用 `useTheme` 导出的 `isTheme`，
  禁止在调用点（如 SettingsPage 的 handleFooterThemeChange）各自维护白名单——
  曾因硬编码六项白名单未同步新主题，出现「菜单里有选项、点击切换没反应」。
- 历史 id（light/dark）继续按遗留映射到 zai-*，不作为选项暴露。

## 状态所有者

- 无新状态：主题选择仍由 `zcode-theme` localStorage 单点存储，`applyTheme`
  按 `THEME_CLASS_IDS` 切换根类名。

## 验收场景

1. 设置页与侧栏菜单出现五个选项（系统/深/浅/黑客/纯黑），选择即生效并持久。
2. 真实浏览器切换到纯黑：根元素挂 `theme-oled-black`，`--color-background` 计算值
   为 #000000，正文对比 13.4:1。
3. web 刷新无首帧闪烁（index.html 已登记纯黑底色 #000000）。
4. 桌面端与 web/手机端主题列表一致；旧数据（zcode-theme 存量值）不受影响；
   曾选过已撤主题的存量值回退 zai-dark（isTheme 不认 → 启动默认值）。
