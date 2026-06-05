import {
  fetchDueDecisionOutcomes,
  fetchDueInsightCandidateOutcomes,
  finalizeDueOutcome,
  finalizeDueInsightCandidateOutcome,
  type NormalizedOutcomeLabel,
  type OutcomeRow,
  type OutcomeSourceType,
} from "../../services/outcomes.js";

export interface OutcomeGraphRunInput {
  now?: string;
  limit?: number;
  symbol?: string;
  run_id?: string;
}

export interface OutcomeGraphRunResult {
  run_id: string;
  processed_count: number;
  labeled_count: number;
  skipped_count: number;
  failed_count: number;
  counts_by_source_type: Record<OutcomeSourceType, number>;
  counts_by_normalized_label: Record<NormalizedOutcomeLabel, number>;
  outcomes: OutcomeRow[];
}

export interface OutcomeGraphDeps {
  fetchDueDecision?: typeof fetchDueDecisionOutcomes;
  finalizeDecision?: typeof finalizeDueOutcome;
  fetchDueInsight?: typeof fetchDueInsightCandidateOutcomes;
  finalizeInsight?: typeof finalizeDueInsightCandidateOutcome;
}

/** @deprecated Use runDueOutcomeGraph or the compiled outcomeGraph export. */
export class OutcomeGraph {
  constructor(private readonly deps: OutcomeGraphDeps = {}) { }

  async runDue(input: OutcomeGraphRunInput = {}): Promise<OutcomeGraphRunResult> {
    const { runDueOutcomeGraph } = await import("./outcomeGraph.js");
    return runDueOutcomeGraph(input, this.deps);
  }
}
