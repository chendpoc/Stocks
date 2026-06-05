import {
  buildEvaluationReport,
  createEvaluationReport,
  type BuildEvaluationReportInput,
  type EvaluationReportPayload,
  type EvaluationReportRecord,
} from "../../services/evaluation.js";

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
  build?: typeof buildEvaluationReport;
  persist?: typeof createEvaluationReport;
}

/** @deprecated Use runEvaluationSummaryGraph or the compiled evaluationGraph export. */
export class EvaluationGraph {
  constructor(private readonly deps: EvaluationGraphDeps = {}) { }

  async runSummary(input: EvaluationGraphRunInput = {}): Promise<EvaluationGraphRunResult> {
    const { runEvaluationSummaryGraph } = await import("./evaluationGraph.js");
    return runEvaluationSummaryGraph(input, this.deps);
  }
}
