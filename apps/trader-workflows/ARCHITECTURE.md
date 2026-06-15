# Trader Workflows Current Architecture

Last reviewed: 2026-06-16

This document describes the current implementation in `apps/trader-workflows`.
It is not a roadmap and does not describe planned workflows unless they already
affect an implemented boundary.

## Package Layout

After T032–T034, `src/` is organized in layers:

```text
src/
  constants/          # cliFlags, graphNames, errorCodes (no logic)
  types/              # Pure TypeScript contracts
  api/                # Pure HTTP (ky-based)
    client.ts         # fetchIntel, fetchStage1
    marketAgentClient.ts
    ruleCandidatesClient.ts
  data/               # Data proxy — HTTP + response mapping (no domain logic)
    marketAgent.ts    # re-export marketAgentClient
    decisions.ts
    contextSnapshots.ts
    outcomes.ts
    evaluation.ts
    insightCandidates.ts
    ruleCandidates.ts
    outcomeMappers.ts
  orchestration/
    graphRunner.ts    # Stage1Runtime graph dispatch helpers
  cli/
    program.ts        # Commander top-level command registry
    flagParsing.ts    # Handler-level flag validation helpers
    router.ts         # Command dispatch to handlers
    helpers.ts        # WorkflowEnvelope helpers and resume map
    logger.ts         # pino logger (scaffold)
    commandHandlers/  # One handler module per CLI command family
  services/           # Pure domain logic (no HTTP)
    alphaResearch.ts
    contextSnapshots.ts   # barrel → context/
    outcomes.ts           # barrel → outcomes/
    evaluation.ts           # barrel → evaluation/
    insightCandidates.ts  # barrel → insight/
    decisions.ts          # computeOutcomeDueAt, types
    context/          # snapshots (pure), weighting, types
    outcomes/         # scheduling, labeling, types
    evaluation/       # metrics, report (compose), types
    insight/          # candidates (pure), seeds, types
  graphs/             # LangGraph workflow definitions
  llm/                # Workflow LLM provider and decision envelope
  runtime/            # Stage1Runtime, checkpoint store, config.ts
```

### Dependency rules

| Layer | May import | Must not import |
|-------|------------|-----------------|
| `api/` | `constants/`, `types/`, `runtime/config.ts` | `services/`, `data/`, `graphs/`, `cli/` |
| `data/` | `api/`, `types/` | `services/`, `orchestration/` |
| `services/` | `types/`, `constants/`, other pure `services/` helpers | `api/`, `data/` |
| `orchestration/` | `runtime/`, `graphs/`, `constants/` | `cli/`, `api/` |
| `cli/` | `orchestration/`, `data/`, `runtime/`, `services/` | `api/` (use `data/`) |
| `graphs/` | `data/`, `services/`, `orchestration/`, `runtime/`, `types/` | `api/` directly |

Barrel re-exports at `services/*.ts` remain for backward compatibility; new
code should import HTTP from `data/` and domain logic from `services/`.

## Package Role

`apps/trader-workflows` is the workflow runtime package for the trader-agent
system. It owns:

- CLI workflow commands and JSON command envelopes.
- Runtime run registration, checkpoint records, run inspection, and resume.
- LangGraph composition for the implemented decision workflow.
- Service-wrapper workflows for outcomes, evaluation, and insight exploration.
- Thin client calls into the backend Stage 1 Intel APIs.

It does not own backend persistence rules, RulePack activation, broker
execution, UI surfaces, or model/rule promotion policy.

## Runtime Shape

```text
Operator command
  |
  v
src/index.ts
  |
  |-- runs list/show/resume
  |-- decide SYMBOL
  |-- context snapshots list/show
  |-- outcomes run --due
  |-- eval summary
  |-- insights explore
  |
  v
Stage1Runtime
  |
  |-- local run registry and checkpoints
  |-- native DecisionGraph execution
  |-- service-wrapper graph execution
  |-- resume dispatch by graph_name
  |
  v
Backend Stage 1 Intel API
```

All CLI commands print a `WorkflowEnvelope`:

```ts
{
  ok: boolean;
  command: string;
  run_id: string | null;
  status: Stage1RunStatus | null;
  data: Record<string, unknown> | null;
  error: WorkflowError | null;
}
```

