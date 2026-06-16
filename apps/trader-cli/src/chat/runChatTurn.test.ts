import assert from "node:assert/strict";
import test from "node:test";
import { tool } from "ai";
import { z } from "zod";
import { prepareChatTurn } from "./runChatTurn.js";

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
