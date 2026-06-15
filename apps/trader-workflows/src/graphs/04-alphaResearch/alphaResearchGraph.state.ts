import { Annotation } from "@langchain/langgraph";

import type {
  AlphaInputValidationReport,
  AlphaResearchInput,
  LiteBacktestReportResponse,
} from "../../types/alpha.js";

export const AlphaResearchGraphStateAnnotation = Annotation.Root({
  run_id: Annotation<string>(),
  thread_id: Annotation<string>(),
  input: Annotation<Partial<AlphaResearchInput>>(),
  validation_report: Annotation<AlphaInputValidationReport | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  status: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "pending",
  }),
  rule_candidate_id: Annotation<string | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  lite_backtest_report_id: Annotation<string | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  candidate_status: Annotation<string | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  lite_backtest_report: Annotation<LiteBacktestReportResponse | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  safety_flags: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
});

export type AlphaResearchGraphState = typeof AlphaResearchGraphStateAnnotation.State;
