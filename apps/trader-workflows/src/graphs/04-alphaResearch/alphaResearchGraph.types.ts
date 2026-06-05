import type {
  AlphaInputValidationReport,
  AlphaResearchClient,
  AlphaResearchInput,
  LiteBacktestReportResponse,
} from "../../services/alphaResearch.js";

export interface AlphaResearchGraphInput extends Partial<AlphaResearchInput> {
  run_id?: string;
}

export interface AlphaResearchGraphResult {
  run_id: string;
  status: string;
  insight_id: string | null;
  rule_candidate_id: string | null;
  lite_backtest_report_id: string | null;
  candidate_status: string | null;
  validation_report: AlphaInputValidationReport | null;
  lite_backtest_report: LiteBacktestReportResponse | null;
  safety_flags: string[];
}

export interface AlphaResearchGraphDeps {
  client?: AlphaResearchClient;
}

/** @deprecated Use runAlphaResearchGraph or the compiled alphaResearchGraph export. */
export class AlphaResearchGraph {
  constructor(private readonly deps: AlphaResearchGraphDeps = {}) { }

  async run(input: AlphaResearchGraphInput = {}): Promise<AlphaResearchGraphResult> {
    const { runAlphaResearchGraph } = await import("./alphaResearchGraph.js");
    return runAlphaResearchGraph(input, this.deps);
  }
}
