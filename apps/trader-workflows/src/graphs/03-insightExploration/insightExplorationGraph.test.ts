import assert from "node:assert/strict";
import test from "node:test";

import { captureFetchCall } from "../../test/fetchTestUtils.js";
import {
  buildInsightExplorationGraph,
  buildInsightExplorationGraphPipeline,
  INSIGHT_EXPLORATION_GRAPH_NODE_NAMES,
  insightExplorationGraph,
  runInsightExplorationGraph,
} from "./insightExplorationGraph.js";
import { InsightSchedulingError } from "./insightExplorationGraph.nodes.js";
import { InsightExplorationGraph } from "./insightExplorationGraph.types.js";
import {
  DEFAULT_INSIGHT_WEIGHT_CAP,
  DEFAULT_INSIGHT_HORIZON,
  INSIGHT_CANDIDATE_HORIZONS,
  INSIGHT_VERIFICATION_STATUS,
  buildInsightCandidatePayload,
  deriveOriginCategory,
  parseExplorationWindow,
  resolveInsightHorizon,
} from "../../services/insightCandidates.js";
import type { InsightCandidatePayload } from "../../types/insight.js";
import { INSIGHT_CANDIDATE_OUTCOME_HORIZONS } from "../../services/outcomes.js";
import type {
  InsightCandidateOutcomeRow,
  ScheduleInsightCandidateOutcomePayload,
} from "../../types/outcomes.js";
import type { WeightedContextItem } from "../../types/context.js";
import type {
  EvaluationOutcomeRow,
  EvaluationReportPayload,
  EvaluationReportSections,
} from "../../types/evaluation.js";

const FORBIDDEN_STAGE1_PATH_FRAGMENTS = [
  "/lessons",
  "/trade",
  "/train",
  "/promote",
  "/accepted-lessons",
  "/paper-execution",
  "/rule-candidates",
  "/rule-packs",
];

function mockScheduleOutcome(
  capturedPayloads: ScheduleInsightCandidateOutcomePayload[],
) {
  return async (payload: ScheduleInsightCandidateOutcomePayload): Promise<InsightCandidateOutcomeRow> => {
    capturedPayloads.push(payload);
    return {
      outcome_id: `oco_mock_${Date.now()}`,
      insight_id: payload.insight_id,
      symbol: payload.symbol,
      horizon: payload.horizon,
      status: "pending",
      scheduled_at: new Date().toISOString(),
    };
  };
}

function contextItem(id: string): WeightedContextItem {
  return {
    item_id: id,
    source_type: "signal",
    evidence_ref: { ref_type: "signal", ref_id: id },
    summary: `Signal ${id}`,
    confidence: 0.7,
    relevance_weight: 0.9,
    freshness_weight: 0.8,
    source_quality_weight: 0.85,
    verification_status: "verified",
    composite_weight: 0.6,
  };
}

