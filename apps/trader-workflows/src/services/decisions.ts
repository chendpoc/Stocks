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

function mapActionToApi(action: DecisionEnvelope["action"]): string {
  return action.toLowerCase();
}

function addMinutes(asof: Date, minutes: number): Date {
  return new Date(asof.getTime() + minutes * 60 * 1000);
}

function addDays(asof: Date, days: number): Date {
  return new Date(asof.getTime() + days * 24 * 60 * 60 * 1000);
}

function endOfTradingDayUtc(asof: Date): Date {
  const due = new Date(asof);
  due.setUTCHours(21, 0, 0, 0);
  if (due.getTime() <= asof.getTime()) {
    due.setUTCDate(due.getUTCDate() + 1);
  }
  return due;
}

export function computeOutcomeDueAt(horizon: OutcomeHorizon, asof_ts: string): string {
  const asof = new Date(asof_ts);
  if (Number.isNaN(asof.getTime())) {
    throw new Error(`Invalid asof_ts for outcome scheduling: ${asof_ts}`);
  }
  switch (horizon) {
    case "30m":
      return addMinutes(asof, 30).toISOString();
    case "1h":
      return addMinutes(asof, 60).toISOString();
    case "EOD":
      return endOfTradingDayUtc(asof).toISOString();
    case "1d":
      return addDays(asof, 1).toISOString();
    case "3d":
      return addDays(asof, 3).toISOString();
  }
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
  asof_ts?: string;
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
          due_at:
            input.due_at ??
            (input.asof_ts ? computeOutcomeDueAt(horizon, input.asof_ts) : null),
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
  asof_ts?: string;
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
          due_at:
            input.due_at ??
            (input.asof_ts ? computeOutcomeDueAt(horizon, input.asof_ts) : null),
        })),
      }),
    },
  );
  return response.items;
}
