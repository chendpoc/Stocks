# DecisionGraph Maturity v1

> Source: `project-docs/backlog/now/decision-graph-maturity-v1.md`
> Structured contract: `spec.json`
> Decision record: `decision-record.json`

## Background

`DecisionGraph` is already the first native LangGraph workflow in
`apps/trader-workflows`. Its topology is accepted and should not be redesigned
for this slice.

The current gap is maturity around `build_context_snapshot`: operators need to
see which context snapshot a decision used, tests need to prove the context
builder handles core source families consistently, and the CLI needs a small
read-only inspection surface.

The first phase must support both:

- CLI inspection for real workflow runs.
- LangGraph Web UI / Studio visualization of the existing `decision_graph`.

This spec keeps both surfaces narrow. It does not introduce a new product UI,
new storage, new readiness system, or a second graph.

## Confirmed Decisions

| Decision | Chosen rule | Why |
|---|---|---|
| Graph shape | Keep the existing node chain. | The topology is reasonable; the weak point is the context contract. |
| First slice | Harden `build_context_snapshot`. | It is the earliest node that determines whether later model decisions are inspectable. |
| Readiness naming | Do not add `DataReadiness`, `DecisionContext v1`, or `check_data_readiness`. | These add terms and gates before the actual context contract is proven. |
| CLI surface | Add bounded context snapshot visibility through `runs show` plus `context snapshots list/show`. | Operators need to inspect what was used without browsing raw data. |
| Web UI surface | Use LangGraph Studio to visualize the existing `decision_graph`. | First phase needs Web UI visualization, but not a custom workflow UI. |
| Storage/API | Reuse current context snapshot persistence and backend routes. | No schema/API expansion is needed for the first maturity slice. |
| Empty context | Empty source data still produces a stable snapshot and hash. | This slice should observe and report weak context, not block the model path. |

## Goal

Make each `DecisionGraph` run show:

```text
input symbol/asof
-> context snapshot identity and bounded summary
-> model decision identity/action
-> scheduled outcome count
```

The existing graph topology remains:

```text
normalize_input
-> build_context_snapshot
-> generate_decision_envelope
-> validate_decision_envelope
-> persist_model_decision
-> schedule_model_path_outcomes
-> final_output
```

## Contracts

### Context Snapshot Builder

`build_context_snapshot` must continue to produce a persisted context snapshot
with:

```text
snapshot_id
symbol
asof_ts
context_version
items_json
evidence_refs_json
weighting_policy_version
context_hash
```

The first-slice source coverage is:

| Backend key | Weighted item `source_type` |
|---|---|
| `market_data` | `market_bar` |
| `signals` | `signal` |
| `events` | `event` |
| `lessons` | `lesson` |
| `corpus` | `corpus` |
| `patterns` | `pattern` |
| `related_hypotheses` | `hypothesis` |

`benchmark` may be present in backend context input, but this slice must not
invent a new source type for it. If implementation uses it, it must be folded
into an existing market context rule or left documented as non-counted input.

Evidence refs are deduped by:

```text
ref_type + ref_id
```

Context hash must be stable for identical weighted item content, including the
empty weighted-item case.

### Context Snapshot Summary

`runs show RUN_ID --json` must expose a bounded context summary under the run
output:

```json
{
  "context_snapshot": {
    "snapshot_id": "snap_...",
    "context_hash": "hash",
    "context_version": "version",
    "item_count": 7,
    "evidence_ref_count": 5,
    "source_type_counts": {
      "market_bar": 1,
      "signal": 1
    }
  }
}
```

This summary must not include raw backend payloads, full articles, large market
arrays, model traces, or unbounded weighted-item lists.

### CLI Snapshot Inspection

Add the minimal read-only CLI commands inside `apps/trader-workflows`:

```text
trader-workflows context snapshots list --symbol TSLA.US --limit 20 --json
trader-workflows context snapshots show snap_... --json
```

`list` returns snapshot identity and counts:

```text
snapshot_id
symbol
asof_ts
context_version
context_hash
item_count
evidence_ref_count
source_type_counts
```

`show` returns the same summary plus at most five top weighted item summaries:

```text
item_id
source_type
summary
composite_weight
evidence_ref
```

No command in this slice edits snapshots or resolves full evidence details.

### LangGraph Web UI

