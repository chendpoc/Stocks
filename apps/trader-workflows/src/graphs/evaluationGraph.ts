import { randomUUID } from "node:crypto";

import {
  buildEvaluationReport,
  createEvaluationReport,
  type BuildEvaluationReportInput,
  type EvaluationReportPayload,
  type EvaluationReportRecord,
} from "../services/evaluation.js";

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

export class EvaluationGraph {
  private readonly deps: Required<EvaluationGraphDeps>;

  constructor(deps: EvaluationGraphDeps = {}) {
    this.deps = {
      build: deps.build ?? buildEvaluationReport,
      persist: deps.persist ?? createEvaluationReport,
    };
  }

  async runSummary(input: EvaluationGraphRunInput = {}): Promise<EvaluationGraphRunResult> {
    const run_id = input.run_id ?? `run_${randomUUID().replace(/-/g, "")}`;
    const report = await this.deps.build(input);
    const persist = input.persist ?? true;
    const persisted_report = persist ? await this.deps.persist(report) : null;

    return {
      run_id,
      report,
      persisted_report,
    };
  }
}

export async function runEvaluationSummaryGraph(
  input: EvaluationGraphRunInput = {},
  deps?: EvaluationGraphDeps,
): Promise<EvaluationGraphRunResult> {
  return new EvaluationGraph(deps).runSummary(input);
}
