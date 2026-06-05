import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOutcomeGraph,
  OUTCOME_GRAPH_NODE_NAMES,
  outcomeGraph,
  runDueOutcomeGraph,
} from "./outcomeGraph.js";
import { OutcomeGraph } from "./outcomeGraph.types.js";
import { OUTCOME_HORIZONS } from "../../services/decisions.js";
import type { DecisionOutcomeRow, InsightCandidateOutcomeRow } from "../../services/outcomes.js";

function pendingDecisionOutcome(
  horizon: string,
  outcome_id: string,
): DecisionOutcomeRow {
  return {
    outcome_id,
    decision_id: "dec-test-1",
    symbol: "TSLA",
    horizon,
    path: "model_path",
    status: "pending",
    due_at: "2026-06-01T09:30:00Z",
  };
}

function pendingInsightOutcome(
  outcome_id: string,
  overrides: Partial<InsightCandidateOutcomeRow> = {},
): InsightCandidateOutcomeRow {
  return {
    outcome_id,
    insight_id: "ins-test-1",
    symbol: "TSLA",
    horizon: "2m",
    status: "pending",
    due_at: "2026-06-01T09:30:00Z",
    ...overrides,
  };
}

test("OutcomeGraph finalizes each due pending decision row exactly once", async () => {
  const dueRows = OUTCOME_HORIZONS.map((horizon, index) =>
    pendingDecisionOutcome(horizon, `out-${index}`),
  );
  const labeled = new Set<string>();

  const result = await new OutcomeGraph({
    fetchDueDecision: async () => dueRows,
    finalizeDecision: async ({ outcome }) => {
      assert.equal(outcome.status, "pending");
      assert.ok(!labeled.has(outcome.outcome_id));
      labeled.add(outcome.outcome_id);
      return {
        ...outcome,
        status: "labeled",
        label: "positive",
      };
    },
    fetchDueInsight: async () => [],
  }).runDue({ now: "2026-06-02T12:00:00Z" });

  assert.equal(result.processed_count, OUTCOME_HORIZONS.length);
  assert.equal(result.labeled_count, OUTCOME_HORIZONS.length);
  assert.equal(labeled.size, OUTCOME_HORIZONS.length);
  assert.equal(result.outcomes.every((row) => row.status === "labeled"), true);
});

test("OutcomeGraph does not mutate context snapshots", async () => {
  let contextSnapshotWrites = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes("/stage1/context-snapshots")) {
      contextSnapshotWrites += 1;
    }
    return originalFetch(input);
  }) as typeof fetch;

  try {
    await new OutcomeGraph({
      fetchDueDecision: async () => [pendingDecisionOutcome("1d", "out-1")],
      finalizeDecision: async ({ outcome }) => ({
        ...outcome,
        status: "labeled",
      }),
      fetchDueInsight: async () => [],
    }).runDue();
    assert.equal(contextSnapshotWrites, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OutcomeGraph aggregates skipped and failed counts for decisions", async () => {
  const result = await new OutcomeGraph({
    fetchDueDecision: async () => [
      pendingDecisionOutcome("30m", "out-a"),
      pendingDecisionOutcome("1h", "out-b"),
      pendingDecisionOutcome("EOD", "out-c"),
    ],
    finalizeDecision: async ({ outcome }) => ({
      ...outcome,
      status:
        outcome.horizon === "1h"
          ? "skipped"
          : outcome.horizon === "EOD"
            ? "failed"
            : "labeled",
      label: "neutral",
    }),
    fetchDueInsight: async () => [],
  }).runDue();

  assert.equal(result.processed_count, 3);
  assert.equal(result.labeled_count, 1);
  assert.equal(result.skipped_count, 1);
  assert.equal(result.failed_count, 1);
  assert.equal(result.counts_by_source_type.decision, 3);
  assert.equal(result.counts_by_source_type.insight_candidate, 0);
});

