import { fetchStage1 } from "../../api/client.js";
import { OUTCOME_HORIZONS } from "../../types/decisions.js";
import type { OutcomeHorizon } from "../../types/decisions.js";
import type {
  DecisionOutcomeRow,
  InsightCandidateOutcomeLabelPayload,
  InsightCandidateOutcomeRow,
  MarketBar,
  OutcomeLabelPayload,
  ScheduleInsightCandidateOutcomePayload,
} from "../../types/outcomes.js";
import {
  type InsightCandidateOutcomeHorizon,
} from "../../types/outcomes.js";
import {
  buildInsightCandidateOutcomeLabelPayload,
  buildOutcomeLabelPayload,
  isSupportedInsightCandidateOutcomeHorizon,
} from "./labeling.js";
import {
  labelDecisionOutcome,
  labelInsightCandidateOutcome,
  mapToInsightCandidateOutcomeRow,
} from "./persistence.js";

export const DEFAULT_INSIGHT_CANDIDATE_OUTCOME_HORIZON: InsightCandidateOutcomeHorizon = "2m";

export { isSupportedInsightCandidateOutcomeHorizon } from "./labeling.js";

export async function scheduleInsightCandidateOutcome(
  payload: ScheduleInsightCandidateOutcomePayload,
): Promise<InsightCandidateOutcomeRow> {
  if (!isSupportedInsightCandidateOutcomeHorizon(payload.horizon)) {
    throw new Error(`Unsupported insight candidate outcome horizon: ${payload.horizon}`);
  }
  const response = await fetchStage1<{ items: Record<string, unknown>[]; count: number }>(
    "/insight-candidate-outcomes/schedule",
    {
      method: "POST",
      body: JSON.stringify({
        outcomes: [{
          insight_id: payload.insight_id,
          symbol: payload.symbol,
          horizon: payload.horizon,
          evidence_refs_json: payload.evidence_refs ?? [],
          reason_codes_json: payload.reason_codes ?? [],
          outcome_json: payload.outcome_json ?? {},
        }],
      }),
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
  const params = new URLSearchParams();
  if (input.now) {
    params.set("now", input.now);
  }
  if (input.limit !== undefined) {
    params.set("limit", String(input.limit));
  }
  if (input.symbol) {
    params.set("symbol", input.symbol.toUpperCase());
  }
  const query = params.toString();
  const response = await fetchStage1<{ items: DecisionOutcomeRow[]; count: number }>(
    `/decision-outcomes/due${query ? `?${query}` : ""}`,
  );
  return response.items;
}

export async function finalizeDueOutcome(input: {
  outcome: DecisionOutcomeRow;
  symbolBars?: MarketBar[];
  benchmarkBars?: MarketBar[];
  fetchBars?: (symbol: string, timeframe: string, limit: number) => Promise<MarketBar[]>;
  fetchDecision?: (decision_id: string) => Promise<{
    decision_id: string;
    symbol: string;
    action: string;
    decision_json: Record<string, unknown>;
  }>;
  label?: (outcome_id: string, payload: OutcomeLabelPayload) => Promise<DecisionOutcomeRow>;
}): Promise<DecisionOutcomeRow> {
  if (input.outcome.status !== "pending") {
    throw new Error(`outcome ${input.outcome.outcome_id} is not pending`);
  }
  const payload = await buildOutcomeLabelPayload(input);
  const label = input.label ?? labelDecisionOutcome;
  return label(input.outcome.outcome_id, payload);
}

export async function fetchDueInsightCandidateOutcomes(input: {
  now?: string;
  limit?: number;
  symbol?: string;
}): Promise<InsightCandidateOutcomeRow[]> {
  const params = new URLSearchParams();
  if (input.now) {
    params.set("now", input.now);
  }
  if (input.limit !== undefined) {
    params.set("limit", String(input.limit));
  }
  if (input.symbol) {
    params.set("symbol", input.symbol.toUpperCase());
  }
  const query = params.toString();
  const response = await fetchStage1<{ items: Record<string, unknown>[]; count: number }>(
    `/insight-candidate-outcomes/due${query ? `?${query}` : ""}`,
  );
  return response.items.map(mapToInsightCandidateOutcomeRow);
}

export async function finalizeDueInsightCandidateOutcome(input: {
  outcome: InsightCandidateOutcomeRow;
  symbolBars?: MarketBar[];
  benchmarkBars?: MarketBar[];
  fetchBars?: (symbol: string, timeframe: string, limit: number) => Promise<MarketBar[]>;
  label?: (
    outcome_id: string,
    payload: InsightCandidateOutcomeLabelPayload,
  ) => Promise<InsightCandidateOutcomeRow>;
}): Promise<InsightCandidateOutcomeRow> {
  if (input.outcome.status !== "pending") {
    throw new Error(`outcome ${input.outcome.outcome_id} is not pending`);
  }
  const payload = await buildInsightCandidateOutcomeLabelPayload(input);
  const label = input.label ?? labelInsightCandidateOutcome;
  return label(input.outcome.outcome_id, payload);
}

export function isSupportedOutcomeHorizon(horizon: string): horizon is OutcomeHorizon {
  return (OUTCOME_HORIZONS as readonly string[]).includes(horizon);
}
