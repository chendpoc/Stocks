import { randomUUID } from "node:crypto";

import { fetchStage1 } from "../../api/client.js";
import { listContextSnapshots } from "../context/snapshots.js";
import { MAX_COMPOSITE_WEIGHT } from "../context/weighting.js";
import { fetchDecisionOutcomesForEvaluation } from "../evaluation.js";
import type {
  ContextSnapshotRecord,
  EvidenceRef,
  WeightedContextItem,
} from "../context/types.js";
import type {
  EvaluationOutcomeRow,
  EvaluationReportPayload,
  EvaluationReportSections,
} from "./types.js";
import type {
  InsightCandidateHorizon,
  InsightCandidateOriginCategory,
  InsightCandidatePayload,
  InsightCandidateRecord,
  InsightProposal,
  InsightReActDecider,
  InsightReActDeciderInput,
  InsightReActStepRecord,
  InsightReActToolName,
  ParsedExplorationWindow,
} from "./types.js";
import {
  DEFAULT_INSIGHT_HORIZON,
  INSIGHT_CANDIDATE_HORIZONS,
} from "./types.js";
import { buildAlphaSeedV1 } from "./seeds.js";

export const DEFAULT_INSIGHT_WEIGHT_CAP = 0.5;
export const INSIGHT_VERIFICATION_STATUS = "pending" as const;

