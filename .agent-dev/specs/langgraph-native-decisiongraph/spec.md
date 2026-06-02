# LangGraph-Native DecisionGraph

## Background

T006 completed the Stage 1 trading-agent loop in `apps/trader-workflows`, but the current `DecisionGraph` implementation is still a hand-written class flow. `Stage1Runtime` wraps that class in a generic one-node `StateGraph`, which gives a LangGraph-shaped shell but does not make the business workflow itself native to LangGraph.

T007 refactors only `DecisionGraph` into a first-class LangGraph `StateGraph` and exposes it through LangGraph Studio. It preserves the T006 CLI JSON contract and does not migrate `OutcomeGraph`, `EvaluationGraph`, or `InsightExplorationGraph`.

## Confirmed Decisions

| Decision | Chosen rule | Why |
|---|---|---|
| Native source of truth | `DecisionGraph` business flow is an exported compiled LangGraph `StateGraph`. | Studio, CLI, and future schedulers must inspect and run the same graph. |
| Adapter compatibility | Keep `runDecisionGraph(input)` as the public adapter. | Existing CLI/runtime code can keep calling the same function while the implementation changes underneath. |
| Runtime boundary | `Stage1CheckpointStore` is downgraded to run registry / CLI envelope / metadata storage. | LangGraph checkpointer owns graph state, interrupt, resume, replay, and checkpoint lineage. |
| ID mapping | `thread_id` equals `run_id` for T007 native `DecisionGraph` runs. | This keeps the registry simple and avoids unnecessary dual-id drift. |
| User-facing id | CLI still exposes `run_id`; LangGraph uses the same value as `thread_id` plus checkpoint metadata internally. | Do not break the T006 `trader runs list/show/resume` contract. |
| Scope | T007 migrates only `DecisionGraph`. | It is the smallest useful proof of LangGraph-native runtime and Studio integration. |
| Studio registration | `langgraph.json` registers only `decision_graph`. | Placeholder graph entries create false confidence and weak review signals. |
| Studio mode | T007 Studio is load-only plus optional fixture invocation; direct Studio real-persistence is forbidden. | Real domain writes must still go through workflow CLI / `Stage1Runtime` so `run_id` registry is preserved. |
| Evidence state | Graph state includes processed context and refs, not raw evidence blobs. | Large evidence objects belong to backend/domain stores and future detail UI, not checkpoints. |
| Detail UI | T007 does not implement custom evidence detail UI. | Current goal is workflow-native execution, not presentation or large-object browsing. |
| Slice gate | S1 adds config/dependencies only; S2 owns the real graph export and Studio load gate. | S1 cannot require a real export before the native graph exists. |

## Goal

Make `DecisionGraph` a real LangGraph workflow:

```text
input
-> normalize_input
-> build_context_snapshot
-> generate_decision_envelope
-> validate_decision_envelope
-> persist_model_decision
-> schedule_model_path_outcomes
-> final_output
```

The compiled graph implementation must be shared by:

```text
apps/trader-workflows CLI command
apps/trader-cli thin wrapper
LangGraph Studio / Agent Server load path
```

In T007, real domain persistence is allowed only through the workflow CLI / `Stage1Runtime` path. Direct Studio invocation is load-only or fixture-only and must not write `context_snapshots`, `model_decisions`, or `decision_outcomes`.

## Architecture

### Graph Entry

`apps/trader-workflows/langgraph.json` exposes:

```json
{
  "dependencies": ["."],
  "graphs": {
    "decision_graph": "./src/graphs/decisionGraph.ts:decisionGraph"
  },
  "env": "../../.env"
}
```

The exported `decisionGraph` must be a compiled LangGraph graph or a documented factory accepted by the LangGraph CLI. The graph export must not be a placeholder and must not call a separate hand-written business workflow.

The config intentionally omits `node_version` because the repo root already constrains Node through `package.json` engines. The `env` path points to the repo-root `.env` from `apps/trader-workflows`.

### DecisionGraph State

State should be business-complete but bounded:

```ts
interface DecisionGraphState {
  run_id?: string;
  thread_id?: string;
  symbol: string;
  taskType?: string;
  asof_ts?: string;
  model_version?: string;

  snapshot?: ContextSnapshotRecord;
  weighted_context_items?: WeightedContextItem[];
  evidence_refs?: EvidenceRef[];

  envelope?: DecisionEnvelope;
  decision?: PersistedModelDecision;
  scheduled_outcomes?: ScheduledDecisionOutcome[];

  paper_execution_submitted: false;
  errors?: string[];
}
```

State must not contain:

```text
news article full text
provider raw JSON payloads
image blobs
chart screenshots
large K-line arrays
full gather_trace
large model traces
```

The graph may keep `snapshot_id`, bounded summaries, weighted items, and `evidence_ref` values. Detailed evidence browsing is deferred to a later task.

### Public Adapter

Keep:

```ts
export async function runDecisionGraph(
  input: DecisionGraphInput,
  deps?: DecisionGraphDeps,
): Promise<DecisionGraphResult>
```

The adapter must invoke the compiled graph with LangGraph config:

```ts
{
  configurable: {
    thread_id: run_id
  }
}
```

The adapter returns the same shape expected by T006:

```ts
{
  run_id,
  snapshot,
  decision,
  envelope,
  scheduled_outcomes,
  paper_execution_submitted: false
}
```

It must not instantiate a hand-written `DecisionGraph` class that owns the business flow.

### Run Registry Boundary

T007 preserves `run_id` for users and CLI:

```text
run_id == thread_id -> graph_name -> latest_checkpoint_ref
```

The run registry must store:

