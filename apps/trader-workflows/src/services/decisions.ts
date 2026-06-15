import { randomUUID } from "node:crypto";

import { fetchStage1, Stage1ApiError } from "../api/client.js";
import {
  extractDecisionJson,
  type DecisionEnvelope,
} from "../llm/decisionEnvelope.js";
import type {
  OutcomeHorizon,
  PersistedModelDecision,
  ScheduledDecisionOutcome,
} from "../types/decisions.js";
import { OUTCOME_HORIZONS } from "../types/decisions.js";

export {
  OUTCOME_HORIZONS,
  type OutcomeHorizon,
  type PersistedModelDecision,
  type ScheduledDecisionOutcome,
} from "../types/decisions.js";

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

export async function fetchModelDecision(
  decision_id: string,
): Promise<PersistedModelDecision> {
  return fetchStage1<PersistedModelDecision>(
    `/model-decisions/${encodeURIComponent(decision_id)}`,
  );
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
  const body = {
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
  };
  try {
    return await fetchStage1<PersistedModelDecision>("/model-decisions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (
      error instanceof Stage1ApiError &&
      error.status === 409 &&
      input.decision_id
    ) {
      const existing = await fetchModelDecision(decision_id);
      if (existing.snapshot_id === input.snapshot_id) {
        return existing;
      }
      throw new Error(
        `Model decision ${decision_id} already exists for snapshot ${existing.snapshot_id}; ` +
        `cannot persist a different envelope for snapshot ${input.snapshot_id}`,
        { cause: error },
      );
    }
    throw error;
  }
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
