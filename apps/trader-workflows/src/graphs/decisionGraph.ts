import { randomUUID } from "node:crypto";

import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";

import {
  createDecisionGraphNodes,
  DECISION_GRAPH_NODE_NAMES,
  resolveDecisionGraphNodeDeps,
  stateToDecisionGraphResult,
  type DecisionGraphNodeDeps,
} from "./decisionGraph.nodes.js";
import { DecisionGraphStateAnnotation } from "./decisionGraph.state.js";

import type {
  DecisionGraphDeps,
  DecisionGraphInput,
  DecisionGraphResult,
} from "./decisionGraph.types.js";

export type {
  DecisionGraphDeps,
  DecisionGraphInput,
  DecisionGraphResult,
} from "./decisionGraph.types.js";
export { DecisionGraph } from "./decisionGraph.types.js";

export {
  deterministicDecisionId,
  DECISION_GRAPH_NODE_NAMES,
  stateToDecisionGraphResult,
} from "./decisionGraph.nodes.js";

function depsToNodeDeps(deps?: DecisionGraphDeps): Partial<DecisionGraphNodeDeps> {
  if (!deps) {
    return {};
  }
  return {
    buildContext: deps.buildContext,
    llm: deps.llm,
    persistDecision: deps.persistDecision,
    scheduleOutcomes: deps.scheduleOutcomes,
  };
}

export function buildDecisionGraph(options?: {
  deps?: DecisionGraphDeps;
  checkpointer?: BaseCheckpointSaver;
}) {
  const nodes = createDecisionGraphNodes(depsToNodeDeps(options?.deps));

  const graph = new StateGraph(DecisionGraphStateAnnotation)
    .addNode("normalize_input", nodes.normalize_input)
    .addNode("build_context_snapshot", nodes.build_context_snapshot)
    .addNode("generate_decision_envelope", nodes.generate_decision_envelope)
    .addNode("validate_decision_envelope", nodes.validate_decision_envelope)
    .addNode("persist_model_decision", nodes.persist_model_decision)
    .addNode("schedule_model_path_outcomes", nodes.schedule_model_path_outcomes)
    .addNode("final_output", nodes.final_output)
    .addEdge(START, "normalize_input")
    .addEdge("normalize_input", "build_context_snapshot")
    .addEdge("build_context_snapshot", "generate_decision_envelope")
    .addEdge("generate_decision_envelope", "validate_decision_envelope")
    .addEdge("validate_decision_envelope", "persist_model_decision")
    .addEdge("persist_model_decision", "schedule_model_path_outcomes")
    .addEdge("schedule_model_path_outcomes", "final_output")
    .addEdge("final_output", END);

  return graph.compile({
    checkpointer: options?.checkpointer ?? new MemorySaver(),
  });
}

export const decisionGraph = buildDecisionGraph();

export async function runDecisionGraph(
  input: DecisionGraphInput,
  deps?: DecisionGraphDeps,
): Promise<DecisionGraphResult> {
  const run_id = input.run_id ?? `run_${randomUUID().replace(/-/g, "")}`;
  const graph = deps ? buildDecisionGraph({ deps }) : decisionGraph;
  const finalState = await graph.invoke(
    {
      run_id,
      thread_id: run_id,
      symbol: input.symbol,
      taskType: input.taskType,
      asof_ts: input.asof_ts,
      model_version: input.model_version,
    },
    {
      configurable: { thread_id: run_id },
    },
  );
  return stateToDecisionGraphResult(finalState);
}

export async function invokeDecisionGraphState(
  input: DecisionGraphInput,
  deps?: DecisionGraphDeps,
): Promise<DecisionGraphResult> {
  return runDecisionGraph(input, deps);
}
