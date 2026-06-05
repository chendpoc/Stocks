import { randomUUID } from "node:crypto";

import {
  fetchDueDecisionOutcomes,
  fetchDueInsightCandidateOutcomes,
  finalizeDueOutcome,
  finalizeDueInsightCandidateOutcome,
  normalizeDecisionLabel,
  normalizeOutcomeLabel,
  type DecisionOutcomeRow,
  type InsightCandidateOutcomeRow,
  type NormalizedOutcomeLabel,
  type OutcomeRow,
  type OutcomeSourceType,
} from "../../services/outcomes.js";
import type { OutcomeGraphState } from "./outcomeGraph.state.js";
import {
  ZERO_COUNTS_BY_LABEL,
  ZERO_COUNTS_BY_SOURCE,
} from "./outcomeGraph.state.js";
import type { OutcomeGraphRunResult } from "./outcomeGraph.types.js";

export interface OutcomeGraphNodeDeps {
  fetchDueDecision: typeof fetchDueDecisionOutcomes;
  finalizeDecision: typeof finalizeDueOutcome;
  fetchDueInsight: typeof fetchDueInsightCandidateOutcomes;
  finalizeInsight: typeof finalizeDueInsightCandidateOutcome;
}

export function resolveOutcomeGraphNodeDeps(
  overrides: Partial<OutcomeGraphNodeDeps> = {},
): OutcomeGraphNodeDeps {
  return {
    fetchDueDecision: overrides.fetchDueDecision ?? fetchDueDecisionOutcomes,
    finalizeDecision: overrides.finalizeDecision ?? finalizeDueOutcome,
    fetchDueInsight: overrides.fetchDueInsight ?? fetchDueInsightCandidateOutcomes,
    finalizeInsight: overrides.finalizeInsight ?? finalizeDueInsightCandidateOutcome,
  };
}

export function createOutcomeGraphNodes(overrides: Partial<OutcomeGraphNodeDeps> = {}) {
  const deps = resolveOutcomeGraphNodeDeps(overrides);

  async function normalize_input(
    state: OutcomeGraphState,
  ): Promise<Partial<OutcomeGraphState>> {
    const run_id = state.run_id || `run_${randomUUID().replace(/-/g, "")}`;
    return {
      run_id,
      thread_id: state.thread_id || run_id,
      now: state.now,
      limit: state.limit ?? 100,
      symbol: state.symbol?.toUpperCase(),
    };
  }

  async function fetch_due_outcomes(
    state: OutcomeGraphState,
  ): Promise<Partial<OutcomeGraphState>> {
    const query = {
      now: state.now,
      limit: state.limit ?? 100,
      symbol: state.symbol,
    };
    const [decision_due_rows, insight_due_rows] = await Promise.all([
      deps.fetchDueDecision(query),
      deps.fetchDueInsight(query),
    ]);
    return { decision_due_rows, insight_due_rows };
  }

  async function label_decision_outcomes(
    state: OutcomeGraphState,
  ): Promise<Partial<OutcomeGraphState>> {
    const outcomes: OutcomeRow[] = [];
    for (const row of state.decision_due_rows) {
      if (row.status !== "pending") {
        continue;
      }
      outcomes.push(await deps.finalizeDecision({ outcome: row }));
    }
    return { outcomes };
  }

  async function label_insight_outcomes(
    state: OutcomeGraphState,
  ): Promise<Partial<OutcomeGraphState>> {
    const outcomes: OutcomeRow[] = [];
    for (const row of state.insight_due_rows) {
      if (row.status !== "pending") {
        continue;
      }
      outcomes.push(await deps.finalizeInsight({ outcome: row }));
    }
    return { outcomes };
  }

  async function final_output(
    state: OutcomeGraphState,
  ): Promise<Partial<OutcomeGraphState>> {
    return aggregateOutcomeGraphCounts(state.outcomes);
  }

  return {
    normalize_input,
    fetch_due_outcomes,
    label_decision_outcomes,
    label_insight_outcomes,
    final_output,
  };
}

export type OutcomeGraphNodes = ReturnType<typeof createOutcomeGraphNodes>;

export const OUTCOME_GRAPH_NODE_NAMES = [
  "normalize_input",
  "fetch_due_outcomes",
  "label_decision_outcomes",
  "label_insight_outcomes",
  "final_output",
] as const;

function isDecisionOutcomeRow(row: OutcomeRow): row is DecisionOutcomeRow {
  return "decision_id" in row;
}

export function aggregateOutcomeGraphCounts(outcomes: OutcomeRow[]): {
  processed_count: number;
  labeled_count: number;
  skipped_count: number;
  failed_count: number;
  counts_by_source_type: Record<OutcomeSourceType, number>;
  counts_by_normalized_label: Record<NormalizedOutcomeLabel, number>;
} {
  let labeled_count = 0;
  let skipped_count = 0;
  let failed_count = 0;
  const counts_by_source_type = { ...ZERO_COUNTS_BY_SOURCE };
  const counts_by_normalized_label = { ...ZERO_COUNTS_BY_LABEL };

  for (const row of outcomes) {
    let normalized_label: NormalizedOutcomeLabel;
    if (isDecisionOutcomeRow(row)) {
      counts_by_source_type.decision += 1;
      normalized_label = normalizeDecisionLabel(
        typeof row.label === "string" ? row.label : "neutral",
      );
    } else {
      counts_by_source_type.insight_candidate += 1;
      normalized_label = normalizeOutcomeLabel({
        source_label: row.normalized_label ?? "neutral",
        source_type: "insight_candidate",
      });
    }
    counts_by_normalized_label[normalized_label] += 1;
    if (row.status === "labeled") {
      labeled_count += 1;
    } else if (row.status === "skipped") {
      skipped_count += 1;
    } else if (row.status === "failed") {
      failed_count += 1;
    }
  }

  return {
    processed_count: outcomes.length,
    labeled_count,
    skipped_count,
    failed_count,
    counts_by_source_type,
    counts_by_normalized_label,
  };
}

export function stateToOutcomeGraphResult(state: OutcomeGraphState): OutcomeGraphRunResult {
  if (!state.run_id) {
    throw new Error("OutcomeGraph state is incomplete: missing run_id");
  }
  return {
    run_id: state.run_id,
    processed_count: state.processed_count,
    labeled_count: state.labeled_count,
    skipped_count: state.skipped_count,
    failed_count: state.failed_count,
    counts_by_source_type: state.counts_by_source_type,
    counts_by_normalized_label: state.counts_by_normalized_label,
    outcomes: state.outcomes,
  };
}
