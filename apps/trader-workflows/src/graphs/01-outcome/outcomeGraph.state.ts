import { Annotation } from "@langchain/langgraph";

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

export const OutcomeGraphStateAnnotation = Annotation.Root({
  run_id: Annotation<string>(),
  thread_id: Annotation<string>(),
  now: Annotation<string | undefined>(),
  limit: Annotation<number>({
    reducer: (_left, right) => right ?? 100,
    default: () => 100,
  }),
  symbol: Annotation<string | undefined>(),
  decision_due_rows: Annotation<DecisionOutcomeRow[]>({
    reducer: (_left, right) => right ?? [],
    default: () => [],
  }),
  insight_due_rows: Annotation<InsightCandidateOutcomeRow[]>({
    reducer: (_left, right) => right ?? [],
    default: () => [],
  }),
  outcomes: Annotation<OutcomeRow[]>({
    reducer: (left, right) => [...(left ?? []), ...(right ?? [])],
    default: () => [],
  }),
  processed_count: Annotation<number>({
    reducer: (_left, right) => right ?? 0,
    default: () => 0,
  }),
  labeled_count: Annotation<number>({
    reducer: (_left, right) => right ?? 0,
    default: () => 0,
  }),
  skipped_count: Annotation<number>({
    reducer: (_left, right) => right ?? 0,
    default: () => 0,
  }),
  failed_count: Annotation<number>({
    reducer: (_left, right) => right ?? 0,
    default: () => 0,
  }),
  counts_by_source_type: Annotation<Record<OutcomeSourceType, number>>({
    reducer: (_left, right) => right ?? { ...ZERO_COUNTS_BY_SOURCE },
    default: () => ({ ...ZERO_COUNTS_BY_SOURCE }),
  }),
  counts_by_normalized_label: Annotation<Record<NormalizedOutcomeLabel, number>>({
    reducer: (_left, right) => right ?? { ...ZERO_COUNTS_BY_LABEL },
    default: () => ({ ...ZERO_COUNTS_BY_LABEL }),
  }),
});

export type OutcomeGraphState = typeof OutcomeGraphStateAnnotation.State;
