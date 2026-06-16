import type {
  DecisionOutcomeRow,
  InsightCandidateOutcomeRow,
  NormalizedOutcomeLabel,
  OutcomeRow,
  OutcomeSourceType,
} from "../../services/outcomes.js";

export const ZERO_COUNTS_BY_SOURCE: Record<OutcomeSourceType, number> = {
  decision: 0,
  insight_candidate: 0,
};

export const ZERO_COUNTS_BY_LABEL: Record<NormalizedOutcomeLabel, number> = {
  hit: 0,
  miss: 0,
  neutral: 0,
  invalid: 0,
  insufficient_data: 0,
};

/** Pure pipeline state for OutcomeGraph. */
export interface OutcomeGraphState {
  run_id: string;
  thread_id: string;
  now?: string;
  /** Default: `100` */
  limit: number;
  symbol?: string;
  /** Default: `[]` */
  decision_due_rows: DecisionOutcomeRow[];
  /** Default: `[]` */
  insight_due_rows: InsightCandidateOutcomeRow[];
  /** Append-only in pipeline merge (`outcomes` accumulator). Default: `[]` */
  outcomes: OutcomeRow[];
  /** Default: `0` */
  processed_count: number;
  /** Default: `0` */
  labeled_count: number;
  /** Default: `0` */
  skipped_count: number;
  /** Default: `0` */
  failed_count: number;
  /** Default: zero counts by source */
  counts_by_source_type: Record<OutcomeSourceType, number>;
  /** Default: zero counts by label */
  counts_by_normalized_label: Record<NormalizedOutcomeLabel, number>;
}

export function createInitialOutcomeGraphState(
  input: Pick<OutcomeGraphState, "run_id" | "thread_id"> & Partial<OutcomeGraphState>,
): OutcomeGraphState {
  return {
    limit: 100,
    decision_due_rows: [],
    insight_due_rows: [],
    outcomes: [],
    processed_count: 0,
    labeled_count: 0,
    skipped_count: 0,
    failed_count: 0,
    counts_by_source_type: { ...ZERO_COUNTS_BY_SOURCE },
    counts_by_normalized_label: { ...ZERO_COUNTS_BY_LABEL },
    ...input,
  };
}