`context snapshots list/show` are read-only backend queries and do not create a
runtime run. `decide`, `outcomes run --due`, `eval summary`, and
`insights explore` execute through `Stage1Runtime`.

## Entrypoints

| Entrypoint | Current responsibility |
|---|---|
| `src/index.ts` | Public exports, CLI entrypoint (`handleCommandAsync`), runtime lifecycle |
| `src/cli/router.ts` | Command routing to `commandHandlers/*` |
| `src/cli/helpers.ts` | Workflow envelope formatting and resume handler map |
| `src/runtime/stage1Runtime.ts` | Run lifecycle, checkpoint writes, native graph invocation, service-wrapper invocation, resume |
| `src/runtime/checkpointStore.ts` | SQLite run registry and wrapper checkpoint storage |
| `src/runtime/langgraphCheckpointer.ts` | LangGraph SQLite checkpoint saver for native graph checkpoints |
| `src/api/client.ts` | Backend HTTP client (`fetchIntel`, `fetchStage1`, `ApiResponse<T>`) |
| `langgraph.json` | LangGraph Studio registration for all four native graphs |

## Runtime Persistence

`Stage1CheckpointStore` stores runtime metadata in SQLite. By default it resolves
to:

```text
data/trader-workflows/checkpoints.sqlite
```

This can be overridden with `TRADER_WORKFLOWS_CHECKPOINT_DB`.

The local registry owns two tables:

- `workflow_runs`: run id, graph name, status, current node, input/output,
  timestamps, latest error, and checkpoint references.
- `workflow_checkpoints`: ordered wrapper checkpoints for non-native graph runs
  and simple runtime lifecycle steps.

Native `DecisionGraph` runs also use a LangGraph SQLite checkpointer. Its path
is derived from the registry path:

```text
data/trader-workflows/checkpoints.langgraph.sqlite
```

For native `DecisionGraph`, `workflow_runs.checkpoint_ref` stores the latest
LangGraph checkpoint id, while `showRun()` returns no wrapper checkpoints.
Service-wrapper workflows store wrapper checkpoints in `workflow_checkpoints`.

## Graph Execution Modes

### Native LangGraph

All four Stage 1 feedback-loop graphs are registered as native LangGraph graphs:

```json
{
  "graphs": {
    "decision_graph": "./src/graphs/00-decision/decisionGraph.ts:decisionGraph",
    "outcome_graph": "./src/graphs/01-outcome/outcomeGraph.ts:outcomeGraph",
    "evaluation_graph": "./src/graphs/02-evaluation/evaluationGraph.ts:evaluationGraph",
    "insight_exploration_graph": "./src/graphs/03-insightExploration/insightExplorationGraph.ts:insightExplorationGraph"
  }
}
```

`Stage1Runtime.runGraph()` routes native graph names to `runNative*Graph()` helpers,
builds the graph with a LangGraph checkpointer, and uses `run_id` as the LangGraph
`thread_id`.

### Legacy Wrapper Runs

Non-native graph names still run through `Stage1Runtime.runGraph()` with an
`execute` function. Internally, `Stage1Runtime.invokeGraphNode()` wraps that
function in a one-node `StateGraph` so every command still leaves a run record
and start/complete checkpoints.

## Implemented Workflows

### DecisionGraph

`DecisionGraph` is the structured decision workflow.

Current node sequence:

```text
normalize_input
-> build_context_snapshot
-> generate_decision_envelope
-> validate_decision_envelope
-> persist_model_decision
-> schedule_model_path_outcomes
-> final_output
```

Responsibilities:

- Normalize `symbol`, `asof_ts`, `run_id`, `taskType`, and `model_version`.
- Build and persist a weighted context snapshot through `contextSnapshots`.
- Generate a bounded decision envelope through `createWorkflowLlmProvider()`.
- Validate the decision envelope before persistence.
- Persist one immutable model decision per context snapshot.
- Schedule model-path outcomes for `30m`, `1h`, `EOD`, `1d`, and `3d`.
- Return bounded output for run inspection.

`deterministicDecisionId(snapshot_id)` derives the decision id from the snapshot
id. If the backend reports a conflict for that deterministic id and the existing
decision points to the same snapshot, the workflow treats it as idempotent
replay.

