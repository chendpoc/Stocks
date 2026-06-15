import type {
  InsightCandidateOutcomeRow,
} from "../../types/outcomes.js";

export function mapToInsightCandidateOutcomeRow(
  raw: Record<string, unknown>,
): InsightCandidateOutcomeRow {
  return {
    outcome_id: String(raw.outcome_id ?? ""),
    insight_id: String(raw.insight_id ?? ""),
    symbol: String(raw.symbol ?? ""),
    horizon: String(raw.horizon ?? ""),
    status: String(raw.status ?? "pending"),
    due_at: raw.due_at as string | null | undefined,
    scheduled_at: raw.scheduled_at as string | null | undefined,
    normalized_label: raw.normalized_label as string | null | undefined,
    metrics_json: raw.metrics_json as Record<string, unknown> | null | undefined,
    reason_codes_json: raw.reason_codes_json as string[] | null | undefined,
    evidence_refs_json: raw.evidence_refs_json as unknown[] | null | undefined,
    outcome_json: raw.outcome_json as Record<string, unknown> | null | undefined,
    created_at: raw.created_at as string | undefined,
    labeled_at: raw.labeled_at as string | null | undefined,
  };
}
