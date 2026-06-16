import assert from "node:assert/strict";
import test from "node:test";
import { tool } from "ai";
import { z } from "zod";
import { prepareChatTurn, filterActiveToolsByPermission } from "./runChatTurn.js";

function stubTool(name: string) {
  return tool({
    description: `stub ${name}`,
    parameters: z.object({}),
    execute: async () => ({}),
  });
}

const ALL_TOOLS = {
  getMarketBars: stubTool("getMarketBars"),
  getLongbridgeQuote: stubTool("getLongbridgeQuote"),
  getSignals: stubTool("getSignals"),
  saveHypothesis: stubTool("saveHypothesis"),
  describeTools: stubTool("describeTools"),
  describeTool: stubTool("describeTool"),
};

test("prepareChatTurn limits active tools for quick quote query", () => {
  const prepared = prepareChatTurn({
    userMessage: "TSLA 现在多少？",
    messages: [{ role: "user", content: "TSLA 现在多少？" }],
    allTools: ALL_TOOLS,
    baseSystem: "base",
    sessionKey: "test-quick",
  });

  assert.equal(prepared.classification.mode, "quick");
  assert.ok(prepared.activeTools.length < Object.keys(ALL_TOOLS).length);
  assert.ok(prepared.frame.system.includes("ProcessedContext"));
});

test("prepareChatTurn exposes ProcessedContext for debug trace", () => {
  const prepared = prepareChatTurn({
    userMessage: "TSLA 现在多少？",
    messages: [{ role: "user", content: "TSLA 现在多少？" }],
    allTools: ALL_TOOLS,
    baseSystem: "base",
    sessionKey: "test-ctx",
  });

  assert.equal(prepared.ctx.id, prepared.processedContextId);
  assert.ok(Object.keys(prepared.ctx.tokenBudget.byLayer).length > 0);
});

test("prepareChatTurn workspace reflects current user message", () => {
  const userMessage = "分析 NVDA 技术面";
  const prepared = prepareChatTurn({
    userMessage,
    messages: [{ role: "user", content: userMessage }],
    allTools: ALL_TOOLS,
    baseSystem: "base",
    sessionKey: "test-topic-current-turn",
  });

  assert.ok(prepared.ctx.workspace.currentTopic?.includes("分析 NVDA"));
  assert.equal(prepared.ctx.workspace.stepCount, 1);
});

test("filterActiveToolsByPermission yields empty list when only blocked tools remain", () => {
  const { filteredActiveTools, permissionDecisions } = filterActiveToolsByPermission(["submitOrder"]);

  assert.equal(filteredActiveTools.length, 0);
  assert.equal(permissionDecisions.length, 1);
  assert.equal(permissionDecisions[0]?.allowed, false);
  assert.equal(permissionDecisions[0]?.policy, "blocked");
});
