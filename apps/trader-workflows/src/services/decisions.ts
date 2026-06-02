import { randomUUID } from "node:crypto";

import { fetchStage1 } from "../api/client.js";
import {
  extractDecisionJson,
  type DecisionEnvelope,
} from "../llm/decisionEnvelope.js";

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
  decision_json: string;
  human_overrides_json?: string;
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

function mapActionToApi(action: DecisionEnvelope["action"]): string {
  return action.toLowerCase();
}

export async function persistModelDecision(input: {
  decision_id?: string;
  run_id?: string;
  snapshot_id: string;
  envelope: DecisionEnvelope;
  model_provider?: string;
  model_name?: string;
  model_version?: string;
}): Promise<PersistedModelDecision> {
  const decision_id = input.decision_id ?? `dec_${randomUUID().replace(/-/g, "")}`;
  return fetchStage1<PersistedModelDecision>("/model-decisions", {
    method: "POST",
    body: JSON.stringify({
      decision_id,
      run_id: input.run_id,
      snapshot_id: input.snapshot_id,
      symbol: input.envelope.symbol,
      model_provider: input.model_provider ?? process.env.LLM_PROVIDER ?? "deepseek",
      model_name: input.model_name ?? process.env.LLM_MODEL ?? "deepseek-chat",
      model_version: input.model_version ?? "stage1-v0",
      action: mapActionToApi(input.envelope.action),
      confidence: input.envelope.confidence,
      uncertainty: input.envelope.uncertainty,
      decision_json: extractDecisionJson(input.envelope),
      status: "active",
    }),
  });
}

export async function scheduleModelPathOutcomes(input: {
  decision_id: string;
  symbol: string;
  due_at?: string | null;
}): Promise<ScheduledDecisionOutcome[]> {
  const response = await fetchStage1<{ items: ScheduledDecisionOutcome[] }>(
    "/decision-outcomes/schedule",
    {
      method: "POST",
      body: JSON.stringify({
        outcomes: OUTCOME_HORIZONS.map((horizon) => ({
          decision_id: input.decision_id,
          symbol: input.symbol,
          horizon,
          path: "model_path",
          due_at: input.due_at ?? null,
        })),
      }),
    },
  );
  return response.items;
}

export async function scheduleOverridePathOutcomes(input: {
  decision_id: string;
  symbol: string;
  horizons?: OutcomeHorizon[];
  due_at?: string | null;
}): Promise<ScheduledDecisionOutcome[]> {
  const horizons = input.horizons ?? [...OUTCOME_HORIZONS];
  const response = await fetchStage1<{ items: ScheduledDecisionOutcome[] }>(
    "/decision-outcomes/schedule",
    {
      method: "POST",
      body: JSON.stringify({
        outcomes: horizons.map((horizon) => ({
          decision_id: input.decision_id,
          symbol: input.symbol,
          horizon,
          path: "override_path",
          due_at: input.due_at ?? null,
        })),
      }),
    },
  );
  return response.items;
}
