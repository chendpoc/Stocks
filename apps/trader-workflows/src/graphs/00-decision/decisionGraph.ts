import { prefixedId } from "../../utils/id.js";

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
  applyMarketRegimeRiskAdjustment,
  deterministicDecisionId,
  DECISION_GRAPH_NODE_NAMES,
  stateToDecisionGraphResult,
} from "./decisionGraph.nodes.js";

export {
  buildEvidence,
  generateContra,
  generateContraWithFallback,
  runMidDayDeepAnalysis,
  runSwarmLead,
  runSwarmWorkers,
  shouldUseSwarm,
} from "./decisionGraph.llmNodes.js";
export type {
  BuildEvidenceInput,
  GateDecision,
  LlmNodeDeps,
  SwarmWorkerResult,
} from "./decisionGraph.llmNodes.js";
export {
  EvidenceResultSchema,
  applyEvidenceGuardrails,
} from "./evidenceResult.js";
export {
  ContraResultSchema,
  applyContraGuardrails,
} from "./contraResult.js";

function depsToNodeDeps(deps?: DecisionGraphDeps): Partial<DecisionGraphNodeDeps> {
  if (!deps) {
    return {};
  }
  return {
    buildContext: deps.buildContext,
    llm: deps.llm,
    persistDecision: deps.persistDecision,
    scheduleOutcomes: deps.scheduleOutcomes,
    llmNodes: deps.llmNodes,
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
    .addNode("build_evidence", nodes.build_evidence)
    .addNode("generate_contra", nodes.generate_contra)
    .addNode("run_swarm_analysis", nodes.run_swarm_analysis)
    .addNode("generate_decision_envelope", nodes.generate_decision_envelope)
    .addNode("validate_decision_envelope", nodes.validate_decision_envelope)
    .addNode("persist_model_decision", nodes.persist_model_decision)
    .addNode("schedule_model_path_outcomes", nodes.schedule_model_path_outcomes)
    .addNode("final_output", nodes.final_output)
    .addEdge(START, "normalize_input")
    .addEdge("normalize_input", "build_context_snapshot")
    .addEdge("build_context_snapshot", "build_evidence")
    .addEdge("build_evidence", "generate_contra")
    .addEdge("generate_contra", "run_swarm_analysis")
    .addEdge("run_swarm_analysis", "generate_decision_envelope")
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
  const run_id = input.run_id ?? prefixedId("run_");
  const graph = deps ? buildDecisionGraph({ deps }) : decisionGraph;
  const finalState = await graph.invoke(
    {
      run_id,
      thread_id: run_id,
      symbol: input.symbol,
      setup_name: input.setup_name ?? "",
      gate_decision: input.gate_decision ?? {
        complexity_score: 0.1,
        symbols: [input.symbol.toUpperCase()],
      },
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
