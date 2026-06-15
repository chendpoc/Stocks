import assert from "node:assert/strict";
import test from "node:test";

import { captureFetchCall } from "../test/fetchTestUtils.js";
import {
  createAlphaResearchClient,
} from "../data/ruleCandidates.js";
import {
  ALPHA_RESEARCH_INPUT_VALIDATION_FAILED,
  buildRuleCandidateRequest,
  validateAlphaResearchInput,
  type AlphaResearchInput,
} from "./alphaResearch.js";
import { buildAlphaSeedV1 } from "./insightCandidates.js";

function validInput(): AlphaResearchInput {
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

test("validateAlphaResearchInput returns input_validation_failed errors for missing fields", () => {
  const report = validateAlphaResearchInput({});
  assert.equal(report.valid, false);
  assert.ok(report.errors.includes("missing insight_id"));
  assert.ok(report.errors.includes("missing alpha_seed"));
});

test("validateAlphaResearchInput accepts canonical alpha research input", () => {
  const report = validateAlphaResearchInput(validInput());
  assert.equal(report.valid, true);
  assert.deepEqual(report.errors, []);
});

test("buildRuleCandidateRequest maps alpha_seed fields without data_requirements hints", () => {
  const request = buildRuleCandidateRequest(validInput());
  assert.equal(request.source, "insight_candidate");
  assert.deepEqual(request.source_ref, { insight_id: "ins-1", run_id: "run-1" });
  assert.equal(request.trigger_definition, validInput().alpha_seed.trigger_hint);
  assert.equal(request.entry_condition, validInput().alpha_seed.entry_condition_hint);
  assert.equal(request.invalidation, validInput().alpha_seed.invalidation_hint);
  assert.equal((request as { data_requirements?: unknown }).data_requirements, undefined);
});

test("alpha research client calls only rule-candidates endpoints", async () => {
  const calls: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = await captureFetchCall(input, init ?? {});
    calls.push(`${call.method} ${call.url}`);
    const url = call.url;
    const method = call.method;
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
          status_sequence: ["draft", "evidence_required", "backtest_pending"],
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
          quality_flags: ["small_sample"],
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
          quality_flags: ["small_sample"],
          sample_size: 1,
        }),
        { status: 200 },
      );
    }
    return new Response("not found", { status: 404 });
  };

  const client = createAlphaResearchClient(fetchImpl as typeof fetch);
  const request = buildRuleCandidateRequest(validInput());
  const created = await client.createRuleCandidate(request);
  await client.validateEvidence(created.candidate_id);
  const backtest = await client.runLiteBacktest(created.candidate_id, {
    start: "2026-05-22",
    end: "2026-05-22",
  });
  await client.advanceCandidate(created.candidate_id, backtest.decision);
  await client.getLiteBacktestReport(created.candidate_id);

  assert.ok(calls.every((call) => call.includes("/api/rule-candidates")));
  assert.equal(calls.some((call) => call.includes("/api/intel")), false);
  assert.equal(
    validateAlphaResearchInput({ thesis: "x" }).valid,
    false,
  );
  assert.equal(ALPHA_RESEARCH_INPUT_VALIDATION_FAILED, "input_validation_failed");
});
