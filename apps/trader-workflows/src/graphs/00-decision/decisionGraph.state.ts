import { Annotation } from "@langchain/langgraph";

import type { DecisionEnvelope } from "../../llm/decisionEnvelope.js";
import type { ContextSnapshotRecord } from "../../services/contextSnapshots.js";
import type {
  PersistedModelDecision,
  ScheduledDecisionOutcome,
} from "../../services/decisions.js";
import type { EvidenceRef } from "./evidenceRefs.js";

export const DecisionGraphStateAnnotation = Annotation.Root({
  run_id: Annotation<string>(),
  thread_id: Annotation<string>(),
  symbol: Annotation<string>(),
  taskType: Annotation<string>(),
  asof_ts: Annotation<string>(),
  model_version: Annotation<string>(),
  snapshot: Annotation<ContextSnapshotRecord | null>({
    reducer: (_left, right) => right ?? null,
    default: () => null,
  }),
  weighted_context_items: Annotation<ContextSnapshotRecord["items_json"]>({
    reducer: (_left, right) => right ?? [],
    default: () => [],
  }),
  evidence_refs: Annotation<EvidenceRef[]>({
    reducer: (_left, right) => right ?? [],
    default: () => [],
  }),
  envelope: Annotation<DecisionEnvelope | null>({
    reducer: (_left, right) => right ?? null,
    default: () => null,
  }),
  decision: Annotation<PersistedModelDecision | null>({
    reducer: (_left, right) => right ?? null,
    default: () => null,
  }),
  scheduled_outcomes: Annotation<ScheduledDecisionOutcome[]>({
    reducer: (_left, right) => right ?? [],
    default: () => [],
  }),
  paper_execution_submitted: Annotation<boolean>({
    reducer: (_left, right) => right ?? false,
    default: () => false,
  }),
  errors: Annotation<string[]>({
    reducer: (left, right) => [...(left ?? []), ...(right ?? [])],
    default: () => [],
  }),
});

export type DecisionGraphState = typeof DecisionGraphStateAnnotation.State;
