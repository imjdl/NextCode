import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isOpenCodeGoBaseUrl } from "../src/model/opencode-session.js";

describe("isOpenCodeGoBaseUrl", () => {
  it("canonical /zen/go/v1 归一化前的原始配置即可命中", () => {
    assert.equal(isOpenCodeGoBaseUrl("https://opencode.ai/zen/go/v1"), true);
  });

  it("anthropic-messages 少写 /v1 时（执行层会归一化补上）不得静默丢会话头——回归用例", () => {
    assert.equal(isOpenCodeGoBaseUrl("https://opencode.ai/zen/go"), true);
  });

  it("尾随斜杠不参与判定", () => {
    assert.equal(isOpenCodeGoBaseUrl("https://opencode.ai/zen/go/"), true);
    assert.equal(isOpenCodeGoBaseUrl("https://opencode.ai/zen/go/v1/"), true);
  });

  it("子域名仍命中（保持既有语义）", () => {
    assert.equal(isOpenCodeGoBaseUrl("https://api.opencode.ai/zen/go/v1"), true);
  });

  it("大小写不敏感", () => {
    assert.equal(isOpenCodeGoBaseUrl("https://OpenCode.ai/Zen/Go/v1"), true);
  });

  it("非 Go 路径与端点资源路径不命中", () => {
    assert.equal(isOpenCodeGoBaseUrl("https://opencode.ai/zen"), false);
    assert.equal(isOpenCodeGoBaseUrl("https://opencode.ai/zen/go/v1/messages"), false);
    assert.equal(isOpenCodeGoBaseUrl("https://opencode.ai/inference/anthropic"), false);
  });

  it("非 opencode.ai 域名不命中", () => {
    assert.equal(isOpenCodeGoBaseUrl("https://example.com/zen/go/v1"), false);
    assert.equal(isOpenCodeGoBaseUrl("https://opencode.com/zen/go/v1"), false);
    assert.equal(isOpenCodeGoBaseUrl("https://badopencode.ai/zen/go/v1"), false);
  });

  it("空值与非法 URL fail closed", () => {
    assert.equal(isOpenCodeGoBaseUrl(undefined), false);
    assert.equal(isOpenCodeGoBaseUrl(""), false);
    assert.equal(isOpenCodeGoBaseUrl("   "), false);
    assert.equal(isOpenCodeGoBaseUrl("not a url"), false);
  });
});
