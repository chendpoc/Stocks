import { randomUUID } from "node:crypto";

import {
  buildEvaluationReport,
  createEvaluationReport,
} from "../../services/evaluation.js";
import type { EvaluationGraphState } from "./evaluationGraph.state.js";
import type { EvaluationGraphRunResult } from "./evaluationGraph.types.js";

export interface EvaluationGraphNodeDeps {
  build: typeof buildEvaluationReport;
  persist: typeof createEvaluationReport;
}

export function resolveEvaluationGraphNodeDeps(
  overrides: Partial<EvaluationGraphNodeDeps> = {},
): EvaluationGraphNodeDeps {
  return {
    build: overrides.build ?? buildEvaluationReport,
    persist: overrides.persist ?? createEvaluationReport,
  };
}

export function createEvaluationGraphNodes(overrides: Partial<EvaluationGraphNodeDeps> = {}) {
  const deps = resolveEvaluationGraphNodeDeps(overrides);

  async function normalize_input(
    state: EvaluationGraphState,
  ): Promise<Partial<EvaluationGraphState>> {
    const run_id = state.run_id || `run_${randomUUID().replace(/-/g, "")}`;
    return {
      run_id,
      thread_id: state.thread_id || run_id,
      model_version: state.model_version || "stage1-v0",
      symbol: state.symbol?.toUpperCase(),
      limit: state.limit ?? 500,
      persist: state.persist ?? true,
    };
  }

  async function build_evaluation_report(
    state: EvaluationGraphState,
  ): Promise<Partial<EvaluationGraphState>> {
    const report = await deps.build({
      model_version: state.model_version,
      symbol: state.symbol,
      limit: state.limit,
      report_id: state.report_id,
      window_start: state.window_start,
      window_end: state.window_end,
    });
    return { report };
  }

  async function persist_evaluation_report(
    state: EvaluationGraphState,
  ): Promise<Partial<EvaluationGraphState>> {
    if (!state.report) {
      throw new Error("EvaluationGraph state is incomplete: missing report");
    }
    if (!state.persist) {
      return { persisted_report: null };
    }
    const persisted_report = await deps.persist(state.report);
    return { persisted_report };
  }

  async function final_output(_state: EvaluationGraphState): Promise<Partial<EvaluationGraphState>> {
    return {};
  }

  return {
    normalize_input,
    build_evaluation_report,
    persist_evaluation_report,
    final_output,
  };
}

export type EvaluationGraphNodes = ReturnType<typeof createEvaluationGraphNodes>;

export const EVALUATION_GRAPH_NODE_NAMES = [
  "normalize_input",
  "build_evaluation_report",
  "persist_evaluation_report",
  "final_output",
] as const;

export function stateToEvaluationGraphResult(
  state: EvaluationGraphState,
): EvaluationGraphRunResult {
  if (!state.run_id || !state.report) {
    throw new Error("EvaluationGraph state is incomplete");
  }
  return {
    run_id: state.run_id,
    report: state.report,
    persisted_report: state.persisted_report,
  };
}
