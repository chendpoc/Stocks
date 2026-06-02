import assert from "node:assert/strict";
import test from "node:test";

import { DecisionGraph } from "./decisionGraph.js";
import {
  DecisionEnvelopeValidationError,
  extractDecisionJson,
  parseDecisionEnvelope,
  validateDecisionEnvelope,
} from "../llm/decisionEnvelope.js";
import type { WorkflowLlmProvider } from "../llm/provider.js";
import type { ContextSnapshotRecord } from "../services/contextSnapshots.js";
import {
  computeOutcomeDueAt,
  OUTCOME_HORIZONS,
  type PersistedModelDecision,
  type ScheduledDecisionOutcome,
} from "../services/decisions.js";

const SAMPLE_SNAPSHOT: ContextSnapshotRecord = {
  snapshot_id: "snap-test-1",
  symbol: "TSLA",
  asof_ts: "2026-06-01T12:00:00Z",
  context_version: "stage1-context-v0",
  items_json: [
    {
      item_id: "signal:sig-1",
      source_type: "signal",
      evidence_ref: { ref_type: "intel_signal", ref_id: "sig-1", symbol: "TSLA" },
      summary: "Breakout signal",
      confidence: 0.8,
      relevance_weight: 0.95,
      freshness_weight: 1,
      source_quality_weight: 0.9,
      verification_status: "verified",
      composite_weight: 0.7,
    },
  ],
  evidence_refs_json: [{ ref_type: "intel_signal", ref_id: "sig-1", symbol: "TSLA" }],
  weighting_policy_version: "stage1-v0",
  context_hash: "hash-test",
};

function stubLlm(envelope: ReturnType<typeof parseDecisionEnvelope>): WorkflowLlmProvider {
  return {
    async generateDecisionEnvelope() {
      return envelope;
    },
    async generateInsightProposal() {
      throw new Error("insight exploration not used in DecisionGraph tests");
    },
  };
}

test("validateDecisionEnvelope enforces action-specific plan requirements", () => {
  assert.doesNotThrow(() =>
    validateDecisionEnvelope({
      symbol: "TSLA",
      action: "NO_TRADE",
      thesis: "No edge",
      confidence: 0.4,
    }),
  );

  assert.throws(
    () =>
      validateDecisionEnvelope({
        symbol: "TSLA",
        action: "WATCH",
        thesis: "Monitor",
        confidence: 0.5,
      }),
    DecisionEnvelopeValidationError,
  );

  assert.throws(
    () =>
      validateDecisionEnvelope({
        symbol: "TSLA",
        action: "WAIT_TRIGGER",
        thesis: "Wait",
        confidence: 0.5,
        trigger: "break 110",
      }),
    DecisionEnvelopeValidationError,
  );

  assert.throws(
    () =>
      validateDecisionEnvelope({
        symbol: "TSLA",
        action: "PAPER_ENTER_CANDIDATE",
        thesis: "Enter",
        confidence: 0.6,
        trigger: "break 110",
        invalidation: "below 105",
      }),
    DecisionEnvelopeValidationError,
  );
});

test("DecisionGraph persists snapshot, decision, and pending model_path outcomes", async () => {
  const envelope = parseDecisionEnvelope({
    symbol: "TSLA",
    action: "PAPER_ENTER_CANDIDATE",
    thesis: "Momentum continuation",
    confidence: 0.66,
    trigger: "close above 110",
    invalidation: "close below 105",
    target_plan: "scale out near 120",
  });

  const persistedDecisions: PersistedModelDecision[] = [];
  const scheduled: ScheduledDecisionOutcome[] = [];
  const asof = "2026-06-01T12:00:00.000Z";

  const result = await new DecisionGraph({
    buildContext: async () => SAMPLE_SNAPSHOT,
    llm: stubLlm(envelope),
    persistDecision: async (input) => {
      const record: PersistedModelDecision = {
        decision_id: "dec-test-1",
        run_id: input.run_id ?? null,
        snapshot_id: input.snapshot_id,
        symbol: input.envelope.symbol,
        action: input.envelope.action.toLowerCase(),
        confidence: input.envelope.confidence,
        uncertainty: input.envelope.uncertainty ?? null,
        decision_json: JSON.stringify(input.envelope),
        status: "active",
      };
      persistedDecisions.push(record);
      return record;
    },
    scheduleOutcomes: async (input) => {
      const rows = OUTCOME_HORIZONS.map((horizon, index) => ({
        outcome_id: `out-${index}`,
        decision_id: input.decision_id,
        symbol: input.symbol,
        horizon,
        path: "model_path",
        status: "pending",
        due_at: input.asof_ts ? computeOutcomeDueAt(horizon, input.asof_ts) : null,
      }));
      scheduled.push(...rows);
      return rows;
    },
  }).run({ symbol: "TSLA", run_id: "run-test-1", asof_ts: asof });

  assert.equal(result.snapshot.snapshot_id, "snap-test-1");
  assert.equal(result.decision.decision_id, "dec-test-1");
  assert.equal(result.envelope.action, "PAPER_ENTER_CANDIDATE");
  assert.equal(result.paper_execution_submitted, false);
  assert.equal(persistedDecisions.length, 1);
  assert.equal(scheduled.length, OUTCOME_HORIZONS.length);
  assert.ok(scheduled.every((row) => row.status === "pending"));
  assert.ok(scheduled.every((row) => row.path === "model_path"));
  assert.deepEqual(
    scheduled.map((row) => row.due_at),
    OUTCOME_HORIZONS.map((horizon) => computeOutcomeDueAt(horizon, asof)),
  );
  assert.notEqual(scheduled[0].due_at, scheduled[4].due_at);
});

test("DecisionGraph rejects invalid envelopes before persistence", async () => {
  await assert.rejects(
    () =>
      new DecisionGraph({
        buildContext: async () => SAMPLE_SNAPSHOT,
        llm: stubLlm({
          symbol: "TSLA",
          action: "WATCH",
          thesis: "Watch only",
          confidence: 0.5,
        }),
        persistDecision: async () => {
          throw new Error("should not persist invalid envelope");
        },
        scheduleOutcomes: async () => {
          throw new Error("should not schedule outcomes for invalid envelope");
        },
      }).run({ symbol: "TSLA" }),
    DecisionEnvelopeValidationError,
  );
});

test("extractDecisionJson marks paper actions as not submitted", () => {
  const envelope = parseDecisionEnvelope({
    symbol: "TSLA",
    action: "PAPER_EXIT_CANDIDATE",
    thesis: "Take profit",
    confidence: 0.7,
    exit_rationale: "Extended move",
    hold_condition: "stay above 20dma",
  });
  const json = extractDecisionJson(envelope);
  assert.equal(json.paper_execution_submitted, false);
});
