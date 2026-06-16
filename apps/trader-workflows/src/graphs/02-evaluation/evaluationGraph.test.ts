import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEvaluationGraph,
  buildEvaluationGraphPipeline,
  EVALUATION_GRAPH_NODE_NAMES,
  evaluationGraph,
  runEvaluationSummaryGraph,
} from "./evaluationGraph.js";
import { EvaluationGraph } from "./evaluationGraph.types.js";
import {
  MIN_LABELED_MODEL_PATH,
  type EvaluationReportPayload,
  type EvaluationReportSections,
} from "../../services/evaluation.js";

function sampleSections(): EvaluationReportSections {
  return {
    decision_performance: {
      total: MIN_LABELED_MODEL_PATH,
      by_label: { hit: 2, miss: 1 },
      mean_relative_return_pct: 1.5,
      mean_absolute_return_pct: 2,
    },
    insight_candidate_performance: {
      total: 2,
      by_label: { hit: 1, neutral: 1 },
      hit_rate: 0.5,
    },
    top_positive_patterns: ["decision hits by symbol: TSLA(2)"],
    top_negative_patterns: [],
    failure_modes: [],
    data_gaps: [],
    evidence_refs: ["decision_outcomes: 3 labeled records", "insight_candidate_outcomes: 2 labeled records"],
  };
}

function sampleReport(recommendation: "hold" | "needs_more_data"): EvaluationReportPayload {
  return {
    report_id: "eval-test-1",
    model_version: "stage1-v0",
    window_start: "2026-06-01T00:00:00Z",
    window_end: "2026-06-02T00:00:00Z",
    recommendation,
    metrics_json: {
      model_path: {
        path: "model_path",
        total_count: MIN_LABELED_MODEL_PATH,
        labeled_count: MIN_LABELED_MODEL_PATH,
        skipped_count: 0,
        failed_count: 0,
        mean_relative_return_pct: 1.5,
        mean_absolute_return_pct: 2,
        positive_label_count: 2,
        negative_label_count: 1,
      },
      override_path: {
        path: "override_path",
        total_count: 1,
        labeled_count: 1,
        skipped_count: 0,
        failed_count: 0,
        mean_relative_return_pct: 3,
        mean_absolute_return_pct: 4,
        positive_label_count: 1,
        negative_label_count: 0,
      },
      delta_human_value: {
        paired_horizon_count: 1,
        mean_delta_relative_return_pct: 1.5,
        override_better_count: 1,
        model_better_count: 0,
      },
      triple_barrier: {
        total_count: MIN_LABELED_MODEL_PATH + 1,
        hit_profit_first_count: 3,
        hit_stop_first_count: 1,
        hit_time_first_count: 0,
        none_count: 0,
        profit_first_rate: 0.75,
        stop_first_rate: 0.25,
        time_first_rate: 0,
      },
      evidence_utility_score: 0.6667,
      contra_predictive_power: 0.3333,
    },
    sections: sampleSections(),
    evidence_utility_score: 0.6667,
    contra_predictive_power: 0.3333,
    report_json: {
      summary: "Stage 1 single-arm evaluation; no auto-promotion",
      auto_promotion: false,
    },
  };
}

test("EvaluationGraph aggregates, persists report, and returns envelope data", async () => {
  let persisted = false;
  const report = sampleReport("hold");

  const result = await new EvaluationGraph({
    build: async () => report,
    persist: async (payload) => {
      persisted = true;
      assert.equal(payload.recommendation, "hold");
      return {
        ...payload,
        created_at: "2026-06-02T12:00:00Z",
      };
    },
  }).runSummary({ model_version: "stage1-v0", run_id: "run-eval-1" });

  assert.equal(result.run_id, "run-eval-1");
  assert.equal(result.report.report_id, "eval-test-1");
  assert.equal(result.report.metrics_json.delta_human_value.mean_delta_relative_return_pct, 1.5);
  assert.equal(persisted, true);
  assert.ok(result.persisted_report);
});

test("EvaluationGraph does not auto-promote or mutate model configuration", async () => {
  const sideEffects: string[] = [];

  await new EvaluationGraph({
    build: async () => sampleReport("needs_more_data"),
    persist: async (payload) => {
      sideEffects.push("persist_report");
      assert.equal(payload.report_json.auto_promotion, false);
      assert.ok(payload.recommendation === "hold" || payload.recommendation === "needs_more_data");
      return { ...payload, created_at: "2026-06-02T12:00:00Z" };
    },
  }).runSummary({ persist: true });

  assert.deepEqual(sideEffects, ["persist_report"]);
});

