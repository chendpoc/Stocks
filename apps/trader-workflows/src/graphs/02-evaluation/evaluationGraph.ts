import { prefixedId } from "../../utils/id.js";

import {
  runPipelineDefinition,
  type PipelineDefinition,
  type PipelineStep,
} from "../../runtime/pipeline.js";

import {
  createEvaluationGraphNodes,
  EVALUATION_GRAPH_NODE_NAMES,
  resolveEvaluationGraphNodeDeps,
  stateToEvaluationGraphResult,
  type EvaluationGraphNodeDeps,
} from "./evaluationGraph.nodes.js";
import {
  createInitialEvaluationGraphState,
  type EvaluationGraphState,
} from "./evaluationGraph.state.js";
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

export type CompiledEvaluationGraph = {
  invoke: (
    initial: Partial<EvaluationGraphState> | null,
    config?: { configurable?: { thread_id?: string } },
  ) => Promise<EvaluationGraphState>;
  getGraph: () => { nodes: Record<string, unknown> };
};

function depsToNodeDeps(deps?: EvaluationGraphDeps): Partial<EvaluationGraphNodeDeps> {
  if (!deps) {
    return {};
  }
  return {
    build: deps.build,
    persist: deps.persist,
  };
}

export function buildEvaluationGraphSteps(
  deps?: EvaluationGraphDeps,
): PipelineStep<EvaluationGraphState>[] {
  const nodes = createEvaluationGraphNodes(depsToNodeDeps(deps));
  return [
    nodes.normalize_input,
    nodes.build_evaluation_report,
    nodes.persist_evaluation_report,
    nodes.final_output,
  ];
}

export function buildEvaluationGraphPipeline(options?: {
  deps?: EvaluationGraphDeps;
}): PipelineDefinition<EvaluationGraphState> {
  return {
    name: "EvaluationGraph",
    steps: buildEvaluationGraphSteps(options?.deps),
  };
}

function evaluationGraphNodeMap(): Record<string, unknown> {
  return Object.fromEntries(
    EVALUATION_GRAPH_NODE_NAMES.map((name) => [name, {}]),
  );
}

function toInitialEvaluationGraphState(
  initial: Partial<EvaluationGraphState>,
): EvaluationGraphState {
  const run_id = initial.run_id ?? prefixedId("run_");
  return createInitialEvaluationGraphState({
    run_id,
    thread_id: initial.thread_id ?? run_id,
    model_version: initial.model_version ?? "stage1-v0",
    ...initial,
  });
}

export function buildEvaluationGraph(options?: {
  deps?: EvaluationGraphDeps;
  checkpointer?: unknown;
}): CompiledEvaluationGraph {
  const pipeline = buildEvaluationGraphPipeline({ deps: options?.deps });

  return {
    async invoke(initial, _config) {
      if (initial === null) {
        throw new Error(
          "EvaluationGraph pipeline resume requires Stage1CheckpointStore; invoke with initial state",
        );
      }
      return runPipelineDefinition(toInitialEvaluationGraphState(initial), pipeline);
    },
    getGraph() {
      return { nodes: evaluationGraphNodeMap() };
    },
  };
}

export const evaluationGraph = buildEvaluationGraph();

const defaultEvaluationGraphPipeline = buildEvaluationGraphPipeline();

export async function runEvaluationSummaryGraph(
  input: EvaluationGraphRunInput = {},
  deps?: EvaluationGraphDeps,
): Promise<EvaluationGraphRunResult> {
  const run_id = input.run_id ?? prefixedId("run_");
  const pipeline = deps
    ? buildEvaluationGraphPipeline({ deps })
    : defaultEvaluationGraphPipeline;
  const finalState = await runPipelineDefinition(
    toInitialEvaluationGraphState({
      run_id,
      thread_id: run_id,
      model_version: input.model_version ?? "stage1-v0",
      symbol: input.symbol?.toUpperCase(),
      limit: input.limit ?? 500,
      persist: input.persist ?? true,
      report_id: input.report_id,
      window_start: input.window_start,
      window_end: input.window_end,
    }),
    pipeline,
  );
  return stateToEvaluationGraphResult(finalState);
}
