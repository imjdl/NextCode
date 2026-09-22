import assert from "node:assert/strict";
import test from "node:test";
import enUS from "../src/i18n/locales/en-US.js";
import zhCN from "../src/i18n/locales/zh-CN.js";
import { LEGACY_THEME_IDS, THEME_OPTIONS } from "../src/themeOptions.js";
import type { Theme } from "../src/useTheme.js";

/** Theme 联合的运行时清单：新增主题必须同步这里（类型检查会因缺项/多项报错）。 */
const THEME_UNION: Record<Theme, true> = {
  system: true,
  light: true,
  dark: true,
  "zai-light": true,
  "zai-dark": true,
  "hacker-dark": true,
};

test("主题选项 id 不重复，且都来自 Theme 联合", () => {
  const ids = THEME_OPTIONS.map((option) => option.id);
  assert.equal(new Set(ids).size, ids.length, `选项 id 重复: ${ids.join(", ")}`);
  for (const id of ids) assert.ok(THEME_UNION[id], `${id} 不在 Theme 联合里`);
});

test("每个主题选项在两种语言里都有标签", () => {
  for (const { id, labelId } of THEME_OPTIONS) {
    assert.ok(
      typeof zhCN[labelId] === "string" && zhCN[labelId].length > 0,
      `zh-CN 缺少主题标签: ${labelId}（主题 ${id}）`,
    );
    assert.ok(
      typeof enUS[labelId] === "string" && enUS[labelId].length > 0,
      `en-US 缺少主题标签: ${labelId}（主题 ${id}）`,
    );
  }
});

test("Theme 联合里的每个主题要么可选、要么显式登记为历史遗留", () => {
  // 这条是本次漏项的根因守卫：3.17.0 加了 hacker-dark 只更新了侧栏菜单与类型，
  // 设置页的硬编码列表没跟上，导致"设置了主题却无处可选"。
  const selectable = new Set(THEME_OPTIONS.map((option) => option.id));
  const legacy = new Set(LEGACY_THEME_IDS);
  const missing = Object.keys(THEME_UNION).filter(
    (id) => !selectable.has(id as Theme) && !legacy.has(id as Theme),
  );
  assert.deepEqual(missing, [], `以下主题没有任何入口可选，也没登记为遗留: ${missing.join(", ")}`);
});

test("历史主题不作为可选项暴露", () => {
  for (const legacyId of LEGACY_THEME_IDS) {
    assert.ok(
      !THEME_OPTIONS.some((option) => option.id === legacyId),
      `${legacyId} 是仅保留读取兼容的历史主题，不应出现在选项里`,
    );
  }
});

test("标签键族统一为 settings.themeOption.*", () => {
  for (const { labelId } of THEME_OPTIONS) {
    assert.match(labelId, /^settings\.themeOption\./);
  }
});
