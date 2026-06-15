import { prefixedId } from "../../utils/id.js";

import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";

import { ALPHA_RESEARCH_INPUT_VALIDATION_FAILED } from "../../services/alphaResearch.js";
import {
  ALPHA_RESEARCH_GRAPH_NODE_NAMES,
  createAlphaResearchGraphNodes,
  resolveAlphaResearchGraphNodeDeps,
  stateToAlphaResearchGraphResult,
  type AlphaResearchGraphNodeDeps,
} from "./alphaResearchGraph.nodes.js";
import { AlphaResearchGraphStateAnnotation } from "./alphaResearchGraph.state.js";
import type {
  AlphaResearchGraphDeps,
  AlphaResearchGraphInput,
  AlphaResearchGraphResult,
} from "./alphaResearchGraph.types.js";

export type {
  AlphaResearchGraphDeps,
  AlphaResearchGraphInput,
  AlphaResearchGraphResult,
} from "./alphaResearchGraph.types.js";
export { AlphaResearchGraph } from "./alphaResearchGraph.types.js";

export {
  ALPHA_RESEARCH_GRAPH_NODE_NAMES,
  stateToAlphaResearchGraphResult,
} from "./alphaResearchGraph.nodes.js";

function depsToNodeDeps(deps?: AlphaResearchGraphDeps): Partial<AlphaResearchGraphNodeDeps> {
  if (!deps?.client) {
    return {};
  }
  return { client: deps.client };
}

function routeAfterValidation(state: typeof AlphaResearchGraphStateAnnotation.State): string {
  return state.status === ALPHA_RESEARCH_INPUT_VALIDATION_FAILED
    ? "final_output"
    : "create_rule_candidate";
}

export function buildAlphaResearchGraph(options?: {
  deps?: AlphaResearchGraphDeps;
  checkpointer?: BaseCheckpointSaver;
}) {
  const nodes = createAlphaResearchGraphNodes(depsToNodeDeps(options?.deps));

  const graph = new StateGraph(AlphaResearchGraphStateAnnotation)
    .addNode("validate_input", nodes.validate_input)
    .addNode("create_rule_candidate", nodes.create_rule_candidate)
    .addNode("run_lite_backtest", nodes.run_lite_backtest)
    .addNode("final_output", nodes.final_output)
    .addEdge(START, "validate_input")
    .addConditionalEdges("validate_input", routeAfterValidation, [
      "create_rule_candidate",
      "final_output",
    ])
    .addEdge("create_rule_candidate", "run_lite_backtest")
    .addEdge("run_lite_backtest", "final_output")
    .addEdge("final_output", END);

  return graph.compile({
    checkpointer: options?.checkpointer ?? new MemorySaver(),
  });
}

export const alphaResearchGraph = buildAlphaResearchGraph();

export async function runAlphaResearchGraph(
  input: AlphaResearchGraphInput = {},
  deps?: AlphaResearchGraphDeps,
): Promise<AlphaResearchGraphResult> {
  const run_id = input.run_id ?? prefixedId("run_");
  const graph = deps ? buildAlphaResearchGraph({ deps }) : alphaResearchGraph;
  const finalState = await graph.invoke(
    {
      run_id,
      thread_id: run_id,
      input: {
        insight_id: input.insight_id,
        run_id: input.run_id,
        symbol: input.symbol,
        thesis: input.thesis,
        evidence_refs: input.evidence_refs,
        alpha_seed: input.alpha_seed,
        backtest_window_start: input.backtest_window_start,
        backtest_window_end: input.backtest_window_end,
      },
    },
    {
      configurable: { thread_id: run_id },
    },
  );
  return stateToAlphaResearchGraphResult(finalState);
}