```text
workflow_runs:
  run_id TEXT PRIMARY KEY
  graph_name TEXT NOT NULL
  status TEXT NOT NULL
  current_node TEXT NULL
  thread_id TEXT NOT NULL
  checkpoint_ns TEXT NULL
  checkpoint_ref TEXT NULL
  input_json TEXT NULL
  output_json TEXT NULL
  started_at TEXT NULL
  finished_at TEXT NULL
  latest_error TEXT NULL
  created_at TEXT NOT NULL
  updated_at TEXT NOT NULL
```

For native `DecisionGraph` runs, `thread_id` must equal `run_id`. `checkpoint_ref` stores the latest LangGraph checkpoint id or `null` when the run has not checkpointed yet.

`runs show RUN_ID --json` must return bounded metadata:

```json
{
  "run_id": "run_...",
  "graph_name": "DecisionGraph",
  "status": "succeeded",
  "current_node": null,
  "thread_id": "run_...",
  "checkpoint_ref": "checkpoint-or-null",
  "input": { "symbol": "TSLA.US" },
  "output": {
    "snapshot_id": "snap_...",
    "decision_id": "dec_...",
    "action": "WATCH",
    "scheduled_outcome_count": 5,
    "paper_execution_submitted": false
  },
  "latest_error": null,
  "checkpoints": []
}
```

The `checkpoints` field remains present for CLI compatibility, but native `DecisionGraph` runs must not expose full graph state there. It may be an empty array or bounded metadata-only records. Full native graph state belongs to the LangGraph checkpointer.

`runs resume RUN_ID --json` for native `DecisionGraph` loads the registry row, uses `thread_id = run_id`, and invokes the compiled graph through LangGraph config. To avoid duplicate domain writes, the persist node must use a deterministic `decision_id` derived from `run_id` when the caller does not supply one. Outcome scheduling remains idempotent through the existing `decision_id + horizon + path` backend contract.

### Checkpointer

Use a real LangGraph checkpointer for native graph execution. The preferred local checkpointer is the official SQLite saver package:

```text
@langchain/core
@langchain/langgraph-checkpoint-sqlite
```

Tests may use `MemorySaver` or a temporary SQLite checkpointer. Runtime tests must not write to `market_intel.db` or `data/trader-agent/**`.

### Studio

T007 adds the minimal Studio path:

```text
cd apps/trader-workflows
npx @langchain/langgraph-cli dev
```

or the equivalent package script.

The required T007 Studio smoke gate is:

```text
Agent Server starts
Studio lists decision_graph only
No direct Studio run writes domain facts
```

Direct Studio real-persistence is deferred. If a worker adds fixture invocation, it must use fake provider/backend dependencies and must not write `context_snapshots`, `model_decisions`, or `decision_outcomes`.

Manual Studio use is allowed because it starts a local service. Automated tests should verify config shape, graph export, adapter behavior, run metadata shape, and CLI contract.

## Non-Goals

- No custom workflow UI.
- No React Flow editor.
- No evidence detail UI.
- No raw evidence browser.
- No large object display.
- No backend schema/API changes.
- No `OutcomeGraph` native migration.
- No `EvaluationGraph` native migration.
- No `InsightExplorationGraph` native migration.
- No paper execution.
- No broker mirror.
- No model training.
- No automatic model promotion.
- No `apps/trader-cockpit` changes.

## Acceptance

1. `apps/trader-workflows/langgraph.json` exists with `dependencies: ["."]`, `graphs.decision_graph`, and `env: "../../.env"`.
2. `decision_graph` points to the exported native `DecisionGraph` compiled graph.
3. `runDecisionGraph` invokes the compiled graph and preserves the T006 result contract.
4. CLI `trader decide SYMBOL --json` still returns the workflow JSON envelope with `run_id`.
5. Native `DecisionGraph` uses `thread_id = run_id` and maps checkpoint metadata into the run registry.
6. `runs show RUN_ID --json` returns bounded run metadata and summaries, not full native graph state.
7. `Stage1CheckpointStore` no longer owns business graph state checkpoints for native `DecisionGraph`.
8. Direct Studio real-persistence is not enabled in T007.
9. Native graph state contains bounded processed context and refs, not raw evidence blobs.
10. Existing `decisionGraph.test.ts` behavior still passes.
11. New tests prove the adapter path is not the old hand-written class flow.
12. Studio smoke instructions are documented and can load `decision_graph`.

## Verification

Automated gates:

```text
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/langgraph-native-decisiongraph/spec.json | ConvertFrom-Json | Out-Null
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/langgraph-native-decisiongraph/decision-record.json | ConvertFrom-Json | Out-Null
Get-Content -Raw -Encoding UTF8 .agent-dev/tasks/T007.json | ConvertFrom-Json | Out-Null
manual or scripted: assert langgraph.json has dependencies ["."], only graphs.decision_graph, and env "../../.env"
cd apps/trader-workflows && npm test -- src/graphs/decisionGraph.test.ts
cd apps/trader-workflows && npm test -- src/runtime/stage1Runtime.test.ts
git diff --check -- .agent-dev/specs/langgraph-native-decisiongraph .agent-dev/tasks/T007.json .agent-dev/tasks/T007.md .agent-dev/tasks/T007-slices .agent-dev/langgraph-native-decisiongraph-worker-prompt.md apps/trader-workflows
```

Manual gates:

```text
npm run trader-cli -- decide TSLA.US --json
npm run trader-cli -- runs show <RUN_ID> --json
cd apps/trader-workflows && npx @langchain/langgraph-cli dev
manual: Studio lists decision_graph only
manual: Studio direct real-persistence is not used in T007
manual: review diff contains no custom workflow UI, backend schema change, raw evidence detail UI, or non-DecisionGraph native migration
manual: git diff --name-only contains no forbidden paths
```
