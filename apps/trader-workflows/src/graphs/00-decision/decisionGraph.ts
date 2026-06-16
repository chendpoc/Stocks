import { prefixedId } from "../../utils/id.js";

import {
  runPipelineDefinition,
  type PipelineDefinition,
  type PipelineStep,
} from "../../runtime/pipeline.js";

import {
  createDecisionGraphNodes,
  DECISION_GRAPH_NODE_NAMES,
  resolveDecisionGraphNodeDeps,
  stateToDecisionGraphResult,
  type DecisionGraphNodeDeps,
} from "./decisionGraph.nodes.js";
import {
  createInitialDecisionGraphState,
  type DecisionGraphState,
} from "./decisionGraph.state.js";

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

const DECISION_GRAPH_MERGE_OPTIONS = {
  accumulatorFields: ["errors"] as const,
};

export type CompiledDecisionGraph = {
  invoke: (
    initial: Partial<DecisionGraphState> | null,
    config?: { configurable?: { thread_id?: string } },
  ) => Promise<DecisionGraphState>;
  getGraph: () => { nodes: Record<string, unknown> };
};

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

export function buildDecisionGraphSteps(
  deps?: DecisionGraphDeps,
): PipelineStep<DecisionGraphState>[] {
  const nodes = createDecisionGraphNodes(depsToNodeDeps(deps));
  return [
    nodes.normalize_input,
    nodes.build_context_snapshot,
    nodes.build_evidence,
    nodes.generate_contra,
    nodes.run_swarm_analysis,
    nodes.generate_decision_envelope,
    nodes.validate_decision_envelope,
    nodes.persist_model_decision,
    nodes.schedule_model_path_outcomes,
    nodes.final_output,
  ];
}

export function buildDecisionGraphPipeline(options?: {
  deps?: DecisionGraphDeps;
}): PipelineDefinition<DecisionGraphState> {
  return {
    name: "DecisionGraph",
    steps: buildDecisionGraphSteps(options?.deps),
  };
}

function decisionGraphNodeMap(): Record<string, unknown> {
  return Object.fromEntries(
    DECISION_GRAPH_NODE_NAMES.map((name) => [name, {}]),
  );
}

function toInitialDecisionGraphState(
  initial: Partial<DecisionGraphState>,
): DecisionGraphState {
  return createInitialDecisionGraphState({
    run_id: initial.run_id ?? prefixedId("run_"),
    thread_id: initial.thread_id ?? initial.run_id ?? prefixedId("run_"),
    symbol: initial.symbol ?? "",
    taskType: initial.taskType ?? "",
    asof_ts: initial.asof_ts ?? "",
    model_version: initial.model_version ?? "",
    ...initial,
  });
}

export function buildDecisionGraph(options?: {
  deps?: DecisionGraphDeps;
  checkpointer?: unknown;
}): CompiledDecisionGraph {
  const pipeline = buildDecisionGraphPipeline({ deps: options?.deps });

  return {
    async invoke(initial, _config) {
      if (initial === null) {
        throw new Error(
          "DecisionGraph pipeline resume requires Stage1CheckpointStore (S4); invoke with initial state",
        );
      }
      const state = toInitialDecisionGraphState(initial);
      return runPipelineDefinition(state, pipeline, DECISION_GRAPH_MERGE_OPTIONS);
    },
    getGraph() {
      return { nodes: decisionGraphNodeMap() };
    },
  };
}

export const decisionGraph = buildDecisionGraph();

const defaultDecisionGraphPipeline = buildDecisionGraphPipeline();

export async function runDecisionGraph(
  input: DecisionGraphInput,
  deps?: DecisionGraphDeps,
): Promise<DecisionGraphResult> {
  const run_id = input.run_id ?? prefixedId("run_");
  const pipeline = deps
    ? buildDecisionGraphPipeline({ deps })
    : defaultDecisionGraphPipeline;
  const finalState = await runPipelineDefinition(
    toInitialDecisionGraphState({
      run_id,
      thread_id: run_id,
      symbol: input.symbol,
      setup_name: input.setup_name ?? "",
      gate_decision: input.gate_decision ?? {
        complexity_score: 0.1,
        symbols: [input.symbol.toUpperCase()],
      },
      taskType: input.taskType ?? "",
      asof_ts: input.asof_ts ?? "",
      model_version: input.model_version ?? "",
    }),
    pipeline,
    DECISION_GRAPH_MERGE_OPTIONS,
  );
  return stateToDecisionGraphResult(finalState);
}

export async function invokeDecisionGraphState(
  input: DecisionGraphInput,
  deps?: DecisionGraphDeps,
): Promise<DecisionGraphResult> {
  return runDecisionGraph(input, deps);
}
