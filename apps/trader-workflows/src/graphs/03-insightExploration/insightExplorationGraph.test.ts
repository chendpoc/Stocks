import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInsightExplorationGraph,
  INSIGHT_EXPLORATION_GRAPH_NODE_NAMES,
  insightExplorationGraph,
  runInsightExplorationGraph,
} from "./insightExplorationGraph.js";
import { InsightExplorationGraph } from "./insightExplorationGraph.types.js";
import {
  DEFAULT_INSIGHT_WEIGHT_CAP,
  INSIGHT_VERIFICATION_STATUS,
  type InsightCandidatePayload,
} from "../../services/insightCandidates.js";
import type { WeightedContextItem } from "../../services/contextSnapshots.js";
import type { EvaluationOutcomeRow } from "../../services/evaluation.js";

const FORBIDDEN_STAGE1_PATH_FRAGMENTS = [
  "/lessons",
  "/trade",
  "/train",
  "/promote",
  "/accepted-lessons",
  "/paper-execution",
];

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
});

test("InsightExplorationGraph does not call forbidden lesson/trade/train/promote APIs", async () => {
  const fetchCalls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    fetchCalls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.includes("/stage1/insight-candidates") && init?.method === "POST") {
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
});

test("InsightExplorationGraph rejects proposals above weight cap", async () => {
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
  const result = await new InsightExplorationGraph({
    fetchSnapshots: async () => [],
    fetchOutcomes: async () => [],
    persist: async () => {
      persisted = true;
      throw new Error("should not persist");
    },
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
});

test("insightExplorationGraph export exposes native business node names", () => {
  const nodeNames = insightExplorationGraph.getGraph().nodes;
  for (const name of INSIGHT_EXPLORATION_GRAPH_NODE_NAMES) {
    assert.ok(nodeNames[name], `missing node ${name}`);
  }
});

test("buildInsightExplorationGraph compiles without hand-written class flow", () => {
  const compiled = buildInsightExplorationGraph();
  assert.equal(typeof compiled.invoke, "function");
  assert.ok(compiled.getGraph().nodes.normalize_input);
});

test("runInsightExplorationGraph invokes the compiled StateGraph path", async () => {
  const result = await runInsightExplorationGraph(
    { symbol: "TSLA", window: "30d", run_id: "run-insight-compiled", persist: false },
    {
      fetchSnapshots: async () => [],
      fetchOutcomes: async () => [],
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
});
