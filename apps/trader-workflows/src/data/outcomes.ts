import { fetchIntel, fetchStage1 } from "../api/client.js";
import { mapToInsightCandidateOutcomeRow } from "../services/outcomes/persistence.js";
import type {
  DecisionOutcomeRow,
  InsightCandidateOutcomeLabelPayload,
  InsightCandidateOutcomeRow,
  MarketBar,
  OutcomeLabelPayload,
  ScheduleInsightCandidateOutcomePayload,
} from "../types/outcomes.js";

export async function fetchModelDecisionById(decision_id: string): Promise<{
  decision_id: string;
  symbol: string;
  action: string;
  decision_json: Record<string, unknown>;
}> {
  return fetchStage1<{
    decision_id: string;
    symbol: string;
    action: string;
    decision_json: Record<string, unknown>;
  }>(`/model-decisions/${decision_id}`);
}

export async function fetchMarketBars(
  symbol: string,
  timeframe = "1d",
  limit = 10,
): Promise<MarketBar[]> {
  const response = await fetchIntel<{ bars: MarketBar[] }>("/market/bars", {
    searchParams: {
      symbol: symbol.toUpperCase(),
      timeframe,
      limit,
    },
  });
  return response.bars ?? [];
}

export async function labelDecisionOutcome(
  outcome_id: string,
  payload: OutcomeLabelPayload,
): Promise<DecisionOutcomeRow> {
  return fetchStage1<DecisionOutcomeRow>(`/decision-outcomes/${outcome_id}/label`, {
    method: "POST",
    json: {
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
    },
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
      json: {
        status: payload.status,
        normalized_label: payload.normalized_label,
        reason_codes_json: payload.reason_codes_json,
        outcome_json: payload.outcome_json,
      },
    },
  );
  return mapToInsightCandidateOutcomeRow(raw);
}

export async function scheduleInsightCandidateOutcome(
  payload: ScheduleInsightCandidateOutcomePayload,
): Promise<InsightCandidateOutcomeRow> {
  const response = await fetchStage1<{ items: Record<string, unknown>[]; count: number }>(
    "/insight-candidate-outcomes/schedule",
    {
      method: "POST",
      json: {
        outcomes: [{
          insight_id: payload.insight_id,
          symbol: payload.symbol,
          horizon: payload.horizon,
          evidence_refs_json: payload.evidence_refs ?? [],
          reason_codes_json: payload.reason_codes ?? [],
          outcome_json: payload.outcome_json ?? {},
        }],
      },
    },
  );
  if (!response.items.length) {
    throw new Error(`schedule returned empty items for insight_id=${payload.insight_id}`);
  }
  return mapToInsightCandidateOutcomeRow(response.items[0]);
}

export async function fetchDueDecisionOutcomes(input: {
  now?: string;
  limit?: number;
  symbol?: string;
}): Promise<DecisionOutcomeRow[]> {
  const response = await fetchStage1<{ items: DecisionOutcomeRow[]; count: number }>(
    "/decision-outcomes/due",
    {
      searchParams: {
        now: input.now,
        limit: input.limit,
        symbol: input.symbol?.toUpperCase(),
      },
    },
  );
  return response.items;
}

export async function fetchDueInsightCandidateOutcomes(input: {
  now?: string;
  limit?: number;
  symbol?: string;
}): Promise<InsightCandidateOutcomeRow[]> {
  const response = await fetchStage1<{ items: Record<string, unknown>[]; count: number }>(
    "/insight-candidate-outcomes/due",
    {
      searchParams: {
        now: input.now,
        limit: input.limit,
        symbol: input.symbol?.toUpperCase(),
      },
    },
  );
  return response.items.map(mapToInsightCandidateOutcomeRow);
}
