import { Annotation } from "@langchain/langgraph";

import type { WeightedContextItem } from "../../services/contextSnapshots.js";
import type { EvaluationOutcomeRow, EvaluationReportPayload } from "../../services/evaluation.js";
import type {
  InsightCandidateRecord,
  InsightCandidatePayload,
  InsightReActStepRecord,
  InsightProposal,
  ParsedExplorationWindow,
} from "../../services/insightCandidates.js";
import type { ContextSnapshotRecord } from "../../services/contextSnapshots.js";
import type { InsightCandidateOutcomeRow } from "../../services/outcomes.js";

export const InsightExplorationGraphStateAnnotation = Annotation.Root({
  run_id: Annotation<string>(),
  thread_id: Annotation<string>(),
  symbol: Annotation<string>(),
  window: Annotation<string>(),
  parsed_window: Annotation<ParsedExplorationWindow | null>({
    reducer: (_left, right) => right ?? null,
    default: () => null,
  }),
  exploration_prompt: Annotation<string | undefined>(),
  snapshot_limit: Annotation<number>({
    reducer: (_left, right) => right ?? 20,
    default: () => 20,
  }),
  outcome_limit: Annotation<number>({
    reducer: (_left, right) => right ?? 200,
    default: () => 200,
  }),
  evaluation_report_id: Annotation<string | undefined>(),
  evaluation_report: Annotation<EvaluationReportPayload | null>({
    reducer: (_left, right) => right ?? null,
    default: () => null,
  }),
  persist: Annotation<boolean>({
    reducer: (_left, right) => right ?? true,
    default: () => true,
  }),
  snapshots: Annotation<ContextSnapshotRecord[]>({
    reducer: (_left, right) => right ?? [],
    default: () => [],
  }),
  outcomes: Annotation<EvaluationOutcomeRow[]>({
    reducer: (_left, right) => right ?? [],
    default: () => [],
  }),
  context_items: Annotation<WeightedContextItem[]>({
    reducer: (_left, right) => right ?? [],
    default: () => [],
  }),
  scoped_outcomes: Annotation<EvaluationOutcomeRow[]>({
    reducer: (_left, right) => right ?? [],
    default: () => [],
  }),
  react_steps: Annotation<InsightReActStepRecord[]>({
    reducer: (_left, right) => right ?? [],
    default: () => [],
  }),
  proposal: Annotation<InsightProposal | null>({
    reducer: (_left, right) => right ?? null,
    default: () => null,
  }),
  insight_id: Annotation<string | undefined>(),
  candidate_payload: Annotation<InsightCandidatePayload | null>({
    reducer: (_left, right) => right ?? null,
    default: () => null,
  }),
  persisted_candidate: Annotation<InsightCandidateRecord | null>({
    reducer: (_left, right) => right ?? null,
    default: () => null,
  }),
  scheduled_outcome: Annotation<InsightCandidateOutcomeRow | null>({
    reducer: (_left, right) => right ?? null,
    default: () => null,
  }),
});

export type InsightExplorationGraphState = typeof InsightExplorationGraphStateAnnotation.State;
