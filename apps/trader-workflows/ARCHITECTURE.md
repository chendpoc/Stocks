# Trader Workflows Current Architecture

Last reviewed: 2026-06-04

This document describes the current implementation in `apps/trader-workflows`.
It is not a roadmap and does not describe planned workflows unless they already
affect an implemented boundary.

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
| `src/index.ts` | CLI parser, command routing, JSON envelope formatting, runtime lifecycle |
| `src/runtime/stage1Runtime.ts` | Run lifecycle, checkpoint writes, native graph invocation, service-wrapper invocation, resume |
| `src/runtime/checkpointStore.ts` | SQLite run registry and wrapper checkpoint storage |
| `src/runtime/langgraphCheckpointer.ts` | LangGraph SQLite checkpoint saver for native graph checkpoints |
| `src/api/client.ts` | Backend HTTP client for Intel and Stage 1 endpoints |
| `langgraph.json` | LangGraph Studio registration for `decision_graph` |

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

Only `DecisionGraph` is currently registered as a native LangGraph graph:

```json
{
  "graphs": {
    "decision_graph": "./src/graphs/decisionGraph.ts:decisionGraph"
  }
}
```

`Stage1Runtime.runGraph({ graph_name: "DecisionGraph" })` routes to
`runNativeDecisionGraph()`, builds the graph with a LangGraph checkpointer, and
uses `run_id` as the LangGraph `thread_id`.

### Service-Wrapper Workflows

`OutcomeGraph`, `EvaluationGraph`, and `InsightExplorationGraph` are implemented
classes, but they are not registered in `langgraph.json`. The CLI runs them
through `Stage1Runtime.runGraph()` with an `execute` function. Internally,
`Stage1Runtime.invokeGraphNode()` wraps that function in a one-node `StateGraph`
so every command still leaves a run record and start/complete checkpoints.

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

| Service file | Responsibility |
|---|---|
| `services/contextSnapshots.ts` | Build, hash, summarize, persist, fetch, and list context snapshots |
| `services/decisions.ts` | Persist model decisions and schedule model/override-path outcomes |
| `services/outcomes.ts` | Fetch due outcomes, fetch market bars, compute labels, finalize outcomes |
| `services/evaluation.ts` | Aggregate outcome metrics and build/persist evaluation reports |
| `services/insightCandidates.ts` | Build and persist insight candidates; implement bounded exploration helpers |
| `services/candidateFamilies.ts` | Static candidate-family definitions and validation |

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

## Resume Model

`runs resume RUN_ID` reads `workflow_runs.graph_name` and dispatches to the
registered handler map in `src/index.ts`:

- `DecisionGraph`
- `OutcomeGraph`
- `EvaluationGraph`
- `InsightExplorationGraph`

Native `DecisionGraph` resume uses the LangGraph checkpoint tuple when present.
Service-wrapper resume reads the latest wrapper checkpoint and re-runs the
registered handler from the stored run input.

## Current Boundaries And Gaps

- `DecisionGraph` is the only native LangGraph graph registered for Studio.
- Outcome, evaluation, and insight workflows are implemented but run through
  service-wrapper execution.
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
```

For live CLI commands, the backend must be running and `TRADER_API_BASE` must
point to the Stage 1 Intel API.
