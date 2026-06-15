export const INSIGHT_CANDIDATE_OUTCOME_HORIZONS = [
  "1m", "2m", "5m", "30m", "1h", "2h", "4h",
] as const;
export type InsightCandidateOutcomeHorizon = (typeof INSIGHT_CANDIDATE_OUTCOME_HORIZONS)[number];

export type OutcomeFinalStatus = "labeled" | "skipped" | "failed";
export type OutcomeSourceType = "decision" | "insight_candidate";
export type BarrierResult =
  | "hit_profit_first"
  | "hit_stop_first"
  | "hit_time_first"
  | "none";
export type NormalizedOutcomeLabel =
  | "hit"
  | "miss"
  | "neutral"
  | "invalid"
  | "insufficient_data";

export interface DecisionOutcomeRow {
  outcome_id: string;
  decision_id: string;
  symbol: string;
  horizon: string;
  path: string;
  status: string;
  due_at?: string | null;
  scheduled_at?: string | null;
  label?: string | null;
  barrier_result?: BarrierResult | null;
  created_at?: string;
}

export interface InsightCandidateOutcomeRow {
  outcome_id: string;
  insight_id: string;
  symbol: string;
  horizon: string;
  status: string;
  due_at?: string | null;
  scheduled_at?: string | null;
  normalized_label?: string | null;
  metrics_json?: Record<string, unknown> | null;
  reason_codes_json?: string[] | null;
  evidence_refs_json?: unknown[] | null;
  outcome_json?: Record<string, unknown> | null;
  created_at?: string;
  labeled_at?: string | null;
}

export type OutcomeRow = DecisionOutcomeRow | InsightCandidateOutcomeRow;

export interface MarketBar {
  ts: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
}

export interface OutcomeLabelMetrics {
  reference_price: number;
  future_price: number;
  absolute_return_pct: number;
  benchmark_symbol: string;
  benchmark_return_pct: number;
  relative_return_pct: number;
  hit_invalidation_proxy: boolean;
  hit_target_proxy: boolean;
  barrier_result: BarrierResult;
  label: string;
}

export interface OutcomeLabelPayload extends OutcomeLabelMetrics {
  status: OutcomeFinalStatus;
  outcome_json: Record<string, unknown>;
}

export interface ScheduleInsightCandidateOutcomePayload {
  insight_id: string;
  symbol: string;
  horizon: InsightCandidateOutcomeHorizon;
  evidence_refs?: unknown[];
  reason_codes?: string[];
  outcome_json?: Record<string, unknown>;
}

export interface InsightCandidateOutcomeLabelPayload {
  status: OutcomeFinalStatus;
  normalized_label: NormalizedOutcomeLabel;
  reason_codes_json?: string[];
  outcome_json?: Record<string, unknown>;
}
