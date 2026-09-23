// 模型切换提示的"用户视角等价"抑制（用户反馈：切到当前模型仍弹"模型已切换"）：
// 起止渲染标签相同（如 zai/bigmodel 档位孪生 provider 的同名模型）不显示提示。
import assert from "node:assert/strict";
import { test } from "node:test";
import { BUILTIN_MODEL_PROVIDER_IDS } from "@zcode/shared";
import {
  formatModelChangeLabel,
  isRedundantModelChangeLabel,
} from "../src/v4/composer/modelTriggerDisplay.js";

const intlStub = {
  formatMessage: ({ id }: { id: string }) => {
    if (id === "settings.modelProvider.connectionMode.codingPlan") return "个人套餐";
    if (id === "settings.modelProvider.connectionMode.startPlan") return "轻量套餐";
    if (id === "settings.modelProvider.connectionMode.teamPlan") return "团队套餐";
    return id;
  },
};

test("档位孪生 provider：同名模型渲染标签相同 → 判定为冗余切换", () => {
  const zaiPlan = formatModelChangeLabel(
    BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan,
    undefined,
    "GLM-5.3",
    intlStub,
  );
  const bigmodelPlan = formatModelChangeLabel(
    BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan,
    undefined,
    "GLM-5.3",
    intlStub,
  );
  assert.equal(zaiPlan, "GLM-5.3(个人套餐)");
  assert.equal(bigmodelPlan, "GLM-5.3(个人套餐)");
  assert.equal(isRedundantModelChangeLabel(zaiPlan, bigmodelPlan), true);
});

test("真实模型变化：标签不同 → 不抑制", () => {
  const flash = formatModelChangeLabel(
    BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan,
    undefined,
    "GLM-5.3-Flash",
    intlStub,
  );
  const full = formatModelChangeLabel(
    BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan,
    undefined,
    "GLM-5.3",
    intlStub,
  );
  assert.equal(isRedundantModelChangeLabel(flash, full), false);
});

test("跨 provider 真实变化（deepseek → GLM）：标签不同 → 不抑制", () => {
  const deepseek = formatModelChangeLabel(
    "91d00128-c091-4099-854a-3cfb3e8be414",
    "deepseek",
    "deepseek-flash",
    intlStub,
  );
  const glm = formatModelChangeLabel(
    BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan,
    undefined,
    "GLM-5.3-Flash",
    intlStub,
  );
  assert.notEqual(deepseek, glm);
  assert.equal(isRedundantModelChangeLabel(deepseek, glm), false);
});

test("同 provider 同模型：标签相同 → 抑制（重复选择当前模型）", () => {
  const a = formatModelChangeLabel(
    BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan,
    undefined,
    "GLM-5.3",
    intlStub,
  );
  assert.equal(isRedundantModelChangeLabel(a, a), true);
});
