import {
  createWorkflowLlmProvider,
  type WorkflowLlmProvider,
} from "../../llm/provider.js";
import {
  buildHeuristicInsightProposal,
  createInsightCandidate,
  fetchContextSnapshotsForSymbol,
  fetchLatestEvaluationReportForInsight,
  fetchOutcomesForInsight,
  runControlledInsightReAct,
  type InsightCandidateRecord,
  type InsightReActStepRecord,
  type InsightProposal,
  type ParsedExplorationWindow,
} from "../../services/insightCandidates.js";
import {
  scheduleInsightCandidateOutcome,
  type InsightCandidateOutcomeRow,
} from "../../services/outcomes.js";

export const INSIGHT_REACT_MAX_STEPS = 5;

export interface InsightExplorationGraphInput {
  symbol: string;
  window: string;
  run_id?: string;
  exploration_prompt?: string;
  evaluation_report_id?: string;
  persist?: boolean;
  snapshot_limit?: number;
  outcome_limit?: number;
}

export interface InsightExplorationGraphResult {
  run_id: string;
  insight_id: string;
  window: ParsedExplorationWindow;
  react_steps: InsightReActStepRecord[];
  proposal: InsightProposal;
  persisted_candidate: InsightCandidateRecord | null;
  scheduled_outcome: InsightCandidateOutcomeRow | null;
}

export interface InsightExplorationGraphDeps {
  fetchSnapshots?: typeof fetchContextSnapshotsForSymbol;
  fetchOutcomes?: typeof fetchOutcomesForInsight;
  fetchEvaluationReport?: typeof fetchLatestEvaluationReportForInsight;
  runReAct?: typeof runControlledInsightReAct;
  llm?: WorkflowLlmProvider;
  persist?: typeof createInsightCandidate;
  scheduleOutcome?: typeof scheduleInsightCandidateOutcome;
}

/** @deprecated Use runInsightExplorationGraph or the compiled insightExplorationGraph export. */
export class InsightExplorationGraph {
  constructor(private readonly deps: InsightExplorationGraphDeps = {}) { }

  async explore(input: InsightExplorationGraphInput): Promise<InsightExplorationGraphResult> {
    const { runInsightExplorationGraph } = await import("./insightExplorationGraph.js");
    return runInsightExplorationGraph(input, this.deps);
  }
}