test("InsightExplorationGraph persists pending InsightCandidate with evidence refs", async () => {
  let persistedPayload: InsightCandidatePayload | null = null;
  const scheduledPayloads: ScheduleInsightCandidateOutcomePayload[] = [];
  const fetchCalls: string[] = [];

  const result = await new InsightExplorationGraph({
    fetchSnapshots: async () => [
      {
        snapshot_id: "snap-1",
        symbol: "TSLA",
        asof_ts: "2026-06-02T10:00:00Z",
        items_json: [contextItem("sig-1")],
      },
    ],
    fetchOutcomes: async () => [
      {
        outcome_id: "out-1",
        decision_id: "dec-1",
        symbol: "TSLA",
        horizon: "1d",
        path: "model_path",
        status: "labeled",
        label: "positive",
        labeled_at: "2026-06-01T12:00:00Z",
      } satisfies EvaluationOutcomeRow,
    ],
    persist: async (payload) => {
      persistedPayload = payload;
      fetchCalls.push("POST /insight-candidates");
      return { ...payload, created_at: "2026-06-02T12:00:00Z" };
    },
    scheduleOutcome: mockScheduleOutcome(scheduledPayloads),
    llm: {
      async generateDecisionEnvelope() {
        throw new Error("decision path not used");
      },
      async generateInsightProposal() {
        return {
          thesis: "Momentum and labeled outcomes align",
          evidence_refs: [{ ref_type: "signal", ref_id: "sig-1" }],
          weight_cap: DEFAULT_INSIGHT_WEIGHT_CAP,
          candidate_json: {
            status: "candidate",
            auto_promotion: false,
            confidence: 0.4,
          },
        };
      },
    },
  }).explore({
    symbol: "TSLA",
    window: "30d",
    run_id: "run-insight-1",
  });

  assert.equal(result.run_id, "run-insight-1");
  assert.ok(result.react_steps.some((step) => step.tool === "query_context_items"));
  assert.ok(result.react_steps.some((step) => step.tool === "query_outcomes"));
  assert.ok(persistedPayload);
  assert.equal(persistedPayload?.verification_status, INSIGHT_VERIFICATION_STATUS);
  assert.ok((persistedPayload?.evidence_refs_json.length ?? 0) > 0);
  assert.equal(persistedPayload?.weight_cap, DEFAULT_INSIGHT_WEIGHT_CAP);
  assert.equal(result.proposal.candidate_json.auto_promotion, false);

  assert.equal(scheduledPayloads.length, 1);
  assert.equal(scheduledPayloads[0]?.insight_id, persistedPayload?.insight_id);
  assert.ok(result.scheduled_outcome);
});

