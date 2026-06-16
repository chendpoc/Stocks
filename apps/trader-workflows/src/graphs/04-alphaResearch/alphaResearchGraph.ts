import { prefixedId } from "../../utils/id.js";

import { ALPHA_RESEARCH_INPUT_VALIDATION_FAILED } from "../../services/alphaResearch.js";
import {
  runPipeline,
  runPipelineFromStep,
  type PipelineDefinition,
} from "../../runtime/pipeline.js";
import {
  ALPHA_RESEARCH_GRAPH_NODE_NAMES,
  createAlphaResearchGraphNodes,
  stateToAlphaResearchGraphResult,
  type AlphaResearchGraphNodeDeps,
} from "./alphaResearchGraph.nodes.js";
import {
  createInitialAlphaResearchGraphState,
  type AlphaResearchGraphState,
} from "./alphaResearchGraph.state.js";
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

export type AlphaResearchPipeline = PipelineDefinition<AlphaResearchGraphState>;

function depsToNodeDeps(deps?: AlphaResearchGraphDeps): Partial<AlphaResearchGraphNodeDeps> {
  if (!deps?.client) {
    return {};
  }
  return { client: deps.client };
}

export function buildAlphaResearchGraph(options?: {
  deps?: AlphaResearchGraphDeps;
}): AlphaResearchPipeline {
  const nodes = createAlphaResearchGraphNodes(depsToNodeDeps(options?.deps));

  return {
    name: "alpha_research_graph",
    steps: [
      nodes.validate_input,
      nodes.create_rule_candidate,
      nodes.run_lite_backtest,
      nodes.final_output,
    ],
  };
}

export const alphaResearchGraph = buildAlphaResearchGraph();

async function runAlphaResearchPipeline(
  initial: AlphaResearchGraphState,
  pipeline: AlphaResearchPipeline,
): Promise<AlphaResearchGraphState> {
  const stateAfterValidate = await runPipeline(initial, pipeline.steps.slice(0, 1));

  if (stateAfterValidate.status === ALPHA_RESEARCH_INPUT_VALIDATION_FAILED) {
    return runPipelineFromStep(stateAfterValidate, pipeline.steps, 3);
  }

  return runPipelineFromStep(stateAfterValidate, pipeline.steps, 1);
}

export async function runAlphaResearchGraph(
  input: AlphaResearchGraphInput = {},
  deps?: AlphaResearchGraphDeps,
): Promise<AlphaResearchGraphResult> {
  const run_id = input.run_id ?? prefixedId("run_");
  const pipeline = deps ? buildAlphaResearchGraph({ deps }) : alphaResearchGraph;
  const finalState = await runAlphaResearchPipeline(
    createInitialAlphaResearchGraphState({
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
    }),
    pipeline,
  );
  return stateToAlphaResearchGraphResult(finalState);
}
