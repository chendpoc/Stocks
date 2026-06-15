import type {
  BuildEvaluationReportInput,
  EvaluationReportPayload,
  EvaluationReportRecord,
} from "../../services/evaluation.js";
import type { BuildEvaluationReport } from "./evaluationGraph.nodes.js";

export interface EvaluationGraphRunInput extends BuildEvaluationReportInput {
  run_id?: string;
  persist?: boolean;
}

export interface EvaluationGraphRunResult {
  run_id: string;
  report: EvaluationReportPayload;
  persisted_report: EvaluationReportRecord | null;
}

export interface EvaluationGraphDeps {
  build?: BuildEvaluationReport;
  persist?: (payload: EvaluationReportPayload) => Promise<EvaluationReportRecord>;
}

/** @deprecated Use runEvaluationSummaryGraph or the compiled evaluationGraph export. */
export class EvaluationGraph {
  constructor(private readonly deps: EvaluationGraphDeps = {}) { }

  async runSummary(input: EvaluationGraphRunInput = {}): Promise<EvaluationGraphRunResult> {
    const { runEvaluationSummaryGraph } = await import("./evaluationGraph.js");
    return runEvaluationSummaryGraph(input, this.deps);
  }
}
