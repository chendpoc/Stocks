import { randomUUID } from "node:crypto";

import {
  createEvaluationReport,
  fetchDecisionOutcomesForEvaluation,
  fetchInsightCandidateOutcomesForEvaluation,
  fetchModelDecisionsForEvaluation,
} from "../../data/evaluation.js";
import {
  composeEvaluationReport,
  type BuildEvaluationReportInput,
  type EvaluationReportPayload,
  type EvaluationReportRecord,
} from "../../services/evaluation.js";
import type { EvaluationGraphState } from "./evaluationGraph.state.js";
import type { EvaluationGraphRunResult } from "./evaluationGraph.types.js";

export type BuildEvaluationReport = (
  input: BuildEvaluationReportInput,
) => Promise<EvaluationReportPayload>;

export interface EvaluationGraphNodeDeps {
  fetchDecisionOutcomes: typeof fetchDecisionOutcomesForEvaluation;
  fetchModelDecisions: typeof fetchModelDecisionsForEvaluation;
  fetchInsightCandidateOutcomes: typeof fetchInsightCandidateOutcomesForEvaluation;
  composeReport: typeof composeEvaluationReport;
  build: BuildEvaluationReport;
  persist: typeof createEvaluationReport;
}

export async function orchestrateBuildEvaluationReport(
  input: BuildEvaluationReportInput,
  deps: Pick<
    EvaluationGraphNodeDeps,
    | "fetchDecisionOutcomes"
    | "fetchModelDecisions"
    | "fetchInsightCandidateOutcomes"
    | "composeReport"
  >,
): Promise<EvaluationReportPayload> {
  const model_version = input.model_version ?? "stage1-v0";
  const limit = input.limit ?? 500;

  const [outcomes, decisions, insightCandidateOutcomes] = await Promise.all([
    deps.fetchDecisionOutcomes({
      symbol: input.symbol,
      limit,
    }),
    deps.fetchModelDecisions({
      symbol: input.symbol,
      model_version,
      limit,
    }),
    deps.fetchInsightCandidateOutcomes({
      symbol: input.symbol,
      limit,
    }),
  ]);

  return deps.composeReport({
    outcomes,
    decisions,
    insightCandidateOutcomes,
    model_version,
    report_id: input.report_id,
    window_start: input.window_start,
    window_end: input.window_end,
  });
}

export function resolveEvaluationGraphNodeDeps(
  overrides: Partial<EvaluationGraphNodeDeps> = {},
): EvaluationGraphNodeDeps {
  const fetchDecisionOutcomes =
    overrides.fetchDecisionOutcomes ?? fetchDecisionOutcomesForEvaluation;
  const fetchModelDecisions =
    overrides.fetchModelDecisions ?? fetchModelDecisionsForEvaluation;
  const fetchInsightCandidateOutcomes =
    overrides.fetchInsightCandidateOutcomes ?? fetchInsightCandidateOutcomesForEvaluation;
  const composeReport = overrides.composeReport ?? composeEvaluationReport;
  const orchestrationDeps = {
    fetchDecisionOutcomes,
    fetchModelDecisions,
    fetchInsightCandidateOutcomes,
    composeReport,
  };

  return {
    ...orchestrationDeps,
    build:
      overrides.build ??
      ((input) => orchestrateBuildEvaluationReport(input, orchestrationDeps)),
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