test("OutcomeGraph includes counts_by_source_type and counts_by_normalized_label", async () => {
  const result = await new OutcomeGraph({
    fetchDueDecision: async () => [
      pendingDecisionOutcome("1d", "d1"),
      pendingDecisionOutcome("3d", "d2"),
    ],
    finalizeDecision: async ({ outcome }) => ({
      ...outcome,
      status: "labeled",
      label: outcome.horizon === "1d" ? "target_hit" : "invalidated",
    }),
    fetchDueInsight: async () => [],
  }).runDue();

  assert.equal(result.counts_by_source_type.decision, 2);
  assert.equal(result.counts_by_source_type.insight_candidate, 0);
  assert.equal(result.counts_by_normalized_label.hit, 1);
  assert.equal(result.counts_by_normalized_label.miss, 1);
  assert.equal(result.counts_by_normalized_label.neutral, 0);
});

test("OutcomeGraph processes both decision and insight candidate outcomes", async () => {
  const result = await new OutcomeGraph({
    fetchDueDecision: async () => [
      pendingDecisionOutcome("1d", "d1"),
    ],
    finalizeDecision: async ({ outcome }) => ({
      ...outcome,
      status: "labeled",
      label: "positive",
    }),
    fetchDueInsight: async () => [
      pendingInsightOutcome("i1", { horizon: "2m" }),
      pendingInsightOutcome("i2", { horizon: "5m" }),
    ],
    finalizeInsight: async ({ outcome }) => ({
      ...outcome,
      status: outcome.outcome_id === "i1" ? "labeled" : "skipped",
      normalized_label: outcome.outcome_id === "i1" ? "hit" : "insufficient_data",
    }),
  }).runDue();

  assert.equal(result.processed_count, 3);
  assert.equal(result.labeled_count, 2);
  assert.equal(result.skipped_count, 1);
  assert.equal(result.counts_by_source_type.decision, 1);
  assert.equal(result.counts_by_source_type.insight_candidate, 2);
  assert.equal(result.counts_by_normalized_label.hit, 2);
  assert.equal(result.counts_by_normalized_label.insufficient_data, 1);
});

test("OutcomeGraph skips non-pending rows for insight outcomes", async () => {
  const result = await new OutcomeGraph({
    fetchDueDecision: async () => [],
    fetchDueInsight: async () => [
      pendingInsightOutcome("i1"),
      { ...pendingInsightOutcome("i2"), status: "labeled" },
    ],
    finalizeInsight: async ({ outcome }) => ({
      ...outcome,
      status: "labeled",
      normalized_label: "neutral",
    }),
  }).runDue();

  assert.equal(result.processed_count, 1);
  assert.equal(result.counts_by_source_type.insight_candidate, 1);
});

test("OutcomeGraph aggregate counts reflect final status, not source label", async () => {
  const result = await new OutcomeGraph({
    fetchDueDecision: async () => [],
    fetchDueInsight: async () => [
      pendingInsightOutcome("i1"),
      pendingInsightOutcome("i2"),
    ],
    finalizeInsight: async ({ outcome }) => ({
      ...outcome,
      status: "failed",
      normalized_label: "invalid",
    }),
  }).runDue();

  assert.equal(result.failed_count, 2);
  assert.equal(result.counts_by_normalized_label.invalid, 2);
});

test("outcomeGraph export exposes native business node names", () => {
  const nodeNames = outcomeGraph.getGraph().nodes;
  for (const name of OUTCOME_GRAPH_NODE_NAMES) {
    assert.ok(nodeNames[name], `missing node ${name}`);
  }
});

test("buildOutcomeGraph compiles without hand-written class flow", () => {
  const compiled = buildOutcomeGraph();
  assert.equal(typeof compiled.invoke, "function");
  assert.ok(compiled.getGraph().nodes.normalize_input);
});

test("runDueOutcomeGraph invokes the compiled StateGraph path", async () => {
  const dueRows = OUTCOME_HORIZONS.slice(0, 2).map((horizon, index) =>
    pendingDecisionOutcome(horizon, `compiled-${index}`),
  );

  const result = await runDueOutcomeGraph(
    { now: "2026-06-02T12:00:00Z", run_id: "run-compiled-outcome" },
    {
      fetchDueDecision: async () => dueRows,
      finalizeDecision: async ({ outcome }) => ({
        ...outcome,
        status: "labeled",
        label: "positive",
      }),
      fetchDueInsight: async () => [],
    },
  );

  assert.equal(result.run_id, "run-compiled-outcome");
  assert.equal(result.processed_count, 2);
  assert.equal(result.labeled_count, 2);
  assert.equal(result.counts_by_source_type.decision, 2);
});
