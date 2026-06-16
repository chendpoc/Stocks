import { prefixedId } from "../../utils/id.js";

import {
  runPipelineDefinition,
  type PipelineDefinition,
  type PipelineStep,
} from "../../runtime/pipeline.js";

import {
  createOutcomeGraphNodes,
  OUTCOME_GRAPH_NODE_NAMES,
  resolveOutcomeGraphNodeDeps,
  stateToOutcomeGraphResult,
  type OutcomeGraphNodeDeps,
} from "./outcomeGraph.nodes.js";
import {
  createInitialOutcomeGraphState,
  type OutcomeGraphState,
} from "./outcomeGraph.state.js";
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

const OUTCOME_GRAPH_MERGE_OPTIONS = {
  accumulatorFields: ["outcomes"] as const,
};

export type CompiledOutcomeGraph = {
  invoke: (
    initial: Partial<OutcomeGraphState> | null,
    config?: { configurable?: { thread_id?: string } },
  ) => Promise<OutcomeGraphState>;
  getGraph: () => { nodes: Record<string, unknown> };
};

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

export function buildOutcomeGraphSteps(
  deps?: OutcomeGraphDeps,
): PipelineStep<OutcomeGraphState>[] {
  const nodes = createOutcomeGraphNodes(depsToNodeDeps(deps));
  return [
    nodes.normalize_input,
    nodes.fetch_due_outcomes,
    nodes.label_decision_outcomes,
    nodes.label_insight_outcomes,
    nodes.final_output,
  ];
}

export function buildOutcomeGraphPipeline(options?: {
  deps?: OutcomeGraphDeps;
}): PipelineDefinition<OutcomeGraphState> {
  return {
    name: "OutcomeGraph",
    steps: buildOutcomeGraphSteps(options?.deps),
  };
}

function outcomeGraphNodeMap(): Record<string, unknown> {
  return Object.fromEntries(
    OUTCOME_GRAPH_NODE_NAMES.map((name) => [name, {}]),
  );
}

function toInitialOutcomeGraphState(
  initial: Partial<OutcomeGraphState>,
): OutcomeGraphState {
  const run_id = initial.run_id ?? prefixedId("run_");
  return createInitialOutcomeGraphState({
    run_id,
    thread_id: initial.thread_id ?? run_id,
    ...initial,
  });
}

export function buildOutcomeGraph(options?: {
  deps?: OutcomeGraphDeps;
  checkpointer?: unknown;
}): CompiledOutcomeGraph {
  const pipeline = buildOutcomeGraphPipeline({ deps: options?.deps });

  return {
    async invoke(initial, _config) {
      if (initial === null) {
        throw new Error(
          "OutcomeGraph pipeline resume requires Stage1CheckpointStore (S4); invoke with initial state",
        );
      }
      const state = toInitialOutcomeGraphState(initial);
      return runPipelineDefinition(state, pipeline, OUTCOME_GRAPH_MERGE_OPTIONS);
    },
    getGraph() {
      return { nodes: outcomeGraphNodeMap() };
    },
  };
}

export const outcomeGraph = buildOutcomeGraph();

const defaultOutcomeGraphPipeline = buildOutcomeGraphPipeline();

export async function runDueOutcomeGraph(
  input: OutcomeGraphRunInput = {},
  deps?: OutcomeGraphDeps,
): Promise<OutcomeGraphRunResult> {
  const run_id = input.run_id ?? prefixedId("run_");
  const pipeline = deps
    ? buildOutcomeGraphPipeline({ deps })
    : defaultOutcomeGraphPipeline;
  const finalState = await runPipelineDefinition(
    toInitialOutcomeGraphState({
      run_id,
      thread_id: run_id,
      now: input.now,
      limit: input.limit ?? 100,
      symbol: input.symbol?.toUpperCase(),
    }),
    pipeline,
    OUTCOME_GRAPH_MERGE_OPTIONS,
  );
  return stateToOutcomeGraphResult(finalState);
}
