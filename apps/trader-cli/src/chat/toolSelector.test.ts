import assert from "node:assert/strict";
import test from "node:test";
import { tool } from "ai";
import { z } from "zod";
import { selectTools } from "./toolSelector.js";
import { classifyTask } from "./taskRouter.js";

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
  scanSignals: stubTool("scanSignals"),
  buildContext: stubTool("buildContext"),
  saveHypothesis: stubTool("saveHypothesis"),
  getLessons: stubTool("getLessons"),
  runWorkflow: stubTool("runWorkflow"),
  describeTools: stubTool("describeTools"),
  describeTool: stubTool("describeTool"),
  webSearch: stubTool("webSearch"),
};

test("quick mode does not expose full tool surface", () => {
  const classification = classifyTask("TSLA 现在多少？");
  const selection = selectTools(classification, ALL_TOOLS);
  assert.ok(selection.activeTools.length < Object.keys(ALL_TOOLS).length);
  assert.ok(selection.activeTools.includes("getMarketBars"));
  assert.ok(!selection.activeTools.includes("saveHypothesis"));
});

test("decision mode excludes memory write tools by default", () => {
  const classification = classifyTask("应该买入 TSLA 吗？");
  const selection = selectTools(classification, ALL_TOOLS);
  assert.ok(!selection.activeTools.includes("saveHypothesis"));
});

test("review mode selects lesson tools", () => {
  const classification = classifyTask("复盘今天");
  const selection = selectTools(classification, ALL_TOOLS);
  assert.ok(selection.activeTools.includes("getLessons"));
});
