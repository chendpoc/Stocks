import type { DecisionOutcomeRow, InsightCandidateOutcomeRow, OutcomeRow } from "../../types/outcomes.js";

export {
  INSIGHT_CANDIDATE_OUTCOME_HORIZONS,
  type InsightCandidateOutcomeHorizon,
  type OutcomeFinalStatus,
  type OutcomeSourceType,
  type BarrierResult,
  type NormalizedOutcomeLabel,
  type DecisionOutcomeRow,
  type InsightCandidateOutcomeRow,
  type OutcomeRow,
  type MarketBar,
  type OutcomeLabelMetrics,
  type OutcomeLabelPayload,
  type ScheduleInsightCandidateOutcomePayload,
  type InsightCandidateOutcomeLabelPayload,
} from "../../types/outcomes.js";

export function isDecisionOutcome(row: OutcomeRow): row is DecisionOutcomeRow {
  return "decision_id" in row;
}

export function isInsightCandidateOutcome(row: OutcomeRow): row is InsightCandidateOutcomeRow {
  return "insight_id" in row;
}
