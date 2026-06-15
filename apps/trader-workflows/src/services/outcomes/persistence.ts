import { fetchIntel, fetchStage1 } from "../../api/client.js";
import type {
  DecisionOutcomeRow,
  InsightCandidateOutcomeLabelPayload,
  InsightCandidateOutcomeRow,
  MarketBar,
  OutcomeLabelPayload,
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

export async function fetchModelDecisionById(decision_id: string): Promise<{
  decision_id: string;
  symbol: string;
  action: string;
  decision_json: Record<string, unknown>;
}> {
  const row = await fetchStage1<{
    decision_id: string;
    symbol: string;
    action: string;
    decision_json: Record<string, unknown>;
  }>(`/model-decisions/${decision_id}`);
  return row;
}

export async function fetchMarketBars(
  symbol: string,
  timeframe = "1d",
  limit = 10,
): Promise<MarketBar[]> {
  const params = new URLSearchParams({
    symbol: symbol.toUpperCase(),
    timeframe,
    limit: String(limit),
  });
  const response = await fetchIntel<{ bars: MarketBar[] }>(`/market/bars?${params.toString()}`);
  return response.bars ?? [];
}

export async function labelDecisionOutcome(
  outcome_id: string,
  payload: OutcomeLabelPayload,
): Promise<DecisionOutcomeRow> {
  return fetchStage1<DecisionOutcomeRow>(`/decision-outcomes/${outcome_id}/label`, {
    method: "POST",
    body: JSON.stringify({
      status: payload.status,
      reference_price: payload.reference_price,
      future_price: payload.future_price,
      absolute_return_pct: payload.absolute_return_pct,
      benchmark_symbol: payload.benchmark_symbol,
      benchmark_return_pct: payload.benchmark_return_pct,
      relative_return_pct: payload.relative_return_pct,
      hit_invalidation_proxy: payload.hit_invalidation_proxy,
      hit_target_proxy: payload.hit_target_proxy,
      barrier_result: payload.barrier_result,
      label: payload.label,
      outcome_json: payload.outcome_json,
    }),
  });
}

export async function labelInsightCandidateOutcome(
  outcome_id: string,
  payload: InsightCandidateOutcomeLabelPayload,
): Promise<InsightCandidateOutcomeRow> {
  const raw = await fetchStage1<Record<string, unknown>>(
    `/insight-candidate-outcomes/${outcome_id}/label`,
    {
      method: "POST",
      body: JSON.stringify({
        status: payload.status,
        normalized_label: payload.normalized_label,
        reason_codes_json: payload.reason_codes_json,
        outcome_json: payload.outcome_json,
      }),
    },
  );
  return mapToInsightCandidateOutcomeRow(raw);
}
