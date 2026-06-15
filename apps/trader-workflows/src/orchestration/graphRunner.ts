import {
  GRAPH_NAME_DECISION,
  GRAPH_NAME_EVALUATION,
  GRAPH_NAME_INSIGHT_EXPLORATION,
  GRAPH_NAME_OUTCOME,
} from "../constants/graphNames.js";
import type {
  DecisionGraphInput,
  DecisionGraphResult,
} from "../graphs/00-decision/decisionGraph.types.js";
import type {
  OutcomeGraphRunInput,
  OutcomeGraphRunResult,
} from "../graphs/01-outcome/outcomeGraph.types.js";
import type {
  EvaluationGraphRunInput,
  EvaluationGraphRunResult,
} from "../graphs/02-evaluation/evaluationGraph.types.js";
import type {
  InsightExplorationGraphInput,
  InsightExplorationGraphResult,
} from "../graphs/03-insightExploration/insightExplorationGraph.types.js";
import type {
  Stage1Runtime,
  Stage1RuntimeGraphResult,
} from "../runtime/stage1Runtime.js";
import { logger } from "../runtime/logger.js";

export async function runDecisionGraphViaRuntime(
  runtime: Stage1Runtime,
  input: DecisionGraphInput,
): Promise<Stage1RuntimeGraphResult<DecisionGraphResult>> {
  logger.debug({ graph_name: GRAPH_NAME_DECISION, symbol: input.symbol }, "graphRunner.start");
  return runtime.runGraph({
    graph_name: GRAPH_NAME_DECISION,
    input: input as unknown as Record<string, unknown>,
  });
}

export async function runOutcomeGraphViaRuntime(
  runtime: Stage1Runtime,
  input: OutcomeGraphRunInput,
): Promise<Stage1RuntimeGraphResult<OutcomeGraphRunResult>> {
  logger.debug({ graph_name: GRAPH_NAME_OUTCOME }, "graphRunner.start");
  return runtime.runGraph({
    graph_name: GRAPH_NAME_OUTCOME,
    input: input as unknown as Record<string, unknown>,
  });
}

export async function runEvaluationGraphViaRuntime(
  runtime: Stage1Runtime,
  input: EvaluationGraphRunInput,
): Promise<Stage1RuntimeGraphResult<EvaluationGraphRunResult>> {
  logger.debug({ graph_name: GRAPH_NAME_EVALUATION }, "graphRunner.start");
  return runtime.runGraph({
    graph_name: GRAPH_NAME_EVALUATION,
    input: input as unknown as Record<string, unknown>,
  });
}

export async function runInsightExplorationGraphViaRuntime(
  runtime: Stage1Runtime,
  input: InsightExplorationGraphInput,
): Promise<Stage1RuntimeGraphResult<InsightExplorationGraphResult>> {
  logger.debug(
    { graph_name: GRAPH_NAME_INSIGHT_EXPLORATION, symbol: input.symbol },
    "graphRunner.start",
  );
  return runtime.runGraph({
    graph_name: GRAPH_NAME_INSIGHT_EXPLORATION,
    input: input as unknown as Record<string, unknown>,
  });
}
