import { Annotation } from "@langchain/langgraph";

import type {
  EvaluationReportPayload,
  EvaluationReportRecord,
} from "../../services/evaluation.js";

export const EvaluationGraphStateAnnotation = Annotation.Root({
  run_id: Annotation<string>(),
  thread_id: Annotation<string>(),
  model_version: Annotation<string>(),
  symbol: Annotation<string | undefined>(),
  limit: Annotation<number>({
    reducer: (_left, right) => right ?? 500,
    default: () => 500,
  }),
  persist: Annotation<boolean>({
    reducer: (_left, right) => right ?? true,
    default: () => true,
  }),
  report_id: Annotation<string | undefined>(),
  window_start: Annotation<string | null | undefined>(),
  window_end: Annotation<string | null | undefined>(),
  report: Annotation<EvaluationReportPayload | null>({
    reducer: (_left, right) => right ?? null,
    default: () => null,
  }),
  persisted_report: Annotation<EvaluationReportRecord | null>({
    reducer: (_left, right) => right ?? null,
    default: () => null,
  }),
});

export type EvaluationGraphState = typeof EvaluationGraphStateAnnotation.State;
