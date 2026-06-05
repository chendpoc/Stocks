# Workflow Runtime Run / Checkpoint / Audit Alignment

Status: done (T017 runtime read-model slice)

## Requirement

Align workflow run identity, checkpoint persistence, run artifacts, and bounded
runtime inspection so existing workflow graphs share one durable execution
contract.

## Source

- [Workflow orchestration roadmap](../../research-agent/target-system/trader-agent/05-agent-workflow-orchestration-roadmap.md)
- [Trader Workflows README](../../../apps/trader-workflows/README.md)

## Entry Note

This is the foundation for making workflows mature and inspectable. It should
come before building more graph surface area.

## Boundary

This item is about `Stage1Runtime` semantics. It does not require completing
Agent Core, broker execution, workflow builder, cross-system scheduler
contracts, or backend `agent_events` integration.

## Completed Scope

T017 implemented bounded read-only runtime observability:

- `runs monitor` for bounded run summaries;
- `runs trace` for compact checkpoint summaries, output summaries, and resume
  hints;
- no raw checkpoint state exposure by default.

Source:

- `.agent-dev/specs/workflow-runtime-observability-v1/`
- `.agent-dev/tasks/T017-workflow-runtime-observability-v1.md`

## Still Deferred

Scheduler, approval, retry, replay, cancellation, workflow editing, backend
`agent_events` merge, live market data, and execution simulation remain out of
scope.
