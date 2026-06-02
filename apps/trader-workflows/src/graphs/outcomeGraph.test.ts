import assert from "node:assert/strict";
import test from "node:test";

import { OutcomeGraph } from "./outcomeGraph.js";
import { OUTCOME_HORIZONS } from "../services/decisions.js";
import type { DecisionOutcomeRow } from "../services/outcomes.js";

function pendingOutcome(
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

test("OutcomeGraph finalizes each due pending row exactly once", async () => {
  const dueRows = OUTCOME_HORIZONS.map((horizon, index) =>
    pendingOutcome(horizon, `out-${index}`),
  );
  const labeled = new Set<string>();

  const result = await new OutcomeGraph({
    fetchDue: async () => dueRows,
    finalize: async ({ outcome }) => {
      assert.equal(outcome.status, "pending");
      assert.ok(!labeled.has(outcome.outcome_id));
      labeled.add(outcome.outcome_id);
      return {
        ...outcome,
        status: "labeled",
        label: "positive",
      };
    },
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
      fetchDue: async () => [pendingOutcome("1d", "out-1")],
      finalize: async ({ outcome }) => ({
        ...outcome,
        status: "labeled",
      }),
    }).runDue();
    assert.equal(contextSnapshotWrites, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OutcomeGraph aggregates skipped and failed counts", async () => {
  const result = await new OutcomeGraph({
    fetchDue: async () => [
      pendingOutcome("30m", "out-a"),
      pendingOutcome("1h", "out-b"),
      pendingOutcome("EOD", "out-c"),
    ],
    finalize: async ({ outcome }) => ({
      ...outcome,
      status:
        outcome.horizon === "1h"
          ? "skipped"
          : outcome.horizon === "EOD"
            ? "failed"
            : "labeled",
    }),
  }).runDue();

  assert.equal(result.processed_count, 3);
  assert.equal(result.labeled_count, 1);
  assert.equal(result.skipped_count, 1);
  assert.equal(result.failed_count, 1);
});
