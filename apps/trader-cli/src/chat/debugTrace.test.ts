import assert from "node:assert/strict";
import test from "node:test";
import { buildDebugTrace, serializeDebugTrace } from "./debugTrace.js";
import { classifyTask } from "./taskRouter.js";
import type { ReActResult } from "../llm/chatReAct.js";

test("debug trace includes router, tools, and termination", () => {
  const classification = classifyTask("TSLA 现在多少？");
  const reactResult: ReActResult = {
    text: "245",
    steps: [{
      step: 1,
      thought: "fetch quote",
      actions: ["getMarketBars({\"symbol\":\"TSLA\"})"],
      observations: "{ close: 245 }",
      tokensUsed: 50,
      elapsedMs: 120,
    }],
    workflowRuns: [],
    totalTokens: 50,
    totalMs: 120,
    wallClockMs: 200,
    terminatedBy: "natural",
  };

  const trace = buildDebugTrace({
    classification,
    activeTools: ["getMarketBars", "describeTools"],
    reactResult,
  });

  assert.equal(trace.taskMode, "quick");
  assert.ok(trace.decisionTrace.length >= 3);
  assert.equal(trace.termination.reason, "natural");
  const json = serializeDebugTrace(trace);
  assert.ok(json.includes("getMarketBars"));
});
