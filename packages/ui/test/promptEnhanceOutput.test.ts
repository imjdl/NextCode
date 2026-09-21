import assert from "node:assert/strict";
import test from "node:test";
import { normalizePromptEnhanceOutput } from "../src/lib/promptEnhanceOutput.js";

test("去除整段代码围栏", () => {
  assert.equal(normalizePromptEnhanceOutput("```\n修复登录超时\n```"), "修复登录超时");
  assert.equal(
    normalizePromptEnhanceOutput("```markdown\n1. 修复登录超时\n2. 补测试\n```"),
    "1. 修复登录超时\n2. 补测试",
  );
});

test("去除成对引号包裹", () => {
  assert.equal(normalizePromptEnhanceOutput('"修复登录超时"'), "修复登录超时");
  assert.equal(normalizePromptEnhanceOutput("'修复登录超时'"), "修复登录超时");
  assert.equal(normalizePromptEnhanceOutput("「修复登录超时」"), "修复登录超时");
});

test("保留正文里正常的引号与围栏", () => {
  // 内部含同类引号，不是一层包裹
  assert.equal(normalizePromptEnhanceOutput('"修复 "登录" 超时"'), '"修复 "登录" 超时"');
  // 只有一段被围栏包裹，前后还有正文时不解包
  assert.equal(
    normalizePromptEnhanceOutput("先做这个：\n```\ncode\n```"),
    "先做这个：\n```\ncode\n```",
  );
  // @ 引用等正文标记不被破坏
  assert.equal(normalizePromptEnhanceOutput("@src/a.ts 修复超时"), "@src/a.ts 修复超时");
});

test("空结果与空白输入返回空串", () => {
  assert.equal(normalizePromptEnhanceOutput(""), "");
  assert.equal(normalizePromptEnhanceOutput("   \n  "), "");
  assert.equal(normalizePromptEnhanceOutput("```\n\n```"), "");
});

test("裁剪首尾空白", () => {
  assert.equal(normalizePromptEnhanceOutput("  修复登录超时  "), "修复登录超时");
});
