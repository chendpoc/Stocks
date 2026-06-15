import type {
  BarrierResult,
  DecisionOutcomeRow,
  InsightCandidateOutcomeRow,
  NormalizedOutcomeLabel,
} from "./outcomes.js";

export type EvaluationRecommendation = "hold" | "needs_more_data";
export type EvaluationPath = "model_path" | "override_path";

export interface EvaluationOutcomeRow extends DecisionOutcomeRow {
  relative_return_pct?: number | null;
  absolute_return_pct?: number | null;
  label?: string | null;
  labeled_at?: string | null;
}

export interface ModelDecisionSummary {
  decision_id: string;
  model_version?: string | null;
  symbol: string;
  created_at?: string;
  human_overrides_json?: unknown[] | null;
}

export interface PathMetrics {
  path: EvaluationPath;
  total_count: number;
  labeled_count: number;
  skipped_count: number;
  failed_count: number;
  mean_relative_return_pct: number | null;
  mean_absolute_return_pct: number | null;
  positive_label_count: number;
  negative_label_count: number;
}

export interface DeltaHumanValue {
  paired_horizon_count: number;
  mean_delta_relative_return_pct: number | null;
  override_better_count: number;
  model_better_count: number;
}

export interface TripleBarrierMetrics {
  total_count: number;
  hit_profit_first_count: number;
  hit_stop_first_count: number;
  hit_time_first_count: number;
  none_count: number;
  profit_first_rate: number | null;
  stop_first_rate: number | null;
  time_first_rate: number | null;
}

export interface EvaluationMetrics {
  model_path: PathMetrics;
  override_path: PathMetrics;
  delta_human_value: DeltaHumanValue;
  triple_barrier?: TripleBarrierMetrics;
  evidence_utility_score?: number | null;
  contra_predictive_power?: number | null;
}

export interface EvaluationReportRecord {
  report_id: string;
  model_version: string;
  window_start: string | null;
  window_end: string | null;
  metrics_json: EvaluationMetrics;
  recommendation: EvaluationRecommendation;
  report_json: Record<string, unknown>;
  evidence_utility_score?: number | null;
  contra_predictive_power?: number | null;
  created_at?: string;
}

export interface DecisionOutcomeSummary {
  decision_id: string;
  symbol: string;
  horizon: string;
  path: string;
  normalized_label: NormalizedOutcomeLabel;
  relative_return_pct: number | null;
  absolute_return_pct: number | null;
}

export interface InsightCandidateOutcomeSummary {
  outcome_id: string;
  insight_id: string;
  symbol: string;
  horizon: string;
  normalized_label: NormalizedOutcomeLabel;
  reason_codes: string[];
}

export interface EvaluationReportSections {
  decision_performance: {
    total: number;
    by_label: Record<string, number>;
    mean_relative_return_pct: number | null;
    mean_absolute_return_pct: number | null;
  };
  insight_candidate_performance: {
    total: number;
    by_label: Record<string, number>;
    hit_rate: number | null;
  };
  top_positive_patterns: string[];
  top_negative_patterns: string[];
  failure_modes: string[];
  data_gaps: string[];
  evidence_refs: string[];
}

export interface BuildEvaluationReportInput {
  model_version?: string;
  symbol?: string;
  limit?: number;
  report_id?: string;
  window_start?: string | null;
  window_end?: string | null;
}

export interface EvaluationReportPayload {
  report_id: string;
  model_version: string;
  window_start: string | null;
  window_end: string | null;
  metrics_json: EvaluationMetrics;
  recommendation: EvaluationRecommendation;
  sections: EvaluationReportSections;
  report_json: Record<string, unknown>;
  evidence_utility_score?: number | null;
  contra_predictive_power?: number | null;
}

export type { BarrierResult, DecisionOutcomeRow, InsightCandidateOutcomeRow, NormalizedOutcomeLabel };
