import { randomUUID } from "node:crypto";

import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";

import {
  createInsightExplorationGraphNodes,
  INSIGHT_EXPLORATION_GRAPH_NODE_NAMES,
  resolveInsightExplorationGraphNodeDeps,
  stateToInsightExplorationGraphResult,
  type InsightExplorationGraphNodeDeps,
} from "./insightExplorationGraph.nodes.js";
import { InsightExplorationGraphStateAnnotation } from "./insightExplorationGraph.state.js";
import type {
  InsightExplorationGraphDeps,
  InsightExplorationGraphInput,
  InsightExplorationGraphResult,
} from "./insightExplorationGraph.types.js";

export type {
  InsightExplorationGraphDeps,
  InsightExplorationGraphInput,
  InsightExplorationGraphResult,
} from "./insightExplorationGraph.types.js";
export {
  INSIGHT_REACT_MAX_STEPS,
  InsightExplorationGraph,
} from "./insightExplorationGraph.types.js";

export {
  INSIGHT_EXPLORATION_GRAPH_NODE_NAMES,
  stateToInsightExplorationGraphResult,
} from "./insightExplorationGraph.nodes.js";

function depsToNodeDeps(
  deps?: InsightExplorationGraphDeps,
): Partial<InsightExplorationGraphNodeDeps> {
  if (!deps) {
    return {};
  }
  return {
    fetchSnapshots: deps.fetchSnapshots,
    fetchOutcomes: deps.fetchOutcomes,
    runReAct: deps.runReAct,
    llm: deps.llm,
    persist: deps.persist,
  };
}

export function buildInsightExplorationGraph(options?: {
  deps?: InsightExplorationGraphDeps;
  checkpointer?: BaseCheckpointSaver;
}) {
  const nodes = createInsightExplorationGraphNodes(depsToNodeDeps(options?.deps));

  const graph = new StateGraph(InsightExplorationGraphStateAnnotation)
    .addNode("normalize_input", nodes.normalize_input)
    .addNode("fetch_exploration_inputs", nodes.fetch_exploration_inputs)
    .addNode("run_insight_react", nodes.run_insight_react)
    .addNode("build_insight_payload", nodes.build_insight_payload)
    .addNode("persist_insight_candidate", nodes.persist_insight_candidate)
    .addNode("final_output", nodes.final_output)
    .addEdge(START, "normalize_input")
    .addEdge("normalize_input", "fetch_exploration_inputs")
    .addEdge("fetch_exploration_inputs", "run_insight_react")
    .addEdge("run_insight_react", "build_insight_payload")
    .addEdge("build_insight_payload", "persist_insight_candidate")
    .addEdge("persist_insight_candidate", "final_output")
    .addEdge("final_output", END);

  return graph.compile({
    checkpointer: options?.checkpointer ?? new MemorySaver(),
  });
}

export const insightExplorationGraph = buildInsightExplorationGraph();

export async function runInsightExplorationGraph(
  input: InsightExplorationGraphInput,
  deps?: InsightExplorationGraphDeps,
): Promise<InsightExplorationGraphResult> {
  const run_id = input.run_id ?? `run_${randomUUID().replace(/-/g, "")}`;
  const graph = deps ? buildInsightExplorationGraph({ deps }) : insightExplorationGraph;
  const finalState = await graph.invoke(
    {
      run_id,
      thread_id: run_id,
      symbol: input.symbol.toUpperCase(),
      window: input.window,
      exploration_prompt: input.exploration_prompt,
      snapshot_limit: input.snapshot_limit ?? 20,
      outcome_limit: input.outcome_limit ?? 200,
      persist: input.persist ?? true,
    },
    {
      configurable: { thread_id: run_id },
    },
  );
  return stateToInsightExplorationGraphResult(finalState);
}
