export const OUTCOME_HORIZONS = ["30m", "1h", "EOD", "1d", "3d"] as const;
export type OutcomeHorizon = (typeof OUTCOME_HORIZONS)[number];

export interface PersistedModelDecision {
  decision_id: string;
  run_id?: string | null;
  snapshot_id: string;
  symbol: string;
  model_provider?: string | null;
  model_name?: string | null;
  model_version?: string | null;
  action: string;
  confidence?: number | null;
  uncertainty?: number | null;
  decision_json: Record<string, unknown>;
  human_overrides_json?: unknown[];
  status?: string;
  created_at?: string;
}

export interface ScheduledDecisionOutcome {
  outcome_id: string;
  decision_id: string;
  symbol: string;
  horizon: string;
  path: string;
  status: string;
  due_at?: string | null;
}
