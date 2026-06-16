import type { ContextSnapshotRecord, WeightedContextItem } from "../../types/context.js";
import type { EvaluationOutcomeRow, EvaluationReportPayload } from "../../types/evaluation.js";
import type {
  InsightCandidateRecord,
  InsightCandidatePayload,
  InsightReActStepRecord,
  InsightProposal,
  ParsedExplorationWindow,
} from "../../types/insight.js";
import type { InsightCandidateOutcomeRow } from "../../types/outcomes.js";

/** Pure pipeline state for InsightExplorationGraph. */
export interface InsightExplorationGraphState {
  run_id: string;
  thread_id: string;
  symbol: string;
  window: string;
  /** Default: `null` */
  parsed_window: ParsedExplorationWindow | null;
  exploration_prompt?: string;
  /** Default: `20` */
  snapshot_limit: number;
  /** Default: `200` */
  outcome_limit: number;
  evaluation_report_id?: string;
  /** Default: `null` */
  evaluation_report: EvaluationReportPayload | null;
  /** Default: `true` */
  persist: boolean;
  /** Default: `[]` */
  snapshots: ContextSnapshotRecord[];
  /** Default: `[]` */
  outcomes: EvaluationOutcomeRow[];
  /** Default: `[]` */
  context_items: WeightedContextItem[];
  /** Default: `[]` */
  scoped_outcomes: EvaluationOutcomeRow[];
  /** Default: `[]` */
  react_steps: InsightReActStepRecord[];
  /** Default: `null` */
  proposal: InsightProposal | null;
  insight_id?: string;
  /** Default: `null` */
  candidate_payload: InsightCandidatePayload | null;
  /** Default: `null` */
  persisted_candidate: InsightCandidateRecord | null;
  /** Default: `null` */
  scheduled_outcome: InsightCandidateOutcomeRow | null;
}

export function createInitialInsightExplorationGraphState(
  input: Pick<
    InsightExplorationGraphState,
    "run_id" | "thread_id" | "symbol" | "window"
  > &
    Partial<InsightExplorationGraphState>,
): InsightExplorationGraphState {
  return {
    parsed_window: null,
    snapshot_limit: 20,
    outcome_limit: 200,
    evaluation_report: null,
    persist: true,
    snapshots: [],
    outcomes: [],
    context_items: [],
    scoped_outcomes: [],
    react_steps: [],
    proposal: null,
    candidate_payload: null,
    persisted_candidate: null,
    scheduled_outcome: null,
    ...input,
  };
}
