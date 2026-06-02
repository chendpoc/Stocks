# S3 Run Registry And Checkpointer Boundary

## Goal

Preserve T006 `run_id` CLI behavior while letting LangGraph own native `DecisionGraph` checkpoint state. For T007, native `DecisionGraph` uses `thread_id = run_id`.

## Scope

- Modify `apps/trader-workflows/src/runtime/checkpointStore.ts`.
- Modify `apps/trader-workflows/src/runtime/stage1Runtime.ts`.
- Modify `apps/trader-workflows/src/runtime/stage1Runtime.test.ts`.
- Add `apps/trader-workflows/src/runtime/langgraphCheckpointer.ts` if a wrapper helps keep checkpointer creation stable.
- Modify `apps/trader-workflows/src/index.ts` only as needed for the native `DecisionGraph` run path.

## Frozen Contracts

- CLI and workflow JSON envelopes expose `run_id`.
- Native graph execution uses LangGraph `thread_id = run_id`.
- Run registry maps `run_id -> graph_name -> thread_id(=run_id) -> checkpoint_ref`.
- `workflow_runs` stores `thread_id`, `checkpoint_ns`, and `checkpoint_ref` metadata.
- Run registry stores metadata and summaries, not full native graph state checkpoints.
- `runs list/show/resume` still work for user-facing runs.
- `runs show RUN_ID --json` returns bounded input/output summaries and an empty or metadata-only `checkpoints` array.
- Native `DecisionGraph` resume must not duplicate persisted decisions or outcome schedules.
- Native `DecisionGraph` persist node uses a deterministic `decision_id` derived from `run_id` when none is provided.
- Runtime state must not be written to `market_intel.db`.

## Exit Criteria

- `runs list` shows native DecisionGraph runs.
- `runs show RUN_ID` exposes `thread_id` equal to `run_id`, checkpoint metadata, and bounded summaries without raw graph state blobs.
- `runs resume RUN_ID` uses LangGraph checkpoint semantics for native DecisionGraph.
- Stage1 runtime tests use temporary DB paths.
- Existing non-native graph commands are not broken by the DecisionGraph migration.

## Verification

Run:

```text
cd apps/trader-workflows && npm test -- src/runtime/stage1Runtime.test.ts
manual: npm run trader-cli -- decide TSLA.US --json
manual: npm run trader-cli -- runs show <RUN_ID> --json
```

Also run `V203` and `V302` from `.agent-dev/specs/langgraph-native-decisiongraph/spec.json`.

## Non-goals

- No backend API changes.
- No CLI command redesign.
- No direct exposure of LangGraph `thread_id` as the primary user id.
- No full native graph state in registry checkpoint records.
