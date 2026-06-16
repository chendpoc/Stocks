import assert from "node:assert/strict";
import test from "node:test";
import { resolveExperimentalActiveTools, toTurnCompleteInfo, type ReActResult } from "./chatReAct.js";

test("toTurnCompleteInfo carries finalText, termination, and totals", () => {
  const result: ReActResult = {
    text: "TSLA is trading at 245",
    steps: [{
      step: 1,
      thought: "Checking TSLA quote",
      actions: ["getMarketBars({\"symbol\":\"TSLA\"})"],
      observations: "{ close: 245 }",
      tokensUsed: 120,
      elapsedMs: 90,
    }],
    workflowRuns: [],
    totalTokens: 120,
    totalMs: 90,
    wallClockMs: 150,
    terminatedBy: "natural",
  };

  const info = toTurnCompleteInfo(result);
  assert.equal(info.finalText, result.text);
  assert.equal(info.terminatedBy, "natural");
  assert.equal(info.totalTokens, 120);
  assert.equal(info.steps.length, 1);
  assert.equal(info.workflowRuns.length, 0);
});

test("resolveExperimentalActiveTools treats empty array as explicit no-tool restriction", () => {
  assert.deepEqual(resolveExperimentalActiveTools([]), { experimental_activeTools: [] });
  assert.deepEqual(resolveExperimentalActiveTools(["getMarketBars"]), {
    experimental_activeTools: ["getMarketBars"],
  });
  assert.deepEqual(resolveExperimentalActiveTools(undefined), {});
});
