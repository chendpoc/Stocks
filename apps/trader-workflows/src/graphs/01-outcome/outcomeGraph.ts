import { randomUUID } from "node:crypto";

import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";

import {
  createOutcomeGraphNodes,
  OUTCOME_GRAPH_NODE_NAMES,
  resolveOutcomeGraphNodeDeps,
  stateToOutcomeGraphResult,
  type OutcomeGraphNodeDeps,
} from "./outcomeGraph.nodes.js";
import { OutcomeGraphStateAnnotation } from "./outcomeGraph.state.js";
import type {
  OutcomeGraphDeps,
  OutcomeGraphRunInput,
  OutcomeGraphRunResult,
} from "./outcomeGraph.types.js";

export type {
  OutcomeGraphDeps,
  OutcomeGraphRunInput,
  OutcomeGraphRunResult,
} from "./outcomeGraph.types.js";
export { OutcomeGraph } from "./outcomeGraph.types.js";

export {
  aggregateOutcomeGraphCounts,
  OUTCOME_GRAPH_NODE_NAMES,
  stateToOutcomeGraphResult,
} from "./outcomeGraph.nodes.js";

function depsToNodeDeps(deps?: OutcomeGraphDeps): Partial<OutcomeGraphNodeDeps> {
  if (!deps) {
    return {};
  }
  return {
    fetchDueDecision: deps.fetchDueDecision,
    finalizeDecision: deps.finalizeDecision,
    fetchDueInsight: deps.fetchDueInsight,
    finalizeInsight: deps.finalizeInsight,
  };
}

export function buildOutcomeGraph(options?: {
  deps?: OutcomeGraphDeps;
  checkpointer?: BaseCheckpointSaver;
}) {
  const nodes = createOutcomeGraphNodes(depsToNodeDeps(options?.deps));

  const graph = new StateGraph(OutcomeGraphStateAnnotation)
    .addNode("normalize_input", nodes.normalize_input)
    .addNode("fetch_due_outcomes", nodes.fetch_due_outcomes)
    .addNode("label_decision_outcomes", nodes.label_decision_outcomes)
    .addNode("label_insight_outcomes", nodes.label_insight_outcomes)
    .addNode("final_output", nodes.final_output)
    .addEdge(START, "normalize_input")
    .addEdge("normalize_input", "fetch_due_outcomes")
    .addEdge("fetch_due_outcomes", "label_decision_outcomes")
    .addEdge("label_decision_outcomes", "label_insight_outcomes")
    .addEdge("label_insight_outcomes", "final_output")
    .addEdge("final_output", END);

  return graph.compile({
    checkpointer: options?.checkpointer ?? new MemorySaver(),
  });
}

export const outcomeGraph = buildOutcomeGraph();

export async function runDueOutcomeGraph(
  input: OutcomeGraphRunInput = {},
  deps?: OutcomeGraphDeps,
): Promise<OutcomeGraphRunResult> {
  const run_id = input.run_id ?? `run_${randomUUID().replace(/-/g, "")}`;
  const graph = deps ? buildOutcomeGraph({ deps }) : outcomeGraph;
  const finalState = await graph.invoke(
    {
      run_id,
      thread_id: run_id,
      now: input.now,
      limit: input.limit ?? 100,
      symbol: input.symbol?.toUpperCase(),
    },
    {
      configurable: { thread_id: run_id },
    },
  );
  return stateToOutcomeGraphResult(finalState);
}
