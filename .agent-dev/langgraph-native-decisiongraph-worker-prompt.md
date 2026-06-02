# Worker Prompt: T007 LangGraph-Native DecisionGraph

You are implementing T007 for `D:\workspace\01-products\stock-community-summary`.

## Source Of Truth

Read first:

1. `.agent-dev/specs/langgraph-native-decisiongraph/spec.json`
2. `.agent-dev/specs/langgraph-native-decisiongraph/spec.md`
3. `.agent-dev/specs/langgraph-native-decisiongraph/decision-record.json`
4. `.agent-dev/specs/langgraph-native-decisiongraph/dev-plan.md`
5. `.agent-dev/tasks/T007.json`
6. `.agent-dev/tasks/T007-slices/README.md`
7. The specific slice file under `.agent-dev/tasks/T007-slices/`
8. `project-docs/adr/0001-langgraph-minimal-stage1.md`
9. `.agent-dev/specs/self-evolving-agent-stage1/spec.json`
10. `.agent-dev/context/code_map.md`
11. `CLAUDE.md`

## Goal

Refactor only `DecisionGraph` into a LangGraph-native `StateGraph`, expose it through LangGraph Studio, and preserve the existing T006 CLI JSON contract.

## Required Outcome

```text
apps/trader-workflows/langgraph.json
  dependencies ["."]
  graphs.decision_graph only
  env "../../.env"

apps/trader-workflows/src/graphs/decisionGraph.ts
  exports decisionGraph compiled graph
  exports runDecisionGraph adapter

Stage1 runtime
  keeps run_id for CLI users
  uses thread_id = run_id for native DecisionGraph
  maps run_id to LangGraph checkpoint metadata
  stores run metadata only
```

## Hard Boundaries

Do not implement:

- custom workflow UI
- React Flow editor
- evidence detail UI
- raw evidence large-object display
- Studio direct real-persistence
- backend schema/API changes
- OutcomeGraph native migration
- EvaluationGraph native migration
- InsightExplorationGraph native migration
- paper execution
- broker mirror
- model training
- automatic model promotion
- apps/trader-cockpit changes

## Implementation Rules

- Keep `runDecisionGraph(input, deps?)`.
- `runDecisionGraph` must invoke the compiled graph using `configurable.thread_id = run_id`.
- Preserve `DecisionGraphResult`.
- Preserve workflow JSON envelope fields: `ok`, `command`, `run_id`, `status`, `data`, `error`.
- Preserve `trader decide SYMBOL --json`.
- Preserve `trader runs list/show/resume`.
- Do not expose LangGraph `thread_id` as the primary user id.
- For native DecisionGraph, `thread_id` must equal `run_id`.
- `runs show RUN_ID --json` must return bounded metadata and summaries, not full native graph state.
- Direct Studio real-persistence is forbidden in T007; Studio smoke is load-only plus optional fixture invocation.
- Real domain writes must go through workflow CLI / `Stage1Runtime`.
- Do not store raw evidence blobs in graph state.
- Do not write runtime state to `market_intel.db`.
- Native DecisionGraph persist node must use a deterministic `decision_id` derived from `run_id` when the caller did not provide one.
- Tests must use temporary checkpoint DB paths or in-memory checkpointers.

## Verification

Run the relevant slice gate plus the final T007 gates from `.agent-dev/specs/langgraph-native-decisiongraph/spec.json`.

Minimum final commands:

```text
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/langgraph-native-decisiongraph/spec.json | ConvertFrom-Json | Out-Null
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/langgraph-native-decisiongraph/decision-record.json | ConvertFrom-Json | Out-Null
Get-Content -Raw -Encoding UTF8 .agent-dev/tasks/T007.json | ConvertFrom-Json | Out-Null
<run V102 from spec.json to check langgraph.json shape>
cd apps/trader-workflows && npm test -- src/graphs/decisionGraph.test.ts
cd apps/trader-workflows && npm test -- src/runtime/stage1Runtime.test.ts
git diff --check -- .agent-dev/specs/langgraph-native-decisiongraph .agent-dev/tasks/T007.json .agent-dev/tasks/T007.md .agent-dev/tasks/T007-slices .agent-dev/langgraph-native-decisiongraph-worker-prompt.md apps/trader-workflows
manual: cd apps/trader-workflows && npx @langchain/langgraph-cli dev
manual: with backend dev server and repo-root .env/LLM configured, npm run trader-cli -- decide TSLA.US --json
manual: npm run trader-cli -- runs show <RUN_ID> --json
manual: git diff --name-only forbidden path audit
manual: review diff against forbidden scope and non-goals
```

## Handoff

Return:

- slice implemented
- files changed
- verification commands and results
- whether Studio smoke was run or why it was not run
- confirmation that no custom workflow UI, evidence detail UI, Studio direct real-persistence, backend schema/API change, non-DecisionGraph native migration, paper execution, training, or promotion was added
