import { randomUUID } from "node:crypto";

import {
  fetchDueDecisionOutcomes,
  finalizeDueOutcome,
  fetchDueInsightCandidateOutcomes,
  finalizeDueInsightCandidateOutcome,
  normalizeDecisionLabel,
  normalizeOutcomeLabel,
  type DecisionOutcomeRow,
  type InsightCandidateOutcomeRow,
  type NormalizedOutcomeLabel,
  type OutcomeRow,
  type OutcomeSourceType,
} from "../services/outcomes.js";

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

const ZERO_COUNTS_BY_SOURCE: Record<OutcomeSourceType, number> = {
  decision: 0,
  insight_candidate: 0,
};

const ZERO_COUNTS_BY_LABEL: Record<NormalizedOutcomeLabel, number> = {
  hit: 0,
  miss: 0,
  neutral: 0,
  invalid: 0,
  insufficient_data: 0,
};

export class OutcomeGraph {
  private readonly deps: Required<OutcomeGraphDeps>;

  constructor(deps: OutcomeGraphDeps = {}) {
    this.deps = {
      fetchDueDecision: deps.fetchDueDecision ?? fetchDueDecisionOutcomes,
      finalizeDecision: deps.finalizeDecision ?? finalizeDueOutcome,
      fetchDueInsight: deps.fetchDueInsight ?? fetchDueInsightCandidateOutcomes,
      finalizeInsight: deps.finalizeInsight ?? finalizeDueInsightCandidateOutcome,
    };
  }

  async runDue(input: OutcomeGraphRunInput = {}): Promise<OutcomeGraphRunResult> {
    const run_id = input.run_id ?? `run_${randomUUID().replace(/-/g, "")}`;

    const [decisionRows, insightRows] = await Promise.all([
      this.deps.fetchDueDecision({
        now: input.now,
        limit: input.limit ?? 100,
        symbol: input.symbol,
      }),
      this.deps.fetchDueInsight({
        now: input.now,
        limit: input.limit ?? 100,
        symbol: input.symbol,
      }),
    ]);

    const outcomes: OutcomeRow[] = [];
    let labeled_count = 0;
    let skipped_count = 0;
    let failed_count = 0;
    const counts_by_source_type = { ...ZERO_COUNTS_BY_SOURCE };
    const counts_by_normalized_label = { ...ZERO_COUNTS_BY_LABEL };

    // Process decision outcomes
    for (const row of decisionRows) {
      if (row.status !== "pending") {
        continue;
      }
      const finalized = await this.deps.finalizeDecision({ outcome: row });
      const normalized_label = normalizeDecisionLabel(
        typeof finalized.label === "string" ? finalized.label : "neutral",
      );
      outcomes.push(finalized);
      counts_by_source_type.decision += 1;
      counts_by_normalized_label[normalized_label] += 1;
      if (finalized.status === "labeled") {
        labeled_count += 1;
      } else if (finalized.status === "skipped") {
        skipped_count += 1;
      } else if (finalized.status === "failed") {
        failed_count += 1;
      }
    }

    // Process insight candidate outcomes
    for (const row of insightRows) {
      if (row.status !== "pending") {
        continue;
      }
      const finalized = await this.deps.finalizeInsight({ outcome: row });
      const normalized_label = normalizeOutcomeLabel({
        source_label: finalized.normalized_label ?? "neutral",
        source_type: "insight_candidate",
      });
      outcomes.push(finalized);
      counts_by_source_type.insight_candidate += 1;
      counts_by_normalized_label[normalized_label] += 1;
      if (finalized.status === "labeled") {
        labeled_count += 1;
      } else if (finalized.status === "skipped") {
        skipped_count += 1;
      } else if (finalized.status === "failed") {
        failed_count += 1;
      }
    }

    return {
      run_id,
      processed_count: outcomes.length,
      labeled_count,
      skipped_count,
      failed_count,
      counts_by_source_type,
      counts_by_normalized_label,
      outcomes,
    };
  }
}

export async function runDueOutcomeGraph(
  input: OutcomeGraphRunInput = {},
  deps?: OutcomeGraphDeps,
): Promise<OutcomeGraphRunResult> {
  return new OutcomeGraph(deps).runDue(input);
}
