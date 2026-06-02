# S1 Studio Native Foundation

## Goal

Add the minimal LangGraph Studio configuration and dependencies. This slice does not require Studio to load the graph yet; S2 owns the real native graph export and load gate.

## Scope

- Add `apps/trader-workflows/langgraph.json`.
- Update `apps/trader-workflows/package.json`.
- Update `apps/trader-workflows/package-lock.json`.

## Frozen Contracts

- `langgraph.json` must use:
  - `dependencies: ["."]`
  - `graphs.decision_graph: "./src/graphs/decisionGraph.ts:decisionGraph"`
  - `env: "../../.env"`
- Do not register `outcome_graph`, `evaluation_graph`, or `insight_exploration_graph`.
- Add `@langchain/langgraph-cli` as a dev dependency or document an equivalent `npx` command.
- Add `@langchain/core` and `@langchain/langgraph-checkpoint-sqlite` as explicit runtime dependencies for the native graph/checkpointer path.
- Do not add custom UI code.
- Do not add direct Studio real-persistence.

## Exit Criteria

- LangGraph config parses as JSON.
- Config shape exactly matches the T007 contract.
- No placeholder graph entries are added.

## Verification

Run:

```text
Get-Content -Raw -Encoding UTF8 apps/trader-workflows/langgraph.json | ConvertFrom-Json | Out-Null
```

Also run `V101` and `V102` from `.agent-dev/specs/langgraph-native-decisiongraph/spec.json`.

## Non-goals

- No DecisionGraph node migration in this slice.
- No Studio load requirement in this slice.
- No CLI behavior change.
- No backend changes.
