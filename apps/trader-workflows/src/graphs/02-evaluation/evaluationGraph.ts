import { prefixedId } from "../../utils/id.js";

import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";

import {
  createEvaluationGraphNodes,
  EVALUATION_GRAPH_NODE_NAMES,
  resolveEvaluationGraphNodeDeps,
  stateToEvaluationGraphResult,
  type EvaluationGraphNodeDeps,
} from "./evaluationGraph.nodes.js";
import { EvaluationGraphStateAnnotation } from "./evaluationGraph.state.js";
import type {
  EvaluationGraphDeps,
  EvaluationGraphRunInput,
  EvaluationGraphRunResult,
} from "./evaluationGraph.types.js";

export type {
  EvaluationGraphDeps,
  EvaluationGraphRunInput,
  EvaluationGraphRunResult,
} from "./evaluationGraph.types.js";
export { EvaluationGraph } from "./evaluationGraph.types.js";

export {
  EVALUATION_GRAPH_NODE_NAMES,
  stateToEvaluationGraphResult,
} from "./evaluationGraph.nodes.js";

function depsToNodeDeps(deps?: EvaluationGraphDeps): Partial<EvaluationGraphNodeDeps> {
  if (!deps) {
    return {};
  }
  return {
    build: deps.build,
    persist: deps.persist,
  };
}

export function buildEvaluationGraph(options?: {
  deps?: EvaluationGraphDeps;
  checkpointer?: BaseCheckpointSaver;
}) {
  const nodes = createEvaluationGraphNodes(depsToNodeDeps(options?.deps));

  const graph = new StateGraph(EvaluationGraphStateAnnotation)
    .addNode("normalize_input", nodes.normalize_input)
    .addNode("build_evaluation_report", nodes.build_evaluation_report)
    .addNode("persist_evaluation_report", nodes.persist_evaluation_report)
    .addNode("final_output", nodes.final_output)
    .addEdge(START, "normalize_input")
    .addEdge("normalize_input", "build_evaluation_report")
    .addEdge("build_evaluation_report", "persist_evaluation_report")
    .addEdge("persist_evaluation_report", "final_output")
    .addEdge("final_output", END);

  return graph.compile({
    checkpointer: options?.checkpointer ?? new MemorySaver(),
  });
}

export const evaluationGraph = buildEvaluationGraph();

export async function runEvaluationSummaryGraph(
  input: EvaluationGraphRunInput = {},
  deps?: EvaluationGraphDeps,
): Promise<EvaluationGraphRunResult> {
  const run_id = input.run_id ?? prefixedId("run_");
  const graph = deps ? buildEvaluationGraph({ deps }) : evaluationGraph;
  const finalState = await graph.invoke(
    {
      run_id,
      thread_id: run_id,
      model_version: input.model_version ?? "stage1-v0",
      symbol: input.symbol?.toUpperCase(),
      limit: input.limit ?? 500,
      persist: input.persist ?? true,
      report_id: input.report_id,
      window_start: input.window_start,
      window_end: input.window_end,
    },
    {
      configurable: { thread_id: run_id },
    },
  );
  return stateToEvaluationGraphResult(finalState);
}