test("InsightExplorationGraph does not call forbidden lesson/trade/train/promote APIs", async () => {
  const ALLOWED_MUTATION_PATHS = [
    "/stage1/insight-candidates",
    "/stage1/insight-candidate-outcomes/schedule",
  ];

  const fetchCalls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const call = await captureFetchCall(input, init ?? {});
    fetchCalls.push(`${call.method} ${call.url}`);
    const url = call.url;
    if (url.includes("/stage1/insight-candidates") && call.method === "POST") {
      return new Response(
        JSON.stringify({
          insight_id: "ins-mock",
          verification_status: "pending",
          weight_cap: DEFAULT_INSIGHT_WEIGHT_CAP,
          evidence_refs_json: [],
          candidate_json: {},
          symbols_json: '["TSLA"]',
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/stage1/insight-candidate-outcomes/schedule") && call.method === "POST") {
      return new Response(
        JSON.stringify({
          items: [{
            outcome_id: "oco-mock",
            insight_id: "ins-mock",
            symbol: "TSLA",
            horizon: "2m",
            status: "pending",
            scheduled_at: new Date().toISOString(),
          }],
          count: 1,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/stage1/context-snapshots")) {
      return new Response(JSON.stringify({ items: [], count: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/stage1/decision-outcomes")) {
      return new Response(JSON.stringify({ items: [], count: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    await new InsightExplorationGraph({
      llm: {
        async generateDecisionEnvelope() {
          throw new Error("not used");
        },
        async generateInsightProposal() {
          return {
            thesis: "mock",
            evidence_refs: [{ ref_type: "signal", ref_id: "sig-1" }],
            weight_cap: DEFAULT_INSIGHT_WEIGHT_CAP,
            candidate_json: { status: "candidate", auto_promotion: false },
          };
        },
      },
    }).explore({ symbol: "TSLA", window: "7d", persist: true });
  } finally {
    globalThis.fetch = originalFetch;
  }

  for (const call of fetchCalls) {
    for (const fragment of FORBIDDEN_STAGE1_PATH_FRAGMENTS) {
      assert.equal(
        call.includes(fragment),
        false,
        `forbidden API call detected: ${call}`,
      );
    }
  }

  const postCalls = fetchCalls.filter((c) => c.startsWith("POST "));
  for (const postCall of postCalls) {
    const isAllowed = ALLOWED_MUTATION_PATHS.some((p) => postCall.includes(p));
    assert.ok(isAllowed, `unexpected POST mutation detected: ${postCall}`);
  }
  assert.ok(
    postCalls.some((c) => c.includes("/insight-candidates")),
    "expected persist mutation to /insight-candidates",
  );
  assert.ok(
    postCalls.some((c) => c.includes("/insight-candidate-outcomes/schedule")),
    "expected scheduling mutation to /insight-candidate-outcomes/schedule",
  );
});

test("InsightExplorationGraph rejects proposals above weight cap", async () => {
  const scheduledPayloads: ScheduleInsightCandidateOutcomePayload[] = [];
  const result = await new InsightExplorationGraph({
    fetchSnapshots: async () => [
      {
        snapshot_id: "snap-2",
        symbol: "TSLA",
        asof_ts: "2026-06-02T10:00:00Z",
        items_json: [contextItem("sig-2")],
      },
    ],
    fetchOutcomes: async () => [],
    persist: async (payload) => ({ ...payload, created_at: "2026-06-02T12:00:00Z" }),
    scheduleOutcome: mockScheduleOutcome(scheduledPayloads),
    llm: {
      async generateDecisionEnvelope() {
        throw new Error("not used");
      },
      async generateInsightProposal() {
        return {
          thesis: "too aggressive",
          evidence_refs: [{ ref_type: "signal", ref_id: "sig-2" }],
          weight_cap: 5,
          candidate_json: { confidence: 2, status: "candidate", auto_promotion: false },
        };
      },
    },
  }).explore({ symbol: "TSLA", window: "30d" });

  assert.equal(result.proposal.weight_cap, DEFAULT_INSIGHT_WEIGHT_CAP);
  assert.equal(result.proposal.candidate_json.confidence, DEFAULT_INSIGHT_WEIGHT_CAP);
});

test("InsightExplorationGraph can skip persistence for dry runs", async () => {
  let persisted = false;
  const scheduledPayloads: ScheduleInsightCandidateOutcomePayload[] = [];
  const result = await new InsightExplorationGraph({
    fetchSnapshots: async () => [],
    fetchOutcomes: async () => [],
    persist: async () => {
      persisted = true;
      throw new Error("should not persist");
    },
    scheduleOutcome: mockScheduleOutcome(scheduledPayloads),
    llm: {
      async generateDecisionEnvelope() {
        throw new Error("not used");
      },
      async generateInsightProposal() {
        return {
          thesis: "dry run",
          evidence_refs: [],
          weight_cap: DEFAULT_INSIGHT_WEIGHT_CAP,
          candidate_json: { status: "candidate" },
        };
      },
    },
  }).explore({ symbol: "TSLA", window: "30d", persist: false });

  assert.equal(persisted, false);
  assert.equal(result.persisted_candidate, null);
  assert.equal(scheduledPayloads.length, 0, "scheduling must not be called in dry-run mode");
  assert.equal(result.scheduled_outcome, null);
});

test("insightExplorationGraph export exposes native business node names", () => {
  const nodeNames = insightExplorationGraph.getGraph().nodes;
  for (const name of INSIGHT_EXPLORATION_GRAPH_NODE_NAMES) {
    assert.ok(nodeNames[name], `missing node ${name}`);
  }
});

test("buildInsightExplorationGraph exposes pipeline invoke entry", () => {
  const compiled = buildInsightExplorationGraph();
  assert.equal(typeof compiled.invoke, "function");
  assert.ok(compiled.getGraph().nodes.normalize_input);
});

test("buildInsightExplorationGraphPipeline orders steps to match node names", () => {
  const pipeline = buildInsightExplorationGraphPipeline();
  assert.equal(pipeline.steps.length, INSIGHT_EXPLORATION_GRAPH_NODE_NAMES.length);
  assert.equal(pipeline.name, "InsightExplorationGraph");
});

test("runInsightExplorationGraph invokes the pipeline path", async () => {
  const scheduledPayloads: ScheduleInsightCandidateOutcomePayload[] = [];
  const result = await runInsightExplorationGraph(
    { symbol: "TSLA", window: "30d", run_id: "run-insight-compiled", persist: false },
    {
      fetchSnapshots: async () => [],
      fetchOutcomes: async () => [],
      scheduleOutcome: mockScheduleOutcome(scheduledPayloads),
      llm: {
        async generateDecisionEnvelope() {
          throw new Error("not used");
        },
        async generateInsightProposal() {
          return {
            thesis: "compiled path",
            evidence_refs: [],
            weight_cap: DEFAULT_INSIGHT_WEIGHT_CAP,
            candidate_json: { status: "candidate", auto_promotion: false },
          };
        },
      },
    },
  );

  assert.equal(result.run_id, "run-insight-compiled");
  assert.ok(result.insight_id);
  assert.equal(result.persisted_candidate, null);
  assert.equal(result.scheduled_outcome, null);
  assert.equal(scheduledPayloads.length, 0);
});

test("S3: scheduleInsightCandidateOutcome is called after persistence with correct payload", async () => {
  const scheduledPayloads: ScheduleInsightCandidateOutcomePayload[] = [];
  let persistedPayload: InsightCandidatePayload | null = null;

  const result = await runInsightExplorationGraph(
    { symbol: "NVDA", window: "14d", run_id: "run-schedule-test", persist: true },
    {
      fetchSnapshots: async () => [
        {
          snapshot_id: "snap-sched",
          symbol: "NVDA",
          asof_ts: "2026-06-02T10:00:00Z",
          items_json: [contextItem("sig-sched-1"), contextItem("sig-sched-2")],
        },
      ],
      fetchOutcomes: async () => [],
      persist: async (payload) => {
        persistedPayload = payload;
        return { ...payload, created_at: "2026-06-02T12:00:00Z" };
      },
      scheduleOutcome: mockScheduleOutcome(scheduledPayloads),
      llm: {
        async generateDecisionEnvelope() {
          throw new Error("not used");
        },
        async generateInsightProposal() {
          return {
            thesis: "NVDA scheduling test thesis",
            evidence_refs: [
              { ref_type: "signal", ref_id: "sig-sched-1" },
              { ref_type: "signal", ref_id: "sig-sched-2" },
            ],
            weight_cap: DEFAULT_INSIGHT_WEIGHT_CAP,
            candidate_json: { status: "candidate", auto_promotion: false },
          };
        },
      },
    },
  );

  assert.ok(persistedPayload, "candidate must be persisted");
  assert.equal(scheduledPayloads.length, 1, "exactly one outcome must be scheduled");

  const sched = scheduledPayloads[0]!;
  assert.equal(sched.insight_id, persistedPayload!.insight_id);
  assert.equal(sched.symbol, "NVDA");
  assert.ok(
    (INSIGHT_CANDIDATE_OUTCOME_HORIZONS as readonly string[]).includes(sched.horizon),
    `scheduled horizon "${sched.horizon}" must be in whitelist`,
  );
  assert.ok(Array.isArray(sched.evidence_refs), "evidence_refs must be an array");
  assert.ok(sched.evidence_refs!.length > 0, "evidence_refs must not be empty");
  assert.ok(result.scheduled_outcome, "result must contain scheduled_outcome");
  assert.equal(result.scheduled_outcome?.insight_id, persistedPayload!.insight_id);
});

test("S3: scheduling uses 2m default horizon when payload has no explicit horizon", async () => {
  const scheduledPayloads: ScheduleInsightCandidateOutcomePayload[] = [];

  await runInsightExplorationGraph(
    { symbol: "AAPL", window: "7d", run_id: "run-horizon-default", persist: true },
    {
      fetchSnapshots: async () => [],
      fetchOutcomes: async () => [],
      persist: async (payload) => ({ ...payload, created_at: "2026-06-05T00:00:00Z" }),
      scheduleOutcome: mockScheduleOutcome(scheduledPayloads),
      llm: {
        async generateDecisionEnvelope() {
          throw new Error("not used");
        },
        async generateInsightProposal() {
          return {
            thesis: "horizon default test",
            evidence_refs: [],
            weight_cap: DEFAULT_INSIGHT_WEIGHT_CAP,
            candidate_json: { status: "candidate", auto_promotion: false },
          };
        },
      },
    },
  );

  assert.equal(scheduledPayloads.length, 1);
  assert.equal(scheduledPayloads[0]?.horizon, "2m", "default horizon must be 2m per D112");
});

test("S3: scheduleOutcome failure after persist throws InsightSchedulingError with recovery info", async () => {
  let persistCalled = false;

  await assert.rejects(
    () =>
      runInsightExplorationGraph(
        { symbol: "GOOG", window: "7d", run_id: "run-sched-fail", persist: true },
        {
          fetchSnapshots: async () => [],
          fetchOutcomes: async () => [],
          persist: async (payload) => {
            persistCalled = true;
            return { ...payload, created_at: "2026-06-05T00:00:00Z" };
          },
          scheduleOutcome: async () => {
            throw new Error("backend_unavailable: schedule endpoint timeout");
          },
          llm: {
            async generateDecisionEnvelope() {
              throw new Error("not used");
            },
            async generateInsightProposal() {
              return {
                thesis: "scheduling failure test",
                evidence_refs: [],
                weight_cap: DEFAULT_INSIGHT_WEIGHT_CAP,
                candidate_json: { status: "candidate", auto_promotion: false },
              };
            },
          },
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof InsightSchedulingError, "must throw InsightSchedulingError");
      assert.ok(error.insight_id, "error must carry insight_id for retry");
      assert.equal(error.horizon, "2m", "error must carry the attempted horizon");
      assert.equal(error.persisted, true, "error must indicate candidate was persisted");
      assert.ok(error.schedulePayload, "error must carry the full schedule payload for retry");
      assert.ok(error.cause, "error must preserve original cause");
      return true;
    },
  );

  assert.equal(persistCalled, true, "persist must have been called before schedule failed");
});

function mockEvaluationReport(overrides?: {
  report_id?: string;
  sections?: Partial<EvaluationReportSections>;
}): EvaluationReportPayload {
  const defaultSections: EvaluationReportSections = {
    decision_performance: { total: 5, by_label: { hit: 3, miss: 2 }, mean_relative_return_pct: 1.5, mean_absolute_return_pct: 2.0 },
    insight_candidate_performance: { total: 0, by_label: {}, hit_rate: null },
    top_positive_patterns: [],
    top_negative_patterns: [],
    failure_modes: [],
    data_gaps: [],
    evidence_refs: ["decision_outcomes: 5 labeled records"],
  };
  return {
    report_id: overrides?.report_id ?? "eval-mock-1",
    model_version: "stage1-v0",
    window_start: "2026-05-01T00:00:00Z",
    window_end: "2026-06-01T00:00:00Z",
    metrics_json: {
      model_path: { path: "model_path", total_count: 5, labeled_count: 5, skipped_count: 0, failed_count: 0, mean_relative_return_pct: 1.5, mean_absolute_return_pct: 2.0, positive_label_count: 3, negative_label_count: 2 },
      override_path: { path: "override_path", total_count: 0, labeled_count: 0, skipped_count: 0, failed_count: 0, mean_relative_return_pct: null, mean_absolute_return_pct: null, positive_label_count: 0, negative_label_count: 0 },
      delta_human_value: { paired_horizon_count: 0, mean_delta_relative_return_pct: null, override_better_count: 0, model_better_count: 0 },
    },
    recommendation: "hold",
    sections: { ...defaultSections, ...(overrides?.sections ?? {}) },
    report_json: { auto_promotion: false },
  };
}

test("S1: InsightExplorationGraph fetches and uses evaluation report when provided", async () => {
  let persistedPayload: InsightCandidatePayload | null = null;
  const scheduledPayloads: ScheduleInsightCandidateOutcomePayload[] = [];
  let reportFetched = false;

  const report = mockEvaluationReport({
    report_id: "eval-report-s1",
    sections: {
      failure_modes: ["timing too late on reversal"],
    },
  });

  const result = await runInsightExplorationGraph(
    {
      symbol: "TSLA",
      window: "30d",
      run_id: "run-eval-report",
      evaluation_report_id: "eval-report-s1",
      persist: true,
    },
    {
      fetchSnapshots: async () => [
        {
          snapshot_id: "snap-eval",
          symbol: "TSLA",
          asof_ts: "2026-06-02T10:00:00Z",
          items_json: [contextItem("sig-eval")],
        },
      ],
      fetchOutcomes: async () => [],
      fetchEvaluationReport: async () => {
        reportFetched = true;
        return report;
      },
      persist: async (payload) => {
        persistedPayload = payload;
        return { ...payload, created_at: "2026-06-02T12:00:00Z" };
      },
      scheduleOutcome: mockScheduleOutcome(scheduledPayloads),
      llm: {
        async generateDecisionEnvelope() {
          throw new Error("not used");
        },
        async generateInsightProposal() {
          return {
            thesis: "Evaluation-driven insight",
            evidence_refs: [{ ref_type: "signal", ref_id: "sig-eval" }],
            weight_cap: DEFAULT_INSIGHT_WEIGHT_CAP,
            origin_category: "failure_mode" as const,
            horizon: "5m",
            candidate_json: { status: "candidate", auto_promotion: false, confidence: 0.4 },
          };
        },
      },
    },
  );

  assert.ok(reportFetched, "evaluation report must be fetched");
  assert.ok(persistedPayload, "candidate must be persisted");
  assert.equal(persistedPayload?.candidate_json.origin_category, "failure_mode");
  assert.equal(persistedPayload?.candidate_json.horizon, "5m");
  assert.equal(persistedPayload?.candidate_json.horizon_source, "explicit");
  assert.ok(persistedPayload?.candidate_json.alpha_seed);
  assert.equal(
    (persistedPayload?.candidate_json.alpha_seed as { schema_version: string }).schema_version,
    "alpha_seed.v1",
  );
  assert.ok(result.proposal);
});

test("S1: exploration continues when evaluation report fetch fails", async () => {
  const scheduledPayloads: ScheduleInsightCandidateOutcomePayload[] = [];
  const result = await runInsightExplorationGraph(
    { symbol: "TSLA", window: "7d", run_id: "run-eval-fail", persist: false },
    {
      fetchSnapshots: async () => [],
      fetchOutcomes: async () => [],
      fetchEvaluationReport: async () => {
        throw new Error("evaluation report API unavailable");
      },
      scheduleOutcome: mockScheduleOutcome(scheduledPayloads),
      llm: {
        async generateDecisionEnvelope() {
          throw new Error("not used");
        },
        async generateInsightProposal() {
          return {
            thesis: "fallback without eval report",
            evidence_refs: [],
            weight_cap: DEFAULT_INSIGHT_WEIGHT_CAP,
            candidate_json: { status: "candidate", auto_promotion: false },
          };
        },
      },
    },
  );

  assert.ok(result.proposal, "graph must still produce a proposal");
  assert.equal(result.run_id, "run-eval-fail");
});

test("S2: resolveInsightHorizon picks valid horizon from whitelist", () => {
  for (const h of INSIGHT_CANDIDATE_HORIZONS) {
    const result = resolveInsightHorizon({ horizon: h });
    assert.equal(result.horizon, h);
    assert.equal(result.horizon_source, "explicit");
  }
});

test("S2: resolveInsightHorizon defaults to 2m for ambiguous or missing horizon", () => {
  assert.deepEqual(resolveInsightHorizon({ horizon: "3m" }), { horizon: "2m", horizon_source: "default_2m" });
  assert.deepEqual(resolveInsightHorizon({ horizon: "1w" }), { horizon: "2m", horizon_source: "default_2m" });
  assert.deepEqual(resolveInsightHorizon({ horizon: "30d" }), { horizon: "2m", horizon_source: "default_2m" });
  assert.deepEqual(resolveInsightHorizon({}), { horizon: "2m", horizon_source: "default_2m" });
  assert.deepEqual(resolveInsightHorizon({ horizon: 42 }), { horizon: "2m", horizon_source: "default_2m" });
});

test("S2: deriveOriginCategory maps evaluation report sections correctly", () => {
  assert.equal(
    deriveOriginCategory({ failure_modes: ["timing issue"], top_positive_patterns: [], top_negative_patterns: [], data_gaps: [], decision_performance: { total: 0, by_label: {}, mean_relative_return_pct: null, mean_absolute_return_pct: null }, insight_candidate_performance: { total: 0, by_label: {}, hit_rate: null }, evidence_refs: [] }),
    "failure_mode",
  );
  assert.equal(
    deriveOriginCategory({ failure_modes: [], top_positive_patterns: ["momentum strong"], top_negative_patterns: [], data_gaps: [], decision_performance: { total: 0, by_label: {}, mean_relative_return_pct: null, mean_absolute_return_pct: null }, insight_candidate_performance: { total: 0, by_label: {}, hit_rate: null }, evidence_refs: [] }),
    "positive_pattern",
  );
  assert.equal(
    deriveOriginCategory({ failure_modes: [], top_positive_patterns: [], top_negative_patterns: [], data_gaps: ["missing volume data"], decision_performance: { total: 0, by_label: {}, mean_relative_return_pct: null, mean_absolute_return_pct: null }, insight_candidate_performance: { total: 0, by_label: {}, hit_rate: null }, evidence_refs: [] }),
    "data_gap",
  );
  assert.equal(
    deriveOriginCategory({ failure_modes: [], top_positive_patterns: [], top_negative_patterns: [], data_gaps: [], decision_performance: { total: 0, by_label: {}, mean_relative_return_pct: null, mean_absolute_return_pct: null }, insight_candidate_performance: { total: 0, by_label: {}, hit_rate: null }, evidence_refs: [] }),
    "mixed",
  );
  assert.equal(deriveOriginCategory(null), "mixed");
  assert.equal(deriveOriginCategory(undefined), "mixed");
});

test("S2: buildInsightCandidatePayload includes origin_category, horizon, horizon_source", () => {
  const payload = buildInsightCandidatePayload({
    run_id: "run-payload-test",
    symbol: "TSLA",
    window: parseExplorationWindow("30d"),
    proposal: {
      thesis: "horizon and origin test",
      evidence_refs: [{ ref_type: "signal", ref_id: "sig-1" }],
      weight_cap: DEFAULT_INSIGHT_WEIGHT_CAP,
      origin_category: "failure_mode",
      horizon: "5m",
      candidate_json: { status: "candidate", auto_promotion: false },
    },
  });

  assert.equal(payload.candidate_json.origin_category, "failure_mode");
  assert.equal(payload.candidate_json.horizon, "5m");
  assert.equal(payload.candidate_json.horizon_source, "explicit");
});

test("S2: buildInsightCandidatePayload defaults to 2m when proposal has no valid horizon", () => {
  const payload = buildInsightCandidatePayload({
    run_id: "run-default-horizon",
    symbol: "NVDA",
    window: parseExplorationWindow("7d"),
    proposal: {
      thesis: "no horizon given",
      evidence_refs: [],
      weight_cap: DEFAULT_INSIGHT_WEIGHT_CAP,
      candidate_json: { status: "candidate", auto_promotion: false },
    },
  });

  assert.equal(payload.candidate_json.horizon, DEFAULT_INSIGHT_HORIZON);
  assert.equal(payload.candidate_json.horizon_source, "default_2m");
  assert.equal(payload.candidate_json.origin_category, "mixed");
});

test("S2: heuristic proposal derives origin_category from evaluation report", async () => {
  const scheduledPayloads: ScheduleInsightCandidateOutcomePayload[] = [];
  let persistedPayload: InsightCandidatePayload | null = null;

  const report = mockEvaluationReport({
    sections: {
      failure_modes: ["reversal timing lag"],
      top_positive_patterns: [],
    },
  });

  await runInsightExplorationGraph(
    { symbol: "TSLA", window: "30d", run_id: "run-heuristic-origin", persist: true },
    {
      fetchSnapshots: async () => [
        {
          snapshot_id: "snap-h",
          symbol: "TSLA",
          asof_ts: "2026-06-02T10:00:00Z",
          items_json: [contextItem("sig-h")],
        },
      ],
      fetchOutcomes: async () => [],
      fetchEvaluationReport: async () => report,
      persist: async (payload) => {
        persistedPayload = payload;
        return { ...payload, created_at: "2026-06-02T12:00:00Z" };
      },
      scheduleOutcome: mockScheduleOutcome(scheduledPayloads),
      llm: {
        async generateDecisionEnvelope() {
          throw new Error("not used");
        },
        async generateInsightProposal() {
          throw new Error("force heuristic fallback");
        },
      },
    },
  );

  assert.ok(persistedPayload, "candidate must be persisted");
  assert.equal(persistedPayload?.candidate_json.origin_category, "failure_mode",
    "heuristic must derive origin_category from evaluation report failure_modes");
});

test("S4: InsightExplorationGraph never reads raw market/news data directly", async () => {
  const fetchCalls: string[] = [];
  const originalFetch = globalThis.fetch;

  const RAW_DATA_PATH_FRAGMENTS = [
    "/market/bars",
    "/market/quotes",
    "/api/intel/news",
    "/raw-signals",
    "/api/intel/market/",
  ];

  globalThis.fetch = (async (input, init) => {
    const call = await captureFetchCall(input, init ?? {});
    fetchCalls.push(`${call.method} ${call.url}`);
    const url = call.url;
    if (url.includes("/stage1/insight-candidates") && call.method === "POST") {
      return new Response(
        JSON.stringify({
          insight_id: "ins-raw-check",
          verification_status: "pending",
          weight_cap: DEFAULT_INSIGHT_WEIGHT_CAP,
          evidence_refs_json: [],
          candidate_json: {},
          symbols_json: '["TSLA"]',
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/stage1/insight-candidate-outcomes/schedule") && call.method === "POST") {
      return new Response(
        JSON.stringify({
          items: [{
            outcome_id: "oco-raw-check",
            insight_id: "ins-raw-check",
            symbol: "TSLA",
            horizon: "2m",
            status: "pending",
          }],
          count: 1,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/stage1/context-snapshots")) {
      return new Response(JSON.stringify({ items: [], count: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/stage1/decision-outcomes")) {
      return new Response(JSON.stringify({ items: [], count: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    await new InsightExplorationGraph({
      llm: {
        async generateDecisionEnvelope() {
          throw new Error("not used");
        },
        async generateInsightProposal() {
          return {
            thesis: "raw data check",
            evidence_refs: [],
            weight_cap: DEFAULT_INSIGHT_WEIGHT_CAP,
            candidate_json: { status: "candidate", auto_promotion: false },
          };
        },
      },
    }).explore({ symbol: "TSLA", window: "7d", persist: true });
  } finally {
    globalThis.fetch = originalFetch;
  }

  for (const call of fetchCalls) {
    for (const fragment of RAW_DATA_PATH_FRAGMENTS) {
      assert.equal(
        call.includes(fragment),
        false,
        `InsightExplorationGraph must not read raw data: ${call}`,
      );
    }
  }
});
