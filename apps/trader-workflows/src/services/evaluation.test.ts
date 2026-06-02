import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateEvaluationMetrics,
  aggregatePathMetrics,
  buildEvaluationReportPayload,
  computeDeltaHumanValue,
  deriveRecommendation,
  filterOutcomesForModelVersion,
  inferEvaluationWindow,
  MIN_LABELED_MODEL_PATH,
  type EvaluationOutcomeRow,
} from "./evaluation.js";

function outcome(
  overrides: Partial<EvaluationOutcomeRow> & Pick<EvaluationOutcomeRow, "outcome_id">,
): EvaluationOutcomeRow {
  return {
    decision_id: "dec-1",
    symbol: "TSLA",
    horizon: "1d",
    path: "model_path",
    status: "labeled",
    relative_return_pct: 1,
    absolute_return_pct: 2,
    label: "positive",
    created_at: "2026-06-01T10:00:00Z",
    labeled_at: "2026-06-02T10:00:00Z",
    ...overrides,
  };
}

test("aggregatePathMetrics reports model_path separately from override_path", () => {
  const rows: EvaluationOutcomeRow[] = [
    outcome({ outcome_id: "o1", path: "model_path", relative_return_pct: 2, label: "positive" }),
    outcome({ outcome_id: "o2", path: "model_path", relative_return_pct: 4, label: "positive" }),
    outcome({
      outcome_id: "o3",
      path: "override_path",
      relative_return_pct: 6,
      label: "target_hit",
    }),
    outcome({
      outcome_id: "o4",
      path: "override_path",
      status: "skipped",
      relative_return_pct: null,
      label: null,
    }),
  ];

  const model = aggregatePathMetrics(rows, "model_path");
  const override = aggregatePathMetrics(rows, "override_path");

  assert.equal(model.labeled_count, 2);
  assert.equal(model.mean_relative_return_pct, 3);
  assert.equal(override.labeled_count, 1);
  assert.equal(override.skipped_count, 1);
  assert.equal(override.mean_relative_return_pct, 6);
});

test("computeDeltaHumanValue aggregates paired horizon deltas", () => {
  const rows: EvaluationOutcomeRow[] = [
    outcome({
      outcome_id: "m1",
      decision_id: "dec-a",
      horizon: "1d",
      path: "model_path",
      relative_return_pct: 1,
    }),
    outcome({
      outcome_id: "h1",
      decision_id: "dec-a",
      horizon: "1d",
      path: "override_path",
      relative_return_pct: 3,
    }),
    outcome({
      outcome_id: "m2",
      decision_id: "dec-b",
      horizon: "1d",
      path: "model_path",
      relative_return_pct: 5,
    }),
    outcome({
      outcome_id: "h2",
      decision_id: "dec-b",
      horizon: "1d",
      path: "override_path",
      relative_return_pct: 2,
    }),
  ];

  const delta = computeDeltaHumanValue(rows);
  assert.equal(delta.paired_horizon_count, 2);
  assert.equal(delta.mean_delta_relative_return_pct, -0.5);
  assert.equal(delta.override_better_count, 1);
  assert.equal(delta.model_better_count, 1);
});

test("deriveRecommendation returns needs_more_data when model_path sample is too small", () => {
  const metrics = aggregateEvaluationMetrics(
    Array.from({ length: MIN_LABELED_MODEL_PATH - 1 }, (_, index) =>
      outcome({
        outcome_id: `small-${index}`,
        path: "model_path",
      }),
    ),
  );
  assert.equal(deriveRecommendation(metrics), "needs_more_data");
});

test("deriveRecommendation returns hold with sufficient labeled model_path outcomes", () => {
  const metrics = aggregateEvaluationMetrics(
    Array.from({ length: MIN_LABELED_MODEL_PATH }, (_, index) =>
      outcome({
        outcome_id: `enough-${index}`,
        path: "model_path",
      }),
    ),
  );
  assert.equal(deriveRecommendation(metrics), "hold");
});

test("deriveRecommendation returns needs_more_data when labeled ratio is too low", () => {
  const rows: EvaluationOutcomeRow[] = [
    ...Array.from({ length: MIN_LABELED_MODEL_PATH }, (_, index) =>
      outcome({ outcome_id: `labeled-${index}`, path: "model_path" }),
    ),
    outcome({ outcome_id: "skip-1", path: "model_path", status: "skipped", label: null }),
    outcome({ outcome_id: "skip-2", path: "model_path", status: "skipped", label: null }),
    outcome({ outcome_id: "skip-3", path: "model_path", status: "skipped", label: null }),
    outcome({ outcome_id: "skip-4", path: "model_path", status: "skipped", label: null }),
  ];
  assert.equal(deriveRecommendation(aggregateEvaluationMetrics(rows)), "needs_more_data");
});

test("buildEvaluationReportPayload only emits hold or needs_more_data", () => {
  const payload = buildEvaluationReportPayload({
    model_version: "stage1-v0",
    outcomes: Array.from({ length: MIN_LABELED_MODEL_PATH }, (_, index) =>
      outcome({ outcome_id: `rep-${index}` }),
    ),
  });

  assert.ok(payload.recommendation === "hold" || payload.recommendation === "needs_more_data");
  assert.equal(payload.report_json.auto_promotion, false);
  assert.equal(payload.metrics_json.model_path.labeled_count, MIN_LABELED_MODEL_PATH);
});

test("filterOutcomesForModelVersion keeps only matching decision ids", () => {
  const filtered = filterOutcomesForModelVersion({
    model_version: "stage1-v0",
    decisions: [
      { decision_id: "dec-a", model_version: "stage1-v0", symbol: "TSLA" },
      { decision_id: "dec-b", model_version: "stage1-v1", symbol: "TSLA" },
    ],
    outcomes: [
      outcome({ outcome_id: "o-a", decision_id: "dec-a" }),
      outcome({ outcome_id: "o-b", decision_id: "dec-b" }),
    ],
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.decision_id, "dec-a");
});

test("inferEvaluationWindow uses labeled timestamps", () => {
  const window = inferEvaluationWindow([
    outcome({ outcome_id: "w1", labeled_at: "2026-06-03T10:00:00Z" }),
    outcome({ outcome_id: "w2", labeled_at: "2026-06-01T10:00:00Z" }),
  ]);
  assert.equal(window.window_start, "2026-06-01T10:00:00Z");
  assert.equal(window.window_end, "2026-06-03T10:00:00Z");
});
