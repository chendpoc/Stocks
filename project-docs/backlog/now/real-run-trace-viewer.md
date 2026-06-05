# Real Run Trace Viewer

Status: done (T017 runtime read-model slice)

## Requirement

Show the real execution chain for one `Stage1Runtime` run, backed by run
metadata and compact checkpoint summaries.

## Source

- [Workflow orchestration roadmap](../../research-agent/target-system/trader-agent/05-agent-workflow-orchestration-roadmap.md)

## Entry Note

Useful before building editable workflow surfaces. Current scope is workflow
run inspection, not a full cross-system run monitor or backend `agent_events`
viewer.

## Boundary

This is an operator visibility surface. It does not imply workflow editing,
node replay, retry, cancellation, or approval operations.

## Completed Scope

T017
[`Workflow Runtime Observability v1`](../../../.agent-dev/specs/workflow-runtime-observability-v1/spec.md)
implemented `runs trace RUN_ID` with:

- bounded run summary;
- checkpoints ordered by `seq`;
- compact `state_summary` metadata instead of raw checkpoint state;
- bounded `output_summary`;
- `resume_hint`.

Backend `agent_events` merge remains deferred to a later cross-system
audit/event contract.
