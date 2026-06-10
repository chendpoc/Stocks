import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGateDecision,
  executeAgent,
  resetAgentExecutorDepsForTests,
  setAgentExecutorDepsForTests,
  spawn,
} from "./agentFactory.js";
import { getAgentSystemPromptById } from "../llm/prompts/index.js";

test("getAgentSystemPromptById returns all daemon agent prompts", () => {
  for (const id of ["daemon", "pre-market", "mid-day-deep", "swarm-lead", "post-market", "macro"]) {
    assert.ok(getAgentSystemPromptById(id).length > 0, `${id} prompt should be registered`);
  }
});

test("daemon agent scope excludes longbridge and memory tools", async () => {
  const result = await spawn("daemon", { reason: "test" });

  assert.equal(result.agentId, "daemon");
  assert.equal(result.toolScope, "daemon");
  assert.ok(result.toolCount > 0, "daemon should receive market/sentiment/workflow tools");
  assert.ok(!result.tools.some((name) => name.toLowerCase().includes("longbridge")));
  assert.ok(!result.tools.includes("describeTools"));
  assert.ok(!result.tools.includes("queryPatternHistory"));
});

test("buildGateDecision maps daemon gate inputs", () => {
  const gate = buildGateDecision({
    symbols: ["tsla", "NVDA"],
    complexityScore: 0.55,
    setups: { TSLA: "VWAP_Reclaim", NVDA: "RS_Pullback" },
  });

  assert.ok(gate);
  assert.equal(gate?.complexity_score, 0.55);
  assert.deepEqual(gate?.symbols, ["TSLA", "NVDA"]);
  assert.equal(gate?.setups?.TSLA, "VWAP_Reclaim");
});

test("spawn attaches gate_decision for mid-day-deep", async () => {
  const result = await spawn("mid-day-deep", {
    symbols: ["TSLA"],
    complexityScore: 0.2,
  });

  assert.equal(result.agentId, "mid-day-deep");
  assert.equal(result.toolScope, "evidence");
  assert.ok(result.gate_decision);
  assert.equal(result.gate_decision?.symbols[0], "TSLA");
});

test("executeAgent runs DecisionGraph workflow for mid-day-deep", async () => {
  setAgentExecutorDepsForTests({
    runDecision: (input) => ({
      ok: true,
      command: "decide",
      run_id: "run_test",
      status: "succeeded",
      data: {
        decision_id: "dec_test",
        action: "WATCH",
        snapshot_id: "snap_test",
        scheduled_outcome_count: 3,
        paper_execution_submitted: false,
        gate_complexity: input.gate_decision?.complexity_score,
      },
    }),
  });

  try {
    const handoff = await spawn("mid-day-deep", {
      symbols: ["TSLA", "NVDA"],
      complexityScore: 0.45,
      pattern: "swarm",
    });
    const executed = await executeAgent(handoff);

    assert.equal(executed.skipped, false);
    assert.equal(executed.symbol, "TSLA");
    assert.equal(executed.workflow?.run_id, "run_test");
    assert.equal(executed.workflow?.data?.action, "WATCH");
  } finally {
    resetAgentExecutorDepsForTests();
  }
});

test("executeAgent skips non-decision agents", async () => {
  const handoff = await spawn("pre-market", { symbols: ["TSLA"] });
  const executed = await executeAgent(handoff);
  assert.equal(executed.skipped, true);
});