`apps/trader-workflows/langgraph.json` remains the Studio entry for:

```text
decision_graph -> ./src/graphs/00-decision/decisionGraph.ts:decisionGraph
```

Studio must be able to load and visualize only the existing `decision_graph`
node chain. Direct Studio real-persistence is not expanded in this slice.

## Scope

Allowed implementation areas:

- `apps/trader-workflows/src/services/contextSnapshots.ts`
- `apps/trader-workflows/src/services/contextSnapshots.test.ts`
- `apps/trader-workflows/src/runtime/stage1Runtime.ts`
- `apps/trader-workflows/src/runtime/stage1Runtime.test.ts`
- `apps/trader-workflows/src/index.ts`
- `apps/trader-workflows/README.md`
- `apps/trader-workflows/README.zh-CN.md`

Read-only context:

- `apps/trader-workflows/src/graphs/decisionGraph.ts`
- `apps/trader-workflows/src/graphs/decisionGraph.nodes.ts`
- `apps/trader-workflows/src/graphs/decisionGraph.state.ts`
- `apps/trader-agent/backend/app/intel/api/stage1.py`
- `apps/trader-agent/backend/app/intel/api/context.py`
- `apps/trader-agent/backend/app/intel/api/context_snapshots.py`

Forbidden in this slice:

- New graph nodes.
- Graph topology changes.
- `DataReadiness`, `DecisionContext v1`, or `check_data_readiness`.
- New database tables or schema migrations.
- Backend API changes.
- Custom workflow UI or React Flow UI.
- Raw evidence browser or evidence resolver.
- Artifact store.
- `AlphaResearchGraph`.
- `OutcomeGraph`, `EvaluationGraph`, or `InsightExplorationGraph` migration.
- `apps/trader-cockpit/**` changes.

## Implementation Slices

1. Add focused tests for source mapping, empty-source behavior, context hash
   stability, and evidence ref dedupe in `contextSnapshots.test.ts`.
2. Add a small summary helper for persisted context snapshots.
3. Expand `Stage1Runtime` bounded output so `runs show` includes
   `output.context_snapshot`.
4. Add read-only `context snapshots list/show` CLI commands.
5. Update workflow docs and keep LangGraph Studio smoke instructions narrow.

## Acceptance

1. The `DecisionGraph` node chain is unchanged.
2. Context snapshot tests cover all first-slice source mappings.
3. Empty source data persists a stable context snapshot and does not add a
   readiness gate.
4. Evidence refs are deduped by `ref_type + ref_id`.
5. `runs show RUN_ID --json` includes `output.context_snapshot` with bounded
   counts and no raw payloads.
6. `context snapshots list/show --json` is read-only and returns bounded
   snapshot summaries.
7. `npm run studio` from `apps/trader-workflows` can load and visualize
   `decision_graph`.
8. No forbidden terms are introduced as product concepts or implementation
   symbols; explicit non-goal mentions in this spec are allowed.
9. No forbidden files, graph migrations, backend schema/API changes, or custom
   UI are introduced.

## Verification

Automated gates:

```text
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/decision-graph-maturity-v1/spec.json | ConvertFrom-Json | Out-Null
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/decision-graph-maturity-v1/decision-record.json | ConvertFrom-Json | Out-Null
cd apps/trader-workflows && npm test -- src/services/contextSnapshots.test.ts
cd apps/trader-workflows && npm test -- src/runtime/stage1Runtime.test.ts
cd apps/trader-workflows && npm test -- src/index.test.ts
rg -n "decision_graph" apps/trader-workflows/langgraph.json
cd apps/trader-workflows && .\node_modules\.bin\langgraphjs.cmd dev --help
git diff --check -- .agent-dev/specs/decision-graph-maturity-v1 apps/trader-workflows project-docs/backlog/now/decision-graph-maturity-v1.md
```

Manual gates:

```text
cd apps/trader-workflows && npm run workflows -- runs show <RUN_ID> --json
cd apps/trader-workflows && npm run workflows -- context snapshots list --symbol TSLA.US --limit 20 --json
cd apps/trader-workflows && npm run workflows -- context snapshots show <SNAPSHOT_ID> --json
optional manual: cd apps/trader-workflows && npm run studio
optional manual: Studio lists decision_graph and visualizes the existing node chain
manual: review diff contains no forbidden implementation scope
```
