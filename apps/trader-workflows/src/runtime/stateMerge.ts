export type MergeGraphStateOptions<S> = {
  /** Fields merged by append (default: `errors`). */
  accumulatorFields?: readonly (keyof S)[];
};

const DEFAULT_ACCUMULATOR_FIELDS = ["errors"] as const;

/**
 * Merge a node partial into graph state.
 * Replace-by-default; accumulator fields (e.g. `errors`) append like LangGraph reducers.
 */
export function mergeGraphState<S extends Record<string, unknown>>(
  state: S,
  partial: Partial<S>,
  options?: MergeGraphStateOptions<S>,
): S {
  const accumulators = new Set<keyof S>(
    (options?.accumulatorFields ?? DEFAULT_ACCUMULATOR_FIELDS) as (keyof S)[],
  );
  const result = { ...state };

  for (const key of Object.keys(partial) as (keyof S)[]) {
    const value = partial[key];
    if (accumulators.has(key)) {
      const left = (state[key] ?? []) as unknown[];
      const right = (value ?? []) as unknown[];
      result[key] = [...left, ...right] as S[keyof S];
      continue;
    }
    result[key] = value as S[keyof S];
  }

  return result;
}