test("EvaluationGraph can skip persistence for dry runs", async () => {
  let persisted = false;
  const result = await new EvaluationGraph({
    build: async () => sampleReport("hold"),
    persist: async () => {
      persisted = true;
      throw new Error("should not persist");
    },
  }).runSummary({ persist: false });

  assert.equal(persisted, false);
  assert.equal(result.persisted_report, null);
});

test("evaluationGraph export exposes native business node names", () => {
  const nodeNames = evaluationGraph.getGraph().nodes;
  for (const name of EVALUATION_GRAPH_NODE_NAMES) {
    assert.ok(nodeNames[name], `missing node ${name}`);
  }
});

test("buildEvaluationGraph exposes pipeline invoke entry", () => {
  const compiled = buildEvaluationGraph();
  assert.equal(typeof compiled.invoke, "function");
  assert.ok(compiled.getGraph().nodes.normalize_input);
});

test("buildEvaluationGraphPipeline orders steps to match node names", () => {
  const pipeline = buildEvaluationGraphPipeline();
  assert.equal(pipeline.steps.length, EVALUATION_GRAPH_NODE_NAMES.length);
  assert.equal(pipeline.name, "EvaluationGraph");
});

test("runEvaluationSummaryGraph invokes the pipeline path", async () => {
  const report = sampleReport("hold");
  const result = await runEvaluationSummaryGraph(
    { model_version: "stage1-v0", run_id: "run-eval-compiled" },
    {
      build: async () => report,
      persist: async (payload) => ({ ...payload, created_at: "2026-06-02T12:00:00Z" }),
    },
  );

  assert.equal(result.run_id, "run-eval-compiled");
  assert.equal(result.report.report_id, "eval-test-1");
  assert.ok(result.persisted_report);
});

test("EvaluationReport contains all required sections", async () => {
  const report = sampleReport("hold");
  const result = await new EvaluationGraph({
    build: async () => report,
    persist: async (payload) => ({ ...payload, created_at: "2026-06-02T12:00:00Z" }),
  }).runSummary({ model_version: "stage1-v0", run_id: "run-sections" });

  const { sections } = result.report;
  assert.ok(sections, "report must include sections");
  assert.ok("decision_performance" in sections);
  assert.ok("insight_candidate_performance" in sections);
  assert.ok("top_positive_patterns" in sections);
  assert.ok("top_negative_patterns" in sections);
  assert.ok("failure_modes" in sections);
  assert.ok("data_gaps" in sections);
  assert.ok("evidence_refs" in sections);

  assert.equal(sections.decision_performance.total, MIN_LABELED_MODEL_PATH);
  assert.equal(sections.insight_candidate_performance.total, 2);
  assert.equal(sections.insight_candidate_performance.hit_rate, 0.5);
  assert.ok(Array.isArray(sections.top_positive_patterns));
  assert.ok(Array.isArray(sections.failure_modes));
  assert.ok(Array.isArray(sections.evidence_refs));
});

test("EvaluationReport sections are bounded (no raw data, no full traces)", async () => {
  const report = sampleReport("hold");
  const result = await new EvaluationGraph({
    build: async () => report,
    persist: async (payload) => ({ ...payload, created_at: "2026-06-02T12:00:00Z" }),
  }).runSummary({ model_version: "stage1-v0", run_id: "run-bounded" });

  const { sections } = result.report;
  assert.ok(sections.top_positive_patterns.length <= 5);
  assert.ok(sections.top_negative_patterns.length <= 5);
  assert.ok(sections.failure_modes.length <= 5);
  assert.ok(sections.data_gaps.length <= 5);
  assert.ok(sections.evidence_refs.length <= 10);
});

test("EvaluationReport never recommends promotion or RulePack mutation", async () => {
  for (const rec of ["hold", "needs_more_data"] as const) {
    const report = sampleReport(rec);
    const result = await new EvaluationGraph({
      build: async () => report,
      persist: async (payload) => {
        assert.equal(payload.report_json.auto_promotion, false);
        assert.ok(
          payload.recommendation === "hold" || payload.recommendation === "needs_more_data",
        );
        return { ...payload, created_at: "2026-06-02T12:00:00Z" };
      },
    }).runSummary({ model_version: "stage1-v0", run_id: `run-safety-${rec}` });

    assert.equal(result.report.report_json.auto_promotion, false);
    assert.ok(
      result.report.recommendation === "hold" ||
      result.report.recommendation === "needs_more_data",
    );
  }
});
