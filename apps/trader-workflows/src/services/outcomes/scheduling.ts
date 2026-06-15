import { OUTCOME_HORIZONS } from "../../types/decisions.js";
import type { OutcomeHorizon } from "../../types/decisions.js";
import type {
  DecisionOutcomeRow,
  InsightCandidateOutcomeLabelPayload,
  InsightCandidateOutcomeRow,
  MarketBar,
  OutcomeLabelPayload,
} from "../../types/outcomes.js";
import {
  type InsightCandidateOutcomeHorizon,
} from "../../types/outcomes.js";
import {
  buildInsightCandidateOutcomeLabelPayload,
  buildOutcomeLabelPayload,
  isSupportedInsightCandidateOutcomeHorizon,
} from "./labeling.js";

export const DEFAULT_INSIGHT_CANDIDATE_OUTCOME_HORIZON: InsightCandidateOutcomeHorizon = "2m";

export { isSupportedInsightCandidateOutcomeHorizon } from "./labeling.js";

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
  if (!input.label) {
    throw new Error("finalizeDueOutcome requires label");
  }
  return input.label(input.outcome.outcome_id, payload);
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
  if (!input.label) {
    throw new Error("finalizeDueInsightCandidateOutcome requires label");
  }
  return input.label(input.outcome.outcome_id, payload);
}

export function isSupportedOutcomeHorizon(horizon: string): horizon is OutcomeHorizon {
  return (OUTCOME_HORIZONS as readonly string[]).includes(horizon);
}
