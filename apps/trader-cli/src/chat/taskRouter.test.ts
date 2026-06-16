import assert from "node:assert/strict";
import test from "node:test";
import { classifyTask } from "./taskRouter.js";
import { createWorkspaceState } from "./memory/workspace.js";

const workspace = createWorkspaceState();

test("classifyTask: English ticker quick query", () => {
  const result = classifyTask("NVDA price?", workspace);
  assert.equal(result.mode, "quick");
  assert.ok(result.confidence >= 0.7);
});

test("classifyTask: Chinese quote query", () => {
  const result = classifyTask("TSLA 现在多少？", workspace);
  assert.equal(result.mode, "quick");
  assert.ok(result.requiredTools.includes("getMarketBars"));
});

test("classifyTask: decision intent", () => {
  const result = classifyTask("根据当前信号，应该加仓 TSLA 吗？", workspace);
  assert.equal(result.mode, "decision");
});

test("classifyTask: review intent", () => {
  const result = classifyTask("回顾今天决策", workspace);
  assert.equal(result.mode, "review");
});

test("classifyTask: ambiguous fallback to analysis", () => {
  const result = classifyTask("帮我看看市场情况，多给点背景", workspace);
  assert.equal(result.mode, "analysis");
  assert.ok(result.reason.includes("fallback"));
});
