import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEvaluationGraph,
  EVALUATION_GRAPH_NODE_NAMES,
  evaluationGraph,
  runEvaluationSummaryGraph,
} from "./evaluationGraph.js";
import { EvaluationGraph } from "./evaluationGraph.types.js";
import { MIN_LABELED_MODEL_PATH, type EvaluationReportPayload } from "../../services/evaluation.js";

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
    },
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

test("buildEvaluationGraph compiles without hand-written class flow", () => {
  const compiled = buildEvaluationGraph();
  assert.equal(typeof compiled.invoke, "function");
  assert.ok(compiled.getGraph().nodes.normalize_input);
});

test("runEvaluationSummaryGraph invokes the compiled StateGraph path", async () => {
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
