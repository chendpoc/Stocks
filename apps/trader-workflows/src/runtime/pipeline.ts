import { mergeGraphState, type MergeGraphStateOptions } from "./stateMerge.js";

export type PipelineStep<S> = (state: S) => Promise<Partial<S>>;

export type PipelineRunOptions<S> = MergeGraphStateOptions<S>;

export type PipelineDefinition<S> = {
  name: string;
  steps: PipelineStep<S>[];
};

export async function runPipeline<S extends Record<string, unknown>>(
  initial: S,
  steps: PipelineStep<S>[],
  options?: PipelineRunOptions<S>,
): Promise<S> {
  return runPipelineFromStep(initial, steps, 0, options);
}

export async function runPipelineFromStep<S extends Record<string, unknown>>(
  state: S,
  steps: PipelineStep<S>[],
  startIndex: number,
  options?: PipelineRunOptions<S>,
): Promise<S> {
  let current = state;
  for (let index = startIndex; index < steps.length; index += 1) {
    const partial = await steps[index]!(current);
    current = mergeGraphState(current, partial, options);
  }
  return current;
}

export async function runPipelineDefinition<S extends Record<string, unknown>>(
  initial: S,
  definition: PipelineDefinition<S>,
  options?: PipelineRunOptions<S>,
): Promise<S> {
  return runPipeline(initial, definition.steps, options);
}
