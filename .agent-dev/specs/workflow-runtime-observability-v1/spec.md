# Workflow Runtime Observability v1

> Source backlog: `project-docs/backlog/now/workflow-runtime-run-checkpoint-audit-alignment.md`
> Structured contract: `spec.json`
> Decisions: `decision-record.json`
> Open questions: `clarification-questions.md`

Status: done

## Purpose

Define and implement T017 for the workflow runtime observability slice that
makes `Stage1Runtime` runs easier to inspect before adding broader operator
surfaces.

This slice implements bounded runtime/CLI read models only. It does not
implement UI, scheduler, approvals, workflow editing, backend `agent_events`
integration, live market data, or M2 provider work.

## Source Docs

- `project-docs/backlog/now/workflow-runtime-run-checkpoint-audit-alignment.md`
- `project-docs/backlog/now/run-monitor.md`
- `project-docs/backlog/now/real-run-trace-viewer.md`
- `project-docs/backlog/workflow-maturity-roadmap.md`
- `apps/trader-workflows/README.md`

Current implementation evidence:

- `apps/trader-workflows/src/runtime/stage1Runtime.ts`
- `apps/trader-workflows/src/runtime/checkpointStore.ts`
- `apps/trader-workflows/src/runtime/stage1Runtime.test.ts`
- `apps/trader-workflows/src/index.ts`
- `apps/trader-workflows/src/index.test.ts`

## Current Baseline

`Stage1Runtime` already persists:

- `workflow_runs` with run identity, graph name, status, current node,
  thread/checkpoint refs, bounded input/output, timestamps, and latest error;
- `workflow_checkpoints` with ordered checkpoint records for wrapper runs;
- native LangGraph runs with `thread_id = run_id` and bounded stored output;
- CLI `runs list`, `runs show`, `runs resume`, `runs monitor`, and `runs trace`
  commands.

The T017 gap was a stable operator read model for run monitoring and single-run
trace inspection. That read-model slice is implemented.

## Confirmed Decisions

| Decision | Chosen rule | Why |
|---|---|---|
| D601 | T017 is runtime observability over existing `Stage1Runtime` storage. | The run/checkpoint contract already exists and should be hardened before new surfaces. |
| D602 | v1 uses read-only CLI/API-shaped envelopes first. | This is the smallest operator surface and matches the current package shape. |
| D603 | v1 read models are bounded summaries, not raw state browsers. | Prevents checkpoint/input/output payloads from becoming unbounded operator context. |
| D604 | Backend `agent_events` integration is deferred. | The backend has a separate audit/event system; merging it needs a later cross-system contract. |
| D605 | No scheduling, approval, replay, node retry, cancellation, or workflow editing in this slice. | Run Monitor and Trace Viewer are observability first. |
| D606 | T017 is independent of T016 and must not touch live market data or execution simulation. | M2 provider decisions remain blocked by user confirmation. |

## Read Models

### Run Monitor Summary

Purpose: list active and historical workflow runs without exposing raw input or
output payloads.

Required fields:

```text
run_id
graph_name
status
current_node
started_at
finished_at
updated_at
duration_ms
checkpoint_count
latest_checkpoint_ref
has_error
latest_error
resumable
```

Allowed filters for v1:

```text
status
graph_name
limit
```

`limit` must be positive and bounded.

### Run Trace Detail

Purpose: inspect one run's execution chain without adding replay or editing.

Required fields:

```text
run
checkpoints[]
output_summary
resume_hint
```

`checkpoints[]` must be ordered by `seq` and bounded to metadata plus compact
state summaries. It must not expose full raw checkpoint state by default.

### Output Summary

Output summaries should reuse the bounded outputs already produced by
`Stage1Runtime`, such as:

- `DecisionGraph`: decision ID, action, snapshot summary, scheduled outcome
  count;
- `OutcomeGraph`: processed/labeled/skipped/failed counts;
- `EvaluationGraph`: report ID and section counts;
- `InsightExplorationGraph`: insight ID, horizon, evidence count, schedule ID;
- `AlphaResearchGraph`: rule candidate/backtest/report status summaries.

Unknown graph outputs should degrade to:

```text
output_summary: { type: "unknown", present: boolean }
```

## Allowed Files

T017 may create or modify only:

