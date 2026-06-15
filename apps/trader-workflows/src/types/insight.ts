import type { EvidenceRef, WeightedContextItem } from "./context.js";
import type {
  EvaluationOutcomeRow,
  EvaluationReportPayload,
  EvaluationReportSections,
} from "./evaluation.js";

/** Mirrors `CandidateFamily` in services/candidateFamilies.ts for type-layer isolation. */
export type CandidateFamily =
  | "momentum_trend"
  | "mean_reversion"
  | "event_driven"
  | "liquidity_flow_microstructure"
  | "relative_value_lead_lag"
  | "cross_sectional_filter";

export const INSIGHT_CANDIDATE_HORIZONS = ["1m", "2m", "5m", "30m", "1h", "2h", "4h"] as const;
export type InsightCandidateHorizon = (typeof INSIGHT_CANDIDATE_HORIZONS)[number];
export const DEFAULT_INSIGHT_HORIZON: InsightCandidateHorizon = "2m";

export type InsightCandidateOriginCategory = "failure_mode" | "positive_pattern" | "data_gap" | "mixed";

export const ALPHA_SEED_SCHEMA_VERSION = "alpha_seed.v1" as const;

export interface AlphaSeedV1 {
  schema_version: typeof ALPHA_SEED_SCHEMA_VERSION;
  candidate_family: CandidateFamily;
  mechanism: string;
  trigger_hint: string;
  entry_condition_hint: string;
  invalidation_hint: string;
  required_evidence_hint: string[];
  risk_notes?: string[];
  exit_condition_hint?: string;
}

export type InsightReActToolName =
  | "query_context_items"
  | "query_outcomes"
  | "propose_insight";

export interface ParsedExplorationWindow {
  window: string;
  window_start: string;
  window_end: string;
}

export interface InsightCandidatePayload {
  insight_id: string;
  run_id: string | null;
  symbols_json: string[];
  window_start: string;
  window_end: string;
  thesis: string;
  evidence_refs_json: EvidenceRef[];
  verification_status: "pending";
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
  origin_category?: InsightCandidateOriginCategory;
  horizon?: string;
  candidate_json: Record<string, unknown>;
}

export interface InsightReActStepRecord {
  step: number;
  tool: InsightReActToolName;
  input: Record<string, unknown>;
  observation: unknown;
}

export interface InsightReActDeciderInput {
  symbol: string;
  steps: InsightReActStepRecord[];
  contextItems: WeightedContextItem[];
  outcomes: EvaluationOutcomeRow[];
  exploration_prompt?: string;
  evaluation_report?: EvaluationReportPayload | null;
}

export type InsightReActDecider = (
  input: InsightReActDeciderInput,
) => Promise<InsightReActToolName | "complete">;

export type { EvaluationReportSections };
