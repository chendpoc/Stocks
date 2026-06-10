import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateEvaluationMetrics,
  aggregatePathMetrics,
  aggregateTripleBarrierMetrics,
  buildEvaluationReportPayload,
  buildEvaluationReportSections,
  computeDeltaHumanValue,
  computeSystemQualityScores,
  deriveRecommendation,
  filterOutcomesForModelVersion,
  inferEvaluationWindow,
  MIN_LABELED_MODEL_PATH,
  type EvaluationOutcomeRow,
} from "./evaluation.js";
import type { InsightCandidateOutcomeRow } from "./outcomes.js";

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
    barrier_result: "hit_profit_first",
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

test("aggregateTripleBarrierMetrics counts deterministic barrier outcomes", () => {
  const metrics = aggregateTripleBarrierMetrics([
    outcome({ outcome_id: "b1", barrier_result: "hit_profit_first" }),
    outcome({ outcome_id: "b2", barrier_result: "hit_stop_first" }),
    outcome({ outcome_id: "b3", barrier_result: "hit_time_first" }),
    outcome({ outcome_id: "b4", barrier_result: "none", status: "skipped", label: null }),
    outcome({ outcome_id: "b5", status: "pending", label: null }),
  ]);

  assert.equal(metrics.total_count, 4);
  assert.equal(metrics.hit_profit_first_count, 1);
  assert.equal(metrics.hit_stop_first_count, 1);
  assert.equal(metrics.hit_time_first_count, 1);
  assert.equal(metrics.none_count, 1);
  assert.equal(metrics.profit_first_rate, 0.25);
});

test("computeSystemQualityScores reports evidence and contra signal rates", () => {
  const scores = computeSystemQualityScores([
    outcome({ outcome_id: "q1", label: "positive", barrier_result: "hit_profit_first" }),
    outcome({ outcome_id: "q2", label: "negative", barrier_result: "hit_stop_first" }),
    outcome({ outcome_id: "q3", label: "neutral", barrier_result: "hit_time_first" }),
    outcome({ outcome_id: "q4", path: "override_path", label: "positive" }),
  ]);

  assert.equal(scores.evidence_utility_score, 0.3333);
  assert.equal(scores.contra_predictive_power, 0.3333);
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
  assert.ok(payload.metrics_json.triple_barrier);
  assert.equal(payload.metrics_json.triple_barrier.hit_profit_first_count, MIN_LABELED_MODEL_PATH);
  assert.equal(payload.evidence_utility_score, 1);
  assert.equal(payload.contra_predictive_power, 0);
  assert.ok(payload.sections, "payload must include sections");
  assert.ok("decision_performance" in payload.sections);
  assert.ok("insight_candidate_performance" in payload.sections);
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

test("buildEvaluationReportSections aggregates decision and insight candidate performance", () => {
  const decisionOutcomes: EvaluationOutcomeRow[] = [
    outcome({ outcome_id: "d1", label: "positive", relative_return_pct: 2.0, absolute_return_pct: 3.0 }),
    outcome({ outcome_id: "d2", label: "negative", relative_return_pct: -1.0, absolute_return_pct: -0.5 }),
    outcome({ outcome_id: "d3", label: "target_hit", relative_return_pct: 5.0, absolute_return_pct: 6.0 }),
  ];

  const insightOutcomes: InsightCandidateOutcomeRow[] = [
    {
      outcome_id: "ic1", insight_id: "ins-1", symbol: "TSLA", horizon: "2m",
      status: "labeled", normalized_label: "hit", reason_codes_json: [],
    },
    {
      outcome_id: "ic2", insight_id: "ins-2", symbol: "NVDA", horizon: "5m",
      status: "labeled", normalized_label: "miss", reason_codes_json: ["insufficient_market_bars"],
    },
    {
      outcome_id: "ic3", insight_id: "ins-3", symbol: "TSLA", horizon: "2m",
      status: "pending", normalized_label: null,
    },
  ];

  const sections = buildEvaluationReportSections({
    decisionOutcomes,
    insightCandidateOutcomes: insightOutcomes,
  });

  assert.equal(sections.decision_performance.total, 3);
  assert.equal(sections.decision_performance.by_label.hit, 2);
  assert.equal(sections.decision_performance.by_label.miss, 1);
  assert.equal(sections.decision_performance.mean_relative_return_pct, 2.0);

  assert.equal(sections.insight_candidate_performance.total, 2);
  assert.equal(sections.insight_candidate_performance.by_label.hit, 1);
  assert.equal(sections.insight_candidate_performance.by_label.miss, 1);
  assert.equal(sections.insight_candidate_performance.hit_rate, 0.5);

  assert.ok(sections.top_positive_patterns.length > 0);
  assert.ok(sections.top_negative_patterns.length > 0);
  assert.ok(Array.isArray(sections.failure_modes));
  assert.ok(Array.isArray(sections.data_gaps));
  assert.ok(sections.evidence_refs.length > 0);

  assert.ok(sections.top_positive_patterns.length <= 5);
  assert.ok(sections.top_negative_patterns.length <= 5);
  assert.ok(sections.failure_modes.length <= 5);
  assert.ok(sections.data_gaps.length <= 5);

  assert.ok(
    sections.top_positive_patterns[0]?.includes("("),
    "pattern should include frequency count",
  );
});

test("buildEvaluationReportSections handles empty insight candidate outcomes gracefully", () => {
  const decisionOutcomes: EvaluationOutcomeRow[] = [
    outcome({ outcome_id: "d1", label: "positive", relative_return_pct: 1.0, absolute_return_pct: 2.0 }),
  ];

  const sections = buildEvaluationReportSections({
    decisionOutcomes,
    insightCandidateOutcomes: [],
  });

  assert.equal(sections.insight_candidate_performance.total, 0);
  assert.deepEqual(sections.insight_candidate_performance.by_label, {});
  assert.equal(sections.insight_candidate_performance.hit_rate, null);
  assert.ok(
    sections.data_gaps.some((g) => g.includes("no labeled insight candidate outcomes")),
    "data_gaps should flag missing insight outcomes",
  );
  assert.ok(Array.isArray(sections.top_positive_patterns));
  assert.ok(Array.isArray(sections.top_negative_patterns));
  assert.ok(Array.isArray(sections.failure_modes));
});

test("buildEvaluationReportSections handles both sources empty", () => {
  const sections = buildEvaluationReportSections({
    decisionOutcomes: [],
    insightCandidateOutcomes: [],
  });

  assert.equal(sections.decision_performance.total, 0);
  assert.equal(sections.decision_performance.mean_relative_return_pct, null);
  assert.equal(sections.insight_candidate_performance.total, 0);
  assert.equal(sections.insight_candidate_performance.hit_rate, null);
  assert.deepEqual(sections.top_positive_patterns, []);
  assert.deepEqual(sections.top_negative_patterns, []);
  assert.deepEqual(sections.failure_modes, []);
  assert.ok(
    sections.data_gaps.some((g) => g.includes("no labeled decision outcomes")),
  );
  assert.ok(
    sections.data_gaps.some((g) => g.includes("no labeled insight candidate outcomes")),
  );
  assert.deepEqual(sections.evidence_refs, []);
});
