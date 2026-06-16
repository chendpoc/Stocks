import type {
  AlphaInputValidationReport,
  AlphaResearchInput,
  LiteBacktestReportResponse,
} from "../../types/alpha.js";

/** Pure pipeline state for AlphaResearchGraph. */
export interface AlphaResearchGraphState {
  run_id: string;
  thread_id: string;
  input: Partial<AlphaResearchInput>;
  /** Default: `null` */
  validation_report: AlphaInputValidationReport | null;
  /** Default: `"pending"` */
  status: string;
  /** Default: `null` */
  rule_candidate_id: string | null;
  /** Default: `null` */
  lite_backtest_report_id: string | null;
  /** Default: `null` */
  candidate_status: string | null;
  /** Default: `null` */
  lite_backtest_report: LiteBacktestReportResponse | null;
  /** Default: `[]` */
  safety_flags: string[];
}

export function createInitialAlphaResearchGraphState(
  input: Pick<AlphaResearchGraphState, "run_id" | "thread_id" | "input"> &
    Partial<AlphaResearchGraphState>,
): AlphaResearchGraphState {
  return {
    validation_report: null,
    status: "pending",
    rule_candidate_id: null,
    lite_backtest_report_id: null,
    candidate_status: null,
    lite_backtest_report: null,
    safety_flags: [],
    ...input,
  };
}
