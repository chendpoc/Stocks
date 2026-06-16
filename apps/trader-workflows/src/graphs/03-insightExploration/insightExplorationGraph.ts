import { prefixedId } from "../../utils/id.js";

import {
  runPipelineDefinition,
  type PipelineDefinition,
  type PipelineStep,
} from "../../runtime/pipeline.js";

import {
  createInsightExplorationGraphNodes,
  INSIGHT_EXPLORATION_GRAPH_NODE_NAMES,
  resolveInsightExplorationGraphNodeDeps,
  stateToInsightExplorationGraphResult,
  type InsightExplorationGraphNodeDeps,
} from "./insightExplorationGraph.nodes.js";
import {
  createInitialInsightExplorationGraphState,
  type InsightExplorationGraphState,
} from "./insightExplorationGraph.state.js";
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

export type CompiledInsightExplorationGraph = {
  invoke: (
    initial: Partial<InsightExplorationGraphState> | null,
    config?: { configurable?: { thread_id?: string } },
  ) => Promise<InsightExplorationGraphState>;
  getGraph: () => { nodes: Record<string, unknown> };
};

function depsToNodeDeps(
  deps?: InsightExplorationGraphDeps,
): Partial<InsightExplorationGraphNodeDeps> {
  if (!deps) {
    return {};
  }
  return {
    fetchSnapshots: deps.fetchSnapshots,
    fetchOutcomes: deps.fetchOutcomes,
    fetchEvaluationReport: deps.fetchEvaluationReport,
    runReAct: deps.runReAct,
    llm: deps.llm,
    persist: deps.persist,
    scheduleOutcome: deps.scheduleOutcome,
  };
}

export function buildInsightExplorationGraphSteps(
  deps?: InsightExplorationGraphDeps,
): PipelineStep<InsightExplorationGraphState>[] {
  const nodes = createInsightExplorationGraphNodes(depsToNodeDeps(deps));
  return [
    nodes.normalize_input,
    nodes.fetch_exploration_inputs,
    nodes.run_insight_react,
    nodes.build_insight_payload,
    nodes.persist_insight_candidate,
    nodes.final_output,
  ];
}

export function buildInsightExplorationGraphPipeline(options?: {
  deps?: InsightExplorationGraphDeps;
}): PipelineDefinition<InsightExplorationGraphState> {
  return {
    name: "InsightExplorationGraph",
    steps: buildInsightExplorationGraphSteps(options?.deps),
  };
}

function insightExplorationGraphNodeMap(): Record<string, unknown> {
  return Object.fromEntries(
    INSIGHT_EXPLORATION_GRAPH_NODE_NAMES.map((name) => [name, {}]),
  );
}

function toInitialInsightExplorationGraphState(
  initial: Partial<InsightExplorationGraphState>,
): InsightExplorationGraphState {
  const run_id = initial.run_id ?? prefixedId("run_");
  return createInitialInsightExplorationGraphState({
    run_id,
    thread_id: initial.thread_id ?? run_id,
    symbol: initial.symbol ?? "",
    window: initial.window ?? "",
    ...initial,
  });
}

export function buildInsightExplorationGraph(options?: {
  deps?: InsightExplorationGraphDeps;
  checkpointer?: unknown;
}): CompiledInsightExplorationGraph {
  const pipeline = buildInsightExplorationGraphPipeline({ deps: options?.deps });

  return {
    async invoke(initial, _config) {
      if (initial === null) {
        throw new Error(
          "InsightExplorationGraph pipeline resume requires Stage1CheckpointStore; invoke with initial state",
        );
      }
      return runPipelineDefinition(toInitialInsightExplorationGraphState(initial), pipeline);
    },
    getGraph() {
      return { nodes: insightExplorationGraphNodeMap() };
    },
  };
}

export const insightExplorationGraph = buildInsightExplorationGraph();

const defaultInsightExplorationGraphPipeline = buildInsightExplorationGraphPipeline();

export async function runInsightExplorationGraph(
  input: InsightExplorationGraphInput,
  deps?: InsightExplorationGraphDeps,
): Promise<InsightExplorationGraphResult> {
  const run_id = input.run_id ?? prefixedId("run_");
  const pipeline = deps
    ? buildInsightExplorationGraphPipeline({ deps })
    : defaultInsightExplorationGraphPipeline;
  const finalState = await runPipelineDefinition(
    toInitialInsightExplorationGraphState({
      run_id,
      thread_id: run_id,
      symbol: input.symbol.toUpperCase(),
      window: input.window,
      exploration_prompt: input.exploration_prompt,
      evaluation_report_id: input.evaluation_report_id,
      snapshot_limit: input.snapshot_limit ?? 20,
      outcome_limit: input.outcome_limit ?? 200,
      persist: input.persist ?? true,
    }),
    pipeline,
  );
  return stateToInsightExplorationGraphResult(finalState);
}