```text
.agent-dev/specs/workflow-runtime-observability-v1/**
.agent-dev/tasks/T017-workflow-runtime-observability-v1.md
.agent-dev/tasks/T017-workflow-runtime-observability-v1.json
.agent-dev/tasks/README.md
project-docs/backlog/now/workflow-runtime-run-checkpoint-audit-alignment.md
project-docs/backlog/now/run-monitor.md
project-docs/backlog/now/real-run-trace-viewer.md
apps/trader-workflows/src/runtime/stage1Runtime.ts
apps/trader-workflows/src/runtime/stage1Runtime.test.ts
apps/trader-workflows/src/runtime/checkpointStore.ts
apps/trader-workflows/src/index.ts
apps/trader-workflows/src/index.test.ts
apps/trader-workflows/README.md
apps/trader-workflows/README.zh-CN.md
```

Readonly context:

```text
.agent-dev/specs/decision-graph-maturity-v1/**
.agent-dev/tasks/T090-decision-graph-maturity-v1.*
.agent-dev/tasks/T010-outcome-graph-maturity-v1.*
.agent-dev/tasks/T011-evaluation-graph-maturity-v1.*
.agent-dev/tasks/T012-insight-exploration-graph-maturity-v1.*
.agent-dev/tasks/T013-alpha-research-graph-v0.*
project-docs/backlog/workflow-maturity-roadmap.md
```

Forbidden:

```text
apps/trader-agent/backend/**
apps/trader-cli/**
apps/trader-cockpit/**
apps/research-console/**
data/**
.github/**
```

## Non-Goals

- Backend agent_events integration is deferred until a later cross-system
  audit/event contract.
- No new database outside the existing workflow checkpoint store.
- No scheduler.
- No approval workflow.
- No workflow builder or editable graph surface.
- No node replay, retry, or cancellation behavior.
- No live market data provider implementation.
- No PaperTradingEngine, RiskGate, broker, order, position, PnL, or live
  trading.
- No custom UI.

## Acceptance

1. The spec defines bounded run-monitor and run-trace read models.
2. The spec maps current `Stage1Runtime` and checkpoint store fields to those
   read models.
3. The spec keeps backend `agent_events` integration deferred and explicit.
4. The spec does not pull in T016/M2 live market data implementation.
5. The task file maps implementation steps to concrete tests and verification.

## Implementation Evidence

- Runtime read model:
  `apps/trader-workflows/src/runtime/stage1Runtime.ts`
- Checkpoint store filtered run listing:
  `apps/trader-workflows/src/runtime/checkpointStore.ts`
- CLI envelopes:
  `apps/trader-workflows/src/index.ts`
- Tests:
  `apps/trader-workflows/src/runtime/stage1Runtime.test.ts`
  and `apps/trader-workflows/src/index.test.ts`
- Operator docs:
  `apps/trader-workflows/README.md`
  and `apps/trader-workflows/README.zh-CN.md`

## Verification

Planning gates:

```text
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/workflow-runtime-observability-v1/spec.json | ConvertFrom-Json | Out-Null
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/workflow-runtime-observability-v1/decision-record.json | ConvertFrom-Json | Out-Null
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/workflow-runtime-observability-v1/clarification-questions.json | ConvertFrom-Json | Out-Null
Get-Content -Raw -Encoding UTF8 .agent-dev/tasks/T017-workflow-runtime-observability-v1.json | ConvertFrom-Json | Out-Null
rg -n "Workflow Runtime Observability|Run Monitor Summary|Run Trace Detail|D601|T017" .agent-dev/specs/workflow-runtime-observability-v1 .agent-dev/tasks/T017-workflow-runtime-observability-v1.md project-docs/backlog apps/trader-workflows/README.md apps/trader-workflows/README.zh-CN.md
git diff --check -- .agent-dev/specs/workflow-runtime-observability-v1 .agent-dev/tasks/T017-workflow-runtime-observability-v1.json .agent-dev/tasks/T017-workflow-runtime-observability-v1.md .agent-dev/tasks/README.md project-docs/backlog/now/workflow-runtime-run-checkpoint-audit-alignment.md project-docs/backlog/now/run-monitor.md project-docs/backlog/now/real-run-trace-viewer.md apps/trader-workflows/README.md apps/trader-workflows/README.zh-CN.md
node --test test/docs-ai-context.test.mjs
```

Implementation gates are listed in the T017 task.
