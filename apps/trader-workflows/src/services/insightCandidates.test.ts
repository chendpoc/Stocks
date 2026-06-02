import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInsightCandidatePayload,
  clampInsightWeightCap,
  DEFAULT_INSIGHT_WEIGHT_CAP,
  enforceInsightProposal,
  evidenceRefsFromContextItems,
  executeInsightReActTool,
  filterOutcomesInWindow,
  INSIGHT_VERIFICATION_STATUS,
  parseExplorationWindow,
  runControlledInsightReAct,
  type InsightProposal,
} from "./insightCandidates.js";
import { MAX_COMPOSITE_WEIGHT, type WeightedContextItem } from "./contextSnapshots.js";
import type { EvaluationOutcomeRow } from "./evaluation.js";

function contextItem(id: string, weight: number): WeightedContextItem {
  return {
    item_id: id,
    source_type: "signal",
    evidence_ref: { ref_type: "signal", ref_id: id },
    summary: `summary-${id}`,
    confidence: 0.8,
    relevance_weight: 0.9,
    freshness_weight: 0.9,
    source_quality_weight: 0.9,
    verification_status: "verified",
    composite_weight: weight,
  };
}

test("parseExplorationWindow converts 30d into ISO window bounds", () => {
  const now = new Date("2026-06-02T12:00:00.000Z");
  const parsed = parseExplorationWindow("30d", now);
  assert.equal(parsed.window, "30d");
  assert.equal(parsed.window_end, now.toISOString());
  assert.equal(parsed.window_start, "2026-05-03T12:00:00.000Z");
});

test("clampInsightWeightCap enforces default and unverified ceiling", () => {
  assert.equal(clampInsightWeightCap(), DEFAULT_INSIGHT_WEIGHT_CAP);
  assert.equal(clampInsightWeightCap(2), DEFAULT_INSIGHT_WEIGHT_CAP);
  assert.equal(clampInsightWeightCap(0.3), 0.3);
  assert.equal(clampInsightWeightCap(-1), 0);
});

test("enforceInsightProposal caps confidence and pins pending verification metadata", () => {
  const proposal: InsightProposal = {
    thesis: "momentum cluster",
    evidence_refs: [{ ref_type: "signal", ref_id: "sig-1" }],
    weight_cap: 0.9,
    candidate_json: { confidence: 0.95, status: "candidate" },
  };
  const enforced = enforceInsightProposal(proposal);
  assert.equal(enforced.weight_cap, DEFAULT_INSIGHT_WEIGHT_CAP);
  assert.equal(enforced.candidate_json.confidence, DEFAULT_INSIGHT_WEIGHT_CAP);
  assert.equal(enforced.candidate_json.verification_status, INSIGHT_VERIFICATION_STATUS);
  assert.equal(enforced.candidate_json.auto_promotion, false);
});

test("buildInsightCandidatePayload always persists pending verification", () => {
  const window = parseExplorationWindow("7d", new Date("2026-06-02T12:00:00.000Z"));
  const payload = buildInsightCandidatePayload({
    run_id: "run-test",
    symbol: "tsla",
    window,
    proposal: {
      thesis: "test thesis",
      evidence_refs: [{ ref_type: "event", ref_id: "evt-1" }],
      weight_cap: 0.4,
      candidate_json: { status: "candidate" },
    },
  });

  assert.equal(payload.verification_status, "pending");
  assert.ok(payload.evidence_refs_json.length > 0);
  assert.equal(payload.weight_cap, 0.4);
  assert.deepEqual(payload.symbols_json, ["TSLA"]);
});

test("runControlledInsightReAct queries context and outcomes before proposing", async () => {
  const items = [contextItem("a", 0.9), contextItem("b", 0.5)];
  const outcomes: EvaluationOutcomeRow[] = [
    {
      outcome_id: "o1",
      decision_id: "d1",
      symbol: "TSLA",
      horizon: "1d",
      path: "model_path",
      status: "labeled",
      label: "positive",
      created_at: "2026-06-01T10:00:00Z",
    },
  ];

  const result = await runControlledInsightReAct({
    symbol: "TSLA",
    contextItems: items,
    outcomes,
    propose: async () => ({
      thesis: "react thesis",
      evidence_refs: evidenceRefsFromContextItems(items),
      weight_cap: DEFAULT_INSIGHT_WEIGHT_CAP,
      candidate_json: { status: "candidate", auto_promotion: false },
    }),
  });

  assert.equal(result.steps[0]?.tool, "query_context_items");
  assert.equal(result.steps[1]?.tool, "query_outcomes");
  assert.equal(result.steps.at(-1)?.tool, "propose_insight");
  assert.equal(result.proposal.thesis, "react thesis");
});

test("executeInsightReActTool returns weighted context summaries", () => {
  const observation = executeInsightReActTool({
    tool: "query_context_items",
    symbol: "TSLA",
    contextItems: [contextItem("x", 0.7)],
    outcomes: [],
    limit: 5,
  }) as { count: number };

  assert.equal(observation.count, 1);
});

test("filterOutcomesInWindow respects labeled timestamps", () => {
  const window = parseExplorationWindow("7d", new Date("2026-06-10T00:00:00.000Z"));
  const rows: EvaluationOutcomeRow[] = [
    {
      outcome_id: "in",
      decision_id: "d1",
      symbol: "TSLA",
      horizon: "1d",
      path: "model_path",
      status: "labeled",
      labeled_at: "2026-06-08T00:00:00Z",
    },
    {
      outcome_id: "out",
      decision_id: "d2",
      symbol: "TSLA",
      horizon: "1d",
      path: "model_path",
      status: "labeled",
      labeled_at: "2026-05-01T00:00:00Z",
    },
  ];

  const filtered = filterOutcomesInWindow(rows, window);
  assert.deepEqual(filtered.map((row) => row.outcome_id), ["in"]);
});
