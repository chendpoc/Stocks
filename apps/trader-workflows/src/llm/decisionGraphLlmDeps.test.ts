import assert from "node:assert/strict";
import test from "node:test";

import { runSwarmWorkers } from "../graphs/00-decision/decisionGraph.llmNodes.js";
import {
  createDecisionGraphLlmDeps,
  getDecisionGraphLlmDeps,
  resetDecisionGraphLlmDepsCache,
} from "./decisionGraphLlmDeps.js";
import { resolveEvidenceTools } from "./evidenceTools.js";

test("resolveEvidenceTools exposes prompt-aligned evidence whitelist", () => {
  const tools = resolveEvidenceTools();
  for (const name of [
    "fetchMarketBars",
    "fetchBenchmarkBars",
    "searchRecentEvents",
    "fetchOptionFlow",
    "webSearch",
    "fetchUrl",
    "queryPatternHistory",
  ]) {
    assert.ok(Object.hasOwn(tools, name), `missing tool ${name}`);
  }
});

test("createDecisionGraphLlmDeps wires chatReAct for Swarm workers", async () => {
  const deps = createDecisionGraphLlmDeps({
    getFlashModel: () => ({ modelId: "flash" }) as never,
    resolveTools: () => ({}),
    chatReAct: async () => ({ text: "worker evidence", wallClockMs: 5 }),
  });

  const workers = await runSwarmWorkers(
    {
      complexity_score: 0.5,
      symbols: ["TSLA", "NVDA"],
      setups: { TSLA: "A", NVDA: "B" },
    },
    deps,
  );

  assert.equal(workers.length, 2);
  assert.equal(workers[0]?.text, "worker evidence");
});

test("getDecisionGraphLlmDeps returns cached singleton", () => {
  resetDecisionGraphLlmDepsCache();
  const a = getDecisionGraphLlmDeps();
  const b = getDecisionGraphLlmDeps();
  assert.equal(a, b);
  assert.equal(typeof a.chatReAct, "function");
  resetDecisionGraphLlmDepsCache();
});
