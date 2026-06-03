# T007 Development Plan

## Objective

Refactor only `DecisionGraph` into a LangGraph-native graph while preserving the T006 CLI/run registry contract.

## Implementation Order

1. **S1 config/dependencies**
   - Add `apps/trader-workflows/langgraph.json` with:
     - `dependencies: ["."]`
     - `graphs.decision_graph: "./src/graphs/decisionGraph.ts:decisionGraph"`
     - `env: "../../.env"`
   - Add required LangGraph CLI/checkpointer dependencies.
   - Do not require Studio load yet.

2. **S2 native DecisionGraph**
   - Add native graph state and nodes.
   - Export the compiled `decisionGraph`.
   - Keep `runDecisionGraph` as adapter.
   - Make `runDecisionGraph` pass `configurable.thread_id = run_id`.
   - Preserve `DecisionGraphResult`.

3. **S3 run registry/checkpointer boundary**
   - Set `thread_id = run_id` for native DecisionGraph.
   - Store run metadata and bounded input/output summaries in `Stage1CheckpointStore`.
   - Do not store full native graph state checkpoints in registry rows.
   - Preserve `runs list/show/resume`.

4. **S4 verification/docs**
   - Run graph and runtime tests.
   - Run CLI smoke when backend and LLM env are available.
   - Run Studio load smoke.
   - Update `code_map.md` and `CLAUDE.md`.
   - Audit forbidden paths and non-goals.

## Explicit Decisions

- Studio direct real-persistence is not part of T007.
- Studio smoke is load-only, with optional fixture-only invocation.
- Real domain writes must go through workflow CLI / `Stage1Runtime`.
- `thread_id` equals `run_id`.
- `runs show` returns metadata and summaries, not full native graph state.

## Ready For Worker When

- Plan review has no Critical or Important findings.
- S1/S2/S3/S4 slice gates are consistent with this dev plan.
- Verification commands in `spec.json` are concrete enough for the worker to run or document skip prerequisites.