export function parseExplorationWindow(
  window: string,
  now: Date = new Date(),
): ParsedExplorationWindow {
  const normalized = window.trim().toLowerCase();
  const match = /^(\d+)(d|h)$/.exec(normalized);
  if (!match) {
    throw new Error(
      `Invalid exploration window "${window}" (expected format like 30d or 7d)`,
    );
  }
  const amount = Number.parseInt(match[1] ?? "", 10);
  const unit = match[2];
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid exploration window amount in "${window}"`);
  }

  const window_end = now.toISOString();
  const startMs =
    unit === "d"
      ? now.getTime() - amount * 24 * 60 * 60 * 1000
      : now.getTime() - amount * 60 * 60 * 1000;

  return {
    window: normalized,
    window_start: new Date(startMs).toISOString(),
    window_end,
  };
}

export function clampInsightWeightCap(requested?: number | null): number {
  if (requested === undefined || requested === null) {
    return DEFAULT_INSIGHT_WEIGHT_CAP;
  }
  if (!Number.isFinite(requested)) {
    return DEFAULT_INSIGHT_WEIGHT_CAP;
  }
  return Math.min(
    MAX_COMPOSITE_WEIGHT,
    DEFAULT_INSIGHT_WEIGHT_CAP,
    Math.max(0, requested),
  );
}

export function enforceInsightProposal(proposal: InsightProposal): InsightProposal {
  const weight_cap = clampInsightWeightCap(proposal.weight_cap);
  const confidence =
    typeof proposal.candidate_json.confidence === "number"
      ? proposal.candidate_json.confidence
      : null;
  const cappedConfidence =
    confidence === null ? confidence : Math.min(confidence, weight_cap);

  return {
    ...proposal,
    weight_cap,
    candidate_json: {
      ...proposal.candidate_json,
      ...(cappedConfidence === null ? {} : { confidence: cappedConfidence }),
      weight_cap,
      verification_status: INSIGHT_VERIFICATION_STATUS,
      auto_promotion: false,
    },
  };
}

export function resolveInsightHorizon(candidate_json: Record<string, unknown>): {
  horizon: InsightCandidateHorizon;
  horizon_source: "explicit" | "default_2m";
} {
  const raw = candidate_json.horizon;
  if (
    typeof raw === "string" &&
    (INSIGHT_CANDIDATE_HORIZONS as readonly string[]).includes(raw)
  ) {
    return { horizon: raw as InsightCandidateHorizon, horizon_source: "explicit" };
  }
  return { horizon: DEFAULT_INSIGHT_HORIZON, horizon_source: "default_2m" };
}

export function deriveOriginCategory(
  sections?: EvaluationReportSections | null,
): InsightCandidateOriginCategory {
  if (!sections) return "mixed";
  if (sections.failure_modes.length > 0) return "failure_mode";
  if (sections.top_positive_patterns.length > 0) return "positive_pattern";
  if (sections.data_gaps.length > 0) return "data_gap";
  return "mixed";
}

export function extractWeightedItemsFromSnapshots(
  snapshots: ContextSnapshotRecord[],
): WeightedContextItem[] {
  const items: WeightedContextItem[] = [];
  for (const snapshot of snapshots) {
    items.push(...snapshot.items_json);
  }
  return items.sort((a, b) => b.composite_weight - a.composite_weight);
}

export function filterOutcomesInWindow(
  outcomes: EvaluationOutcomeRow[],
  window: ParsedExplorationWindow,
): EvaluationOutcomeRow[] {
  const startMs = Date.parse(window.window_start);
  const endMs = Date.parse(window.window_end);
  return outcomes.filter((row) => {
    const ts = row.labeled_at ?? row.created_at;
    if (!ts) {
      return true;
    }
    const parsed = Date.parse(ts);
    if (!Number.isFinite(parsed)) {
      return true;
    }
    if (Number.isFinite(startMs) && parsed < startMs) {
      return false;
    }
    if (Number.isFinite(endMs) && parsed > endMs) {
      return false;
    }
    return true;
  });
}

export function buildInsightCandidatePayload(input: {
  insight_id?: string;
  run_id: string;
  symbol: string;
  window: ParsedExplorationWindow;
  proposal: InsightProposal;
}): InsightCandidatePayload {
  const enforced = enforceInsightProposal(input.proposal);
  const candidateJsonWithHorizon = {
    ...enforced.candidate_json,
    ...(enforced.horizon ? { horizon: enforced.horizon } : {}),
  };
  const { horizon, horizon_source } = resolveInsightHorizon(candidateJsonWithHorizon);
  const origin_category = enforced.origin_category ?? "mixed";
  const alpha_seed = buildAlphaSeedV1({
    origin_category,
    thesis: enforced.thesis,
    horizon,
    symbol: input.symbol,
  });
  return {
    insight_id: input.insight_id ?? `ins_${randomUUID().replace(/-/g, "")}`,
    run_id: input.run_id,
    symbols_json: [input.symbol.toUpperCase()],
    window_start: input.window.window_start,
    window_end: input.window.window_end,
    thesis: enforced.thesis,
    evidence_refs_json: enforced.evidence_refs,
    verification_status: INSIGHT_VERIFICATION_STATUS,
    weight_cap: enforced.weight_cap,
    candidate_json: {
      ...enforced.candidate_json,
      origin_category,
      horizon,
      horizon_source,
      alpha_seed,
    },
  };
}

export async function fetchContextSnapshotsForSymbol(input: {
  symbol: string;
  limit?: number;
}): Promise<ContextSnapshotRecord[]> {
  const response = await listContextSnapshots({
    symbol: input.symbol,
    limit: input.limit,
  });
  return response.items;
}

export async function fetchOutcomesForInsight(input: {
  symbol: string;
  limit?: number;
}): Promise<EvaluationOutcomeRow[]> {
  return fetchDecisionOutcomesForEvaluation({
    symbol: input.symbol,
    limit: input.limit ?? 200,
  });
}

export async function fetchLatestEvaluationReportForInsight(input: {
  evaluation_report_id?: string;
  symbol?: string;
  limit?: number;
}): Promise<EvaluationReportPayload | null> {
  if (input.evaluation_report_id) {
    return fetchStage1<EvaluationReportPayload>(
      `/evaluation-reports/${input.evaluation_report_id}`,
    );
  }
  const params = new URLSearchParams();
  if (input.symbol) {
    params.set("symbol", input.symbol.toUpperCase());
  }
  params.set("limit", String(input.limit ?? 1));
  const query = params.toString();
  const response = await fetchStage1<{
    items: EvaluationReportPayload[];
    count: number;
  }>(`/evaluation-reports${query ? `?${query}` : ""}`);
  return response.items[0] ?? null;
}

export async function createInsightCandidate(
  payload: InsightCandidatePayload,
): Promise<InsightCandidateRecord> {
  return fetchStage1<InsightCandidateRecord>("/insight-candidates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function executeInsightReActTool(input: {
  tool: InsightReActToolName;
  symbol: string;
  contextItems: WeightedContextItem[];
  outcomes: EvaluationOutcomeRow[];
  limit?: number;
}): unknown {
  switch (input.tool) {
    case "query_context_items":
      return {
        symbol: input.symbol.toUpperCase(),
        count: Math.min(input.limit ?? 12, input.contextItems.length),
        items: input.contextItems.slice(0, input.limit ?? 12).map((item) => ({
          item_id: item.item_id,
          source_type: item.source_type,
          summary: item.summary,
          composite_weight: item.composite_weight,
          evidence_ref: item.evidence_ref,
        })),
      };
    case "query_outcomes":
      return {
        symbol: input.symbol.toUpperCase(),
        count: input.outcomes.length,
        outcomes: input.outcomes.slice(0, input.limit ?? 50).map((row) => ({
          outcome_id: row.outcome_id,
          horizon: row.horizon,
          path: row.path,
          status: row.status,
          label: row.label ?? null,
          relative_return_pct: row.relative_return_pct ?? null,
        })),
      };
    default:
      throw new Error(`Tool ${input.tool} is handled by the exploration agent, not executeInsightReActTool`);
  }
}

export const defaultInsightReActDecider: InsightReActDecider = async ({ steps }) => {
  const toolsUsed = steps.map((step) => step.tool);
  if (!toolsUsed.includes("query_context_items")) {
    return "query_context_items";
  }
  if (!toolsUsed.includes("query_outcomes")) {
    return "query_outcomes";
  }
  return "complete";
};

export async function runControlledInsightReAct(input: {
  symbol: string;
  contextItems: WeightedContextItem[];
  outcomes: EvaluationOutcomeRow[];
  maxSteps?: number;
  decider?: InsightReActDecider;
  propose?: (args: InsightReActDeciderInput) => Promise<InsightProposal>;
  exploration_prompt?: string;
  evaluation_report?: EvaluationReportPayload | null;
}): Promise<{ steps: InsightReActStepRecord[]; proposal: InsightProposal }> {
  const maxSteps = input.maxSteps ?? 5;
  const decider = input.decider ?? defaultInsightReActDecider;
  const steps: InsightReActStepRecord[] = [];

  while (steps.length < maxSteps) {
    const next = await decider({
      symbol: input.symbol,
      steps,
      contextItems: input.contextItems,
      outcomes: input.outcomes,
      exploration_prompt: input.exploration_prompt,
      evaluation_report: input.evaluation_report,
    });

    if (next === "complete") {
      break;
    }

    if (next === "propose_insight") {
      break;
    }

    const observation = executeInsightReActTool({
      tool: next,
      symbol: input.symbol,
      contextItems: input.contextItems,
      outcomes: input.outcomes,
    });

    steps.push({
      step: steps.length + 1,
      tool: next,
      input: { symbol: input.symbol.toUpperCase() },
      observation,
    });
  }

  const propose =
    input.propose ??
    (async () => {
      throw new Error("Insight proposal generator is required to complete ReAct exploration");
    });

  const proposal = enforceInsightProposal(
    await propose({
      symbol: input.symbol,
      steps,
      contextItems: input.contextItems,
      outcomes: input.outcomes,
      exploration_prompt: input.exploration_prompt,
      evaluation_report: input.evaluation_report,
    }),
  );

  steps.push({
    step: steps.length + 1,
    tool: "propose_insight",
    input: { symbol: input.symbol.toUpperCase() },
    observation: {
      thesis: proposal.thesis,
      evidence_ref_count: proposal.evidence_refs.length,
      weight_cap: proposal.weight_cap,
    },
  });

  return { steps, proposal };
}

export function evidenceRefsFromContextItems(
  items: WeightedContextItem[],
  limit = 8,
): EvidenceRef[] {
  const refs: EvidenceRef[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.evidence_ref.ref_type}:${item.evidence_ref.ref_id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    refs.push(item.evidence_ref);
    if (refs.length >= limit) {
      break;
    }
  }
  return refs;
}

export function buildHeuristicInsightProposal(
  input: InsightReActDeciderInput,
): InsightProposal {
  const topItems = input.contextItems.slice(0, 8);
  const labeled = input.outcomes.filter((row) => row.status === "labeled");
  const positive = labeled.filter((row) => row.label === "positive" || row.label === "target_hit")
    .length;
  const thesis =
    input.exploration_prompt?.trim() ||
    `Observed ${topItems.length} weighted context signals and ${labeled.length} labeled outcomes (${positive} positive) for ${input.symbol.toUpperCase()}.`;

  const origin_category = deriveOriginCategory(input.evaluation_report?.sections);

  return enforceInsightProposal({
    thesis,
    evidence_refs: evidenceRefsFromContextItems(topItems),
    weight_cap: DEFAULT_INSIGHT_WEIGHT_CAP,
    origin_category,
    candidate_json: {
      exploration_prompt: input.exploration_prompt ?? null,
      react_step_count: input.steps.length,
      context_item_count: topItems.length,
      labeled_outcome_count: labeled.length,
      positive_outcome_count: positive,
      confidence: DEFAULT_INSIGHT_WEIGHT_CAP,
      status: "candidate",
      auto_promotion: false,
    },
  });
}
