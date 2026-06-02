import { randomUUID } from "node:crypto";

import { fetchStage1 } from "../api/client.js";
import {
  MAX_COMPOSITE_WEIGHT,
  type EvidenceRef,
  type WeightedContextItem,
} from "./contextSnapshots.js";
import {
  fetchDecisionOutcomesForEvaluation,
  type EvaluationOutcomeRow,
} from "./evaluation.js";

export const DEFAULT_INSIGHT_WEIGHT_CAP = 0.5;
export const INSIGHT_VERIFICATION_STATUS = "pending" as const;

export type InsightReActToolName =
  | "query_context_items"
  | "query_outcomes"
  | "propose_insight";

export interface ParsedExplorationWindow {
  window: string;
  window_start: string;
  window_end: string;
}

export interface ContextSnapshotListRow {
  snapshot_id: string;
  symbol: string;
  asof_ts: string;
  items_json: WeightedContextItem[] | string;
  evidence_refs_json?: EvidenceRef[] | string;
  created_at?: string;
}

export interface InsightCandidatePayload {
  insight_id: string;
  run_id: string | null;
  symbols_json: string[];
  window_start: string;
  window_end: string;
  thesis: string;
  evidence_refs_json: EvidenceRef[];
  verification_status: typeof INSIGHT_VERIFICATION_STATUS;
  weight_cap: number;
  candidate_json: Record<string, unknown>;
}

export interface InsightCandidateRecord extends InsightCandidatePayload {
  created_at?: string;
}

export interface InsightProposal {
  thesis: string;
  evidence_refs: EvidenceRef[];
  weight_cap: number;
  candidate_json: Record<string, unknown>;
}

export interface InsightReActStepRecord {
  step: number;
  tool: InsightReActToolName;
  input: Record<string, unknown>;
  observation: unknown;
}

function parseJsonField<T>(value: T | string): T {
  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }
  return value;
}

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

export function extractWeightedItemsFromSnapshots(
  snapshots: ContextSnapshotListRow[],
): WeightedContextItem[] {
  const items: WeightedContextItem[] = [];
  for (const snapshot of snapshots) {
    const parsed = parseJsonField<WeightedContextItem[]>(snapshot.items_json);
    if (Array.isArray(parsed)) {
      items.push(...parsed);
    }
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
    candidate_json: enforced.candidate_json,
  };
}

export async function fetchContextSnapshotsForSymbol(input: {
  symbol: string;
  limit?: number;
}): Promise<ContextSnapshotListRow[]> {
  const params = new URLSearchParams();
  params.set("symbol", input.symbol.toUpperCase());
  if (input.limit !== undefined) {
    params.set("limit", String(input.limit));
  }
  const response = await fetchStage1<{ items: ContextSnapshotListRow[]; count: number }>(
    `/context-snapshots?${params.toString()}`,
  );
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

export interface InsightReActDeciderInput {
  symbol: string;
  steps: InsightReActStepRecord[];
  contextItems: WeightedContextItem[];
  outcomes: EvaluationOutcomeRow[];
  exploration_prompt?: string;
}

export type InsightReActDecider = (
  input: InsightReActDeciderInput,
) => Promise<InsightReActToolName | "complete">;

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

  return enforceInsightProposal({
    thesis,
    evidence_refs: evidenceRefsFromContextItems(topItems),
    weight_cap: DEFAULT_INSIGHT_WEIGHT_CAP,
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
