import { randomUUID } from "node:crypto";

import {
  fetchDueDecisionOutcomes,
  finalizeDueOutcome,
  type DecisionOutcomeRow,
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
  outcomes: DecisionOutcomeRow[];
}

export interface OutcomeGraphDeps {
  fetchDue?: typeof fetchDueDecisionOutcomes;
  finalize?: typeof finalizeDueOutcome;
}

export class OutcomeGraph {
  private readonly deps: Required<OutcomeGraphDeps>;

  constructor(deps: OutcomeGraphDeps = {}) {
    this.deps = {
      fetchDue: deps.fetchDue ?? fetchDueDecisionOutcomes,
      finalize: deps.finalize ?? finalizeDueOutcome,
    };
  }

  async runDue(input: OutcomeGraphRunInput = {}): Promise<OutcomeGraphRunResult> {
    const run_id = input.run_id ?? `run_${randomUUID().replace(/-/g, "")}`;
    const due = await this.deps.fetchDue({
      now: input.now,
      limit: input.limit ?? 100,
      symbol: input.symbol,
    });

    const outcomes: DecisionOutcomeRow[] = [];
    let labeled_count = 0;
    let skipped_count = 0;
    let failed_count = 0;

    for (const row of due) {
      if (row.status !== "pending") {
        continue;
      }
      const finalized = await this.deps.finalize({ outcome: row });
      outcomes.push(finalized);
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
