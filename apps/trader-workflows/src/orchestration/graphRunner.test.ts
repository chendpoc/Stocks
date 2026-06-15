import assert from "node:assert/strict";
import test from "node:test";

import {
  GRAPH_NAME_DECISION,
  GRAPH_NAME_EVALUATION,
  GRAPH_NAME_INSIGHT_EXPLORATION,
  GRAPH_NAME_OUTCOME,
} from "../constants/graphNames.js";
import type { Stage1Runtime, Stage1RuntimeGraphResult } from "../runtime/stage1Runtime.js";
import {
  runDecisionGraphViaRuntime,
  runEvaluationGraphViaRuntime,
  runInsightExplorationGraphViaRuntime,
  runOutcomeGraphViaRuntime,
} from "./graphRunner.js";

function createMockRuntime<TOutput>(
  result: Stage1RuntimeGraphResult<TOutput>,
): Stage1Runtime & { calls: Array<{ graph_name: string; input: unknown }> } {
  const calls: Array<{ graph_name: string; input: unknown }> = [];
  return {
    calls,
    async runGraph(options) {
      calls.push({
        graph_name: options.graph_name,
        input: options.input,
      });
      return result as Stage1RuntimeGraphResult<unknown> as Stage1RuntimeGraphResult<TOutput>;
    },
  } as Stage1Runtime & { calls: Array<{ graph_name: string; input: unknown }> };
}

test("runDecisionGraphViaRuntime dispatches DecisionGraph with input", async () => {
  const executed = {
    run: { run_id: "run-1", status: "succeeded" },
    output: { decision_id: "dec-1" },
  } as unknown as Stage1RuntimeGraphResult<{ decision_id: string }>;
  const runtime = createMockRuntime(executed);

  const result = await runDecisionGraphViaRuntime(runtime, {
    symbol: "TSLA",
    setup_name: "breakout",
  });

  assert.equal(runtime.calls.length, 1);
  assert.equal(runtime.calls[0]?.graph_name, GRAPH_NAME_DECISION);
  assert.deepEqual(runtime.calls[0]?.input, {
    symbol: "TSLA",
    setup_name: "breakout",
  });
  assert.equal(result, executed);
});

test("runOutcomeGraphViaRuntime dispatches OutcomeGraph with input", async () => {
  const executed = {
    run: { run_id: "run-2", status: "succeeded" },
    output: { processed_count: 3 },
  } as unknown as Stage1RuntimeGraphResult<{ processed_count: number }>;
  const runtime = createMockRuntime(executed);

  const result = await runOutcomeGraphViaRuntime(runtime, {
    symbol: "NVDA",
    limit: 50,
  });

  assert.equal(runtime.calls[0]?.graph_name, GRAPH_NAME_OUTCOME);
  assert.deepEqual(runtime.calls[0]?.input, { symbol: "NVDA", limit: 50 });
  assert.equal(result, executed);
});

test("runEvaluationGraphViaRuntime dispatches EvaluationGraph with input", async () => {
  const executed = {
    run: { run_id: "run-3", status: "succeeded" },
    output: { report_id: "rep-1" },
  } as unknown as Stage1RuntimeGraphResult<{ report_id: string }>;
  const runtime = createMockRuntime(executed);

  const result = await runEvaluationGraphViaRuntime(runtime, {
    symbol: "AAPL",
    model_version: "stage1-v0",
    limit: 500,
  });

  assert.equal(runtime.calls[0]?.graph_name, GRAPH_NAME_EVALUATION);
  assert.deepEqual(runtime.calls[0]?.input, {
    symbol: "AAPL",
    model_version: "stage1-v0",
    limit: 500,
  });
  assert.equal(result, executed);
});

test("runInsightExplorationGraphViaRuntime dispatches InsightExplorationGraph with input", async () => {
  const executed = {
    run: { run_id: "run-4", status: "succeeded" },
    output: { insight_id: "ins-1" },
  } as unknown as Stage1RuntimeGraphResult<{ insight_id: string }>;
  const runtime = createMockRuntime(executed);

  const result = await runInsightExplorationGraphViaRuntime(runtime, {
    symbol: "TSLA",
    window: "7d",
  });

  assert.equal(runtime.calls[0]?.graph_name, GRAPH_NAME_INSIGHT_EXPLORATION);
  assert.deepEqual(runtime.calls[0]?.input, {
    symbol: "TSLA",
    window: "7d",
  });
  assert.equal(result, executed);
});
