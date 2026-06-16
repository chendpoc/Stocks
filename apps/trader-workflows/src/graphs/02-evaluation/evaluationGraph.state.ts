import type {
  EvaluationReportPayload,
  EvaluationReportRecord,
} from "../../services/evaluation.js";

/** Pure pipeline state for EvaluationGraph. */
export interface EvaluationGraphState {
  run_id: string;
  thread_id: string;
  model_version: string;
  symbol?: string;
  /** Default: `500` */
  limit: number;
  /** Default: `true` */
  persist: boolean;
  report_id?: string;
  window_start?: string | null;
  window_end?: string | null;
  /** Default: `null` */
  report: EvaluationReportPayload | null;
  /** Default: `null` */
  persisted_report: EvaluationReportRecord | null;
}

export function createInitialEvaluationGraphState(
  input: Pick<
    EvaluationGraphState,
    "run_id" | "thread_id" | "model_version"
  > &
    Partial<EvaluationGraphState>,
): EvaluationGraphState {
  return {
    limit: 500,
    persist: true,
    report: null,
    persisted_report: null,
    ...input,
  };
}
