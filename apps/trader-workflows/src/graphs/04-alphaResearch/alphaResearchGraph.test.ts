import assert from "node:assert/strict";
import test from "node:test";

import { captureFetchCall } from "../../test/fetchTestUtils.js";
import { createAlphaResearchClient } from "../../data/ruleCandidates.js";
import {
  ALPHA_RESEARCH_INPUT_VALIDATION_FAILED,
} from "../../services/alphaResearch.js";
import type {
  AlphaResearchClient,
  LiteBacktestReportResponse,
  LiteBacktestResponse,
  RuleCandidateCreateResponse,
} from "../../types/alpha.js";
import { buildAlphaSeedV1 } from "../../services/insightCandidates.js";
import {
  ALPHA_RESEARCH_GRAPH_NODE_NAMES,
  alphaResearchGraph,
  buildAlphaResearchGraph,
  runAlphaResearchGraph,
} from "./alphaResearchGraph.js";

function mockClient(overrides: Partial<AlphaResearchClient> = {}): AlphaResearchClient {
  const backtest: LiteBacktestResponse = {
    candidate_id: "rc-1",
    latest_report_id: "rep-1",
    candidate_status: "backtested",
    decision: "needs_more_data",
    reason: "small sample",
    quality_flags: ["small_sample"],
    sample_size: 1,
  };
  const report: LiteBacktestReportResponse = {
    id: "rep-1",
    candidate_id: "rc-1",
    decision: "needs_more_data",
    reason: "small sample",
    quality_flags: ["small_sample"],
    sample_size: 1,
  };
  return {
    createRuleCandidate: async () =>
      ({ candidate_id: "rc-1", status: "draft" }) satisfies RuleCandidateCreateResponse,
    validateEvidence: async () => ({
      candidate_id: "rc-1",
      status: "satisfied",
      candidate_status: "backtest_pending",
      status_sequence: ["draft", "evidence_required", "backtest_pending"],
      gaps: [],
    }),
    runLiteBacktest: async () => backtest,
    advanceCandidate: async () => ({ candidate_id: "rc-1", status: "needs_more_data" }),
    getLiteBacktestReport: async () => report,
    ...overrides,
  };
}

function validGraphInput() {
  return {
    insight_id: "ins-1",
    run_id: "run-1",
    symbol: "TSLA",
    thesis: "sharp drop may stabilize",
    evidence_refs: [{ ref_type: "signal", ref_id: "sig-1" }],
    alpha_seed: buildAlphaSeedV1({
      origin_category: "failure_mode",
      thesis: "sharp drop may stabilize",
      horizon: "2m",
      symbol: "TSLA",
    }),
    backtest_window_start: "2026-05-22",
    backtest_window_end: "2026-05-22",
  };
}

test("alphaResearchGraph export exposes pipeline with validation branch steps", () => {
  assert.deepEqual(ALPHA_RESEARCH_GRAPH_NODE_NAMES, [
    "validate_input",
    "create_rule_candidate",
    "run_lite_backtest",
    "final_output",
  ]);
  const pipeline = buildAlphaResearchGraph();
  assert.equal(pipeline.name, "alpha_research_graph");
  assert.equal(pipeline.steps.length, 4);
  assert.equal(alphaResearchGraph.name, "alpha_research_graph");
  assert.equal(alphaResearchGraph.steps.length, 4);
});

test("runAlphaResearchGraph stops on input_validation_failed without creating candidate", async () => {
  const calls: string[] = [];
  const client = mockClient({
    createRuleCandidate: async () => {
      calls.push("create");
      return { candidate_id: "rc-1", status: "draft" };
    },
  });

  const result = await runAlphaResearchGraph(
    { thesis: "missing required fields" },
    { client },
  );

  assert.equal(result.status, ALPHA_RESEARCH_INPUT_VALIDATION_FAILED);
  assert.equal(result.rule_candidate_id, null);
  assert.equal(result.lite_backtest_report_id, null);
  assert.equal(calls.length, 0);
});

test("runAlphaResearchGraph orchestrates evidence, backtest, advance, and report fetch", async () => {
  const calls: string[] = [];
  const client = mockClient({
    createRuleCandidate: async () => {
      calls.push("create");
      return { candidate_id: "rc-1", status: "draft" };
    },
    validateEvidence: async () => {
      calls.push("evidence");
      return {
        candidate_id: "rc-1",
        status: "satisfied",
        candidate_status: "backtest_pending",
        status_sequence: ["draft", "evidence_required", "backtest_pending"],
        gaps: [],
      };
    },
    runLiteBacktest: async () => {
      calls.push("backtest");
      return {
        candidate_id: "rc-1",
        latest_report_id: "rep-1",
        candidate_status: "backtested",
        decision: "needs_more_data",
        reason: "small sample",
        quality_flags: ["small_sample"],
        sample_size: 1,
      };
    },
    advanceCandidate: async () => {
      calls.push("advance");
      return { candidate_id: "rc-1", status: "needs_more_data" };
    },
    getLiteBacktestReport: async () => {
      calls.push("report");
      return {
        id: "rep-1",
        candidate_id: "rc-1",
        decision: "needs_more_data",
        reason: "small sample",
        quality_flags: ["small_sample"],
        sample_size: 1,
      };
    },
  });

  const result = await runAlphaResearchGraph(validGraphInput(), { client });

  assert.deepEqual(calls, ["create", "evidence", "backtest", "advance", "report"]);
  assert.equal(result.rule_candidate_id, "rc-1");
  assert.equal(result.lite_backtest_report_id, "rep-1");
  assert.equal(result.candidate_status, "needs_more_data");
  assert.ok(result.safety_flags.includes("no_execution_submission"));
});

test("alpha research graph does not call forbidden intel hydrate or rulepack endpoints", async () => {
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = await captureFetchCall(input, init ?? {});
    const url = call.url;
    const method = call.method;
    assert.equal(url.includes("/api/intel"), false);
    assert.equal(url.includes("rulepack"), false);
    assert.equal(url.includes("execution"), false);
    if (url.endsWith("/api/rule-candidates") && method === "POST") {
      return new Response(JSON.stringify({ candidate_id: "rc-1", status: "draft" }), {
        status: 200,
      });
    }
    if (url.includes("/evidence-requirements")) {
      return new Response(
        JSON.stringify({
          candidate_id: "rc-1",
          status: "satisfied",
          candidate_status: "backtest_pending",
          status_sequence: [],
          gaps: [],
        }),
        { status: 200 },
      );
    }
    if (url.includes("/lite-backtest") && !url.includes("lite-backtest-report")) {
      return new Response(
        JSON.stringify({
          candidate_id: "rc-1",
          latest_report_id: "rep-1",
          candidate_status: "backtested",
          decision: "needs_more_data",
          reason: "small sample",
          quality_flags: [],
          sample_size: 1,
        }),
        { status: 200 },
      );
    }
    if (url.includes("/advance")) {
      return new Response(
        JSON.stringify({ candidate_id: "rc-1", status: "needs_more_data" }),
        { status: 200 },
      );
    }
    if (url.includes("/lite-backtest-report")) {
      return new Response(
        JSON.stringify({
          id: "rep-1",
          candidate_id: "rc-1",
          decision: "needs_more_data",
          reason: "small sample",
          quality_flags: [],
          sample_size: 1,
        }),
        { status: 200 },
      );
    }
    return new Response("not found", { status: 404 });
  };

  const result = await runAlphaResearchGraph(validGraphInput(), {
    client: createAlphaResearchClient(fetchImpl as typeof fetch),
  });
  assert.equal(result.status, "needs_more_data");
});
