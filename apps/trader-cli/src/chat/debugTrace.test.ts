import assert from "node:assert/strict";
import test from "node:test";
import { buildDebugTrace, serializeDebugTrace } from "./debugTrace.js";
import { classifyTask } from "./taskRouter.js";
import { buildProcessedContext } from "./processedContext.js";
import { createWorkspaceState } from "./memory/workspace.js";
import { evaluateToolPermission } from "./permissionGate.js";
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

test("debug trace includes ProcessedContext layer summary and permission blocks", () => {
  const workspace = createWorkspaceState("sess_debug");
  const classification = classifyTask("TSLA 现在多少？");
  const ctx = buildProcessedContext({
    userMessage: "TSLA 现在多少？",
    messages: [{ role: "user", content: "TSLA 现在多少？" }],
    mode: classification.mode,
    toolViews: [],
    workspace,
  });
  const permissionDecisions = ["saveHypothesis", "getMarketBars"].map(evaluateToolPermission);

  const trace = buildDebugTrace({
    processedContext: { ...ctx, id: "pc_test" },
    classification,
    activeTools: ["getMarketBars"],
    permissionDecisions,
    reactResult: {
      text: "ok",
      steps: [],
      workflowRuns: [],
      totalTokens: 0,
      totalMs: 0,
      wallClockMs: 0,
      terminatedBy: "natural",
    },
  });

  assert.equal(trace.processedContextId, "pc_test");
  assert.ok(Object.keys(trace.contextLayerSummary).length > 0);
  assert.ok(trace.decisionTrace.some((line) => line.includes("permission-blocked: saveHypothesis")));
});
