# T017: Workflow Runtime Observability v1

Status: done

Spec: `.agent-dev/specs/workflow-runtime-observability-v1/spec.md`

Depends on: T090 DecisionGraph Maturity v1 and current `Stage1Runtime` run
registry.

## Goal

Add a bounded read-only workflow runtime observability layer over existing
`Stage1Runtime` runs and checkpoints.

T017 is independent of T016. It must not implement live market data,
PaperTradingEngine, RiskGate, broker/account behavior, or any execution
simulation.

## Step Map

| Step | Scope | Status |
|---|---|---|
| S1 | Add run monitor summary helpers and tests | done |
| S2 | Add run trace detail helpers and tests | done |
| S3 | Wire read-only CLI/API-shaped envelopes for monitor/detail | done |
| S4 | Update workflow README examples if command output changes | done |
| S5 | Run full workflow/docs verification | done |

## Implementation Plan

### S1: Run Monitor Summary

Add a bounded run summary read model with:

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

Allow filters:

```text
status
graph_name
limit
```

### S2: Run Trace Detail

Add a single-run detail read model with:

```text
run
checkpoints[]
output_summary
resume_hint
```

Checkpoint summaries must be ordered by `seq` and bounded. Do not expose full
raw checkpoint state by default.

### S3: Operator Envelope

Expose the read models through existing workflow package patterns. Prefer
extending `runs list/show` output only if compatible; otherwise add explicitly
named read-only subcommands.

Do not add scheduler, approval, retry, replay, cancel, or edit behavior.

## Allowed Files

- `apps/trader-workflows/src/runtime/stage1Runtime.ts`
- `apps/trader-workflows/src/runtime/stage1Runtime.test.ts`
- `apps/trader-workflows/src/runtime/checkpointStore.ts`
- `apps/trader-workflows/src/index.ts`
- `apps/trader-workflows/src/index.test.ts`
- `apps/trader-workflows/README.md`
- `apps/trader-workflows/README.zh-CN.md`
- `.agent-dev/specs/workflow-runtime-observability-v1/**`
- `.agent-dev/tasks/T017-workflow-runtime-observability-v1.md`
- `.agent-dev/tasks/T017-workflow-runtime-observability-v1.json`
- `.agent-dev/tasks/README.md`
- `project-docs/backlog/now/workflow-runtime-run-checkpoint-audit-alignment.md`
- `project-docs/backlog/now/run-monitor.md`
- `project-docs/backlog/now/real-run-trace-viewer.md`

## Forbidden

- No `apps/trader-agent/backend/**` changes.
- No `apps/trader-cli/**`, cockpit, or research-console changes.
- No `data/**` changes.
- Backend agent_events integration is deferred.
- No scheduler, approval workflow, workflow builder, retry, replay, cancel, or
  edit behavior.
- No live market data, PaperTradingEngine, RiskGate, broker, order, position,
  PnL, or live trading.

## Verification

```text
cd apps/trader-workflows && npm test -- src/runtime/stage1Runtime.test.ts src/index.test.ts
cd apps/trader-workflows && npm test
node --test test/docs-ai-context.test.mjs
git diff --check -- apps/trader-workflows .agent-dev/specs/workflow-runtime-observability-v1 .agent-dev/tasks/T017-workflow-runtime-observability-v1.json .agent-dev/tasks/T017-workflow-runtime-observability-v1.md project-docs/backlog/now/workflow-runtime-run-checkpoint-audit-alignment.md project-docs/backlog/now/run-monitor.md project-docs/backlog/now/real-run-trace-viewer.md
```

Latest evidence:

- `cd apps/trader-workflows && npm test -- src/runtime/stage1Runtime.test.ts src/index.test.ts`
  -> 9/9 passed.
- `cd apps/trader-workflows && npm test` -> 118/118 passed.
- `node --test test/docs-ai-context.test.mjs` -> 11/11 passed.

## Review Rubric

- Findings first.
- Check for raw checkpoint/input/output exposure.
- Check for accidental workflow-control behavior.
- Check that T016/M2 implementation remains untouched.
- Check that backend `agent_events` remains deferred.