`paper_execution_submitted` is always `false` in the current implementation.

### OutcomeGraph

`OutcomeGraph` closes due pending outcomes.

Responsibilities:

- Fetch due decision outcomes from the backend.
- Skip rows that are no longer `pending`.
- Finalize each due outcome through outcome-label services.
- Report processed, labeled, skipped, and failed counts.

It does not mutate context snapshots.

### EvaluationGraph

`EvaluationGraph` produces evaluation reports from labeled outcomes.

Responsibilities:

- Build an evaluation report from decision/outcome data.
- Aggregate model-path and override-path metrics.
- Compute human override value.
- Persist the report by default.

It can recommend or report. It does not promote models or change active runtime
configuration.

### InsightExplorationGraph

`InsightExplorationGraph` explores candidate insights from context snapshots,
outcomes, and bounded LLM reasoning.

Responsibilities:

- Parse a requested exploration window.
- Fetch recent context snapshots and decision outcomes for one symbol.
- Extract weighted context items and filter outcomes to the window.
- Run controlled ReAct-style exploration with `INSIGHT_REACT_MAX_STEPS = 5`.
- Ask the workflow LLM for a proposal, falling back to a heuristic proposal if
  the LLM call fails.
- Persist an `InsightCandidate` by default.

It creates candidates for later review. It does not activate lessons, mutate
RulePack policy, train models, or submit trades.

## Services Layer

| Service | Responsibility |
|---|---|
| `services/contextSnapshots.ts` (+ `context/`) | Build, hash, summarize, persist, fetch, and list context snapshots |
| `services/decisions.ts` | Persist model decisions and schedule model/override-path outcomes |
| `services/outcomes.ts` (+ `outcomes/`) | Fetch due outcomes, fetch market bars, compute labels, finalize outcomes |
| `services/evaluation.ts` (+ `evaluation/`) | Aggregate outcome metrics and build/persist evaluation reports |
| `services/insightCandidates.ts` (+ `insight/`) | Build and persist insight candidates; bounded exploration helpers |
| `services/candidateFamilies.ts` | Static candidate-family definitions and validation |
| `services/marketAgent.ts` | Market-agent memory, monitor, and data Intel API calls |
| `services/alphaResearch.ts` | Alpha research input validation and rule-candidate client |

The services are thin orchestration helpers over the backend API and local
workflow logic. Backend domain storage remains in `apps/trader-agent/backend`.

## Backend Dependency

`src/api/client.ts` reads:

```text
TRADER_API_BASE
```

Default:

```text
http://127.0.0.1:8000/api/intel
```

`fetchIntel()` calls paths under the Intel API base. `fetchStage1()` appends
`/stage1` and throws `Stage1ApiError` when the backend response is not OK.

`ApiResponse<T>` documents the success JSON shape (`T` on HTTP 2xx). Failures
throw rather than returning an error envelope; `ApiErrorBody` documents common
FastAPI error fields for reference.

## Resume Model

`runs resume RUN_ID` reads `workflow_runs.graph_name` and dispatches to the
registered handler map in `src/cli/helpers.ts`:

- `DecisionGraph`
- `OutcomeGraph`
- `EvaluationGraph`
- `InsightExplorationGraph`

Native graph resume uses the LangGraph checkpoint tuple when present. Legacy
wrapper resume reads the latest wrapper checkpoint and re-runs the registered
handler from the stored run input.

## Current Boundaries And Gaps

- All four Stage 1 feedback-loop graphs are native LangGraph and registered for Studio.
- Legacy wrapper runs remain available for ad-hoc graph names during migration.
- The package records workflow runs but relies on the backend for market facts,
  decisions, outcomes, evaluation reports, and insight candidates.
- The package does not own broker execution, automatic RulePack activation,
  automatic model promotion, or UI workflow surfaces.
- CLI output is intentionally bounded; large context payloads stay behind
  snapshot ids, evidence refs, and backend read APIs.

## Verification

Run from the package directory:

```bash
npm test
npm run check:circular
```

For live CLI commands, the backend must be running and `TRADER_API_BASE` must
point to the Stage 1 Intel API.
