import type {
  OutcomeHorizon,
  PersistedModelDecision,
  ScheduledDecisionOutcome,
} from "../types/decisions.js";

export {
  OUTCOME_HORIZONS,
  type OutcomeHorizon,
  type PersistedModelDecision,
  type ScheduledDecisionOutcome,
} from "../types/decisions.js";

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
