# S2 DecisionGraph Native Flow

## Goal

Move the `DecisionGraph` business flow into LangGraph-native state and nodes while preserving the public adapter contract and enabling Studio load-only smoke.

## Scope

- Modify `apps/trader-workflows/src/graphs/decisionGraph.ts`.
- Add `apps/trader-workflows/src/graphs/decisionGraph.state.ts`.
- Add `apps/trader-workflows/src/graphs/decisionGraph.nodes.ts` if it keeps node code clearer.
- Add `apps/trader-workflows/src/graphs/evidenceRefs.ts` if needed for bounded ref helpers.
- Update `apps/trader-workflows/src/graphs/decisionGraph.test.ts`.

## Required Node Flow

```text
normalize_input
-> build_context_snapshot
-> generate_decision_envelope
-> validate_decision_envelope
-> persist_model_decision
-> schedule_model_path_outcomes
-> final_output
```

## Frozen Contracts

- `runDecisionGraph(input, deps?)` remains exported.
- `runDecisionGraph` invokes the compiled graph with `configurable.thread_id = run_id`.
- The output shape remains `DecisionGraphResult`.
- Dependency injection for tests remains possible through `DecisionGraphDeps` or an equivalent test-only factory.
- `PAPER_*_CANDIDATE` remains persisted but never submits paper orders.
- The graph schedules pending model_path outcomes for `30m`, `1h`, `EOD`, `1d`, and `3d`.
- Graph state must not store raw evidence blobs or large objects.
- Direct Studio real-persistence is forbidden in T007.
- Studio load-only smoke is allowed; optional fixture invocation must not write domain facts.

## Exit Criteria

- Existing behavior tests pass.
- Tests prove the adapter uses the compiled graph path.
- Each business step is represented as a named LangGraph node.
- The old hand-written `DecisionGraph` class is removed or reduced to a non-business compatibility shim.
- State includes processed context and refs only.
- `npx @langchain/langgraph-cli dev` can load `decision_graph`.
- Studio lists `decision_graph` only and does not perform direct real-persistence.

## Verification

Run:

```text
cd apps/trader-workflows && npm test -- src/graphs/decisionGraph.test.ts
manual: cd apps/trader-workflows && npx @langchain/langgraph-cli dev
```

Also run `V201`, `V202`, and `V301` from `.agent-dev/specs/langgraph-native-decisiongraph/spec.json`.

## Non-goals

- No outcome labeling.
- No evidence detail UI.
- No custom workflow UI.
- No migration of other graphs.
- No Studio direct real-persistence.
