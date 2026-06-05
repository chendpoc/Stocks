# Run Monitor

Status: done (T017 runtime read-model slice)

## Requirement

Show active and historical `Stage1Runtime` workflow runs through bounded
read-only summaries.

## Source

- [Workflow orchestration roadmap](../../research-agent/target-system/trader-agent/05-agent-workflow-orchestration-roadmap.md)

## Entry Note

Needed for long-running graphs and workflow maturity. Current scope is minimal
workflow run list/detail over the runtime contract.

## Boundary

Run Monitor is observability first. Scheduling, approvals, active workflow
management, backend `agent_events`, retry/replay controls, and cross-system
audit streams remain blocked until their contracts exist.

## Completed Scope

T017
[`Workflow Runtime Observability v1`](../../../.agent-dev/specs/workflow-runtime-observability-v1/spec.md)
implemented `runs monitor` with:

- `status`, `graph_name`, and bounded `limit` filters;
- run identity, status, current node, timestamps, `duration_ms`,
  `checkpoint_count`, `latest_checkpoint_ref`, error flags, and `resumable`;
- no raw input or output exposure.

Future cockpit/TUI surfaces should consume this read model instead of raw
runtime rows.
