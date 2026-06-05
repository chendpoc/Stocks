# Cross-System Workflow Run Detail Viewer

Status: Blocked by Contract

## Current Replacement

Local `Stage1Runtime` run trace inspection is already covered by
[`Real Run Trace Viewer`](../now/real-run-trace-viewer.md) through T017 runtime
observability. This blocked item is only for a cross-system detail viewer that
merges workflow checkpoints, backend `agent_events`, retry/replay semantics,
and node-level controls.

## Blocker

Cross-system run history, backend event stream, retry/resume, replay, and
node-level control contracts are not stable yet.

## Required Contract Or Gate

Workflow run schema and event stream contract.

## Boundary

Do not design backend event merge, detailed replay, retry/cancel controls, or
node-level controls until the cross-system read model is stable. Do not treat
the T017 local trace read model as permission to add those controls.

## Unblock Step

Specify the cross-system run detail read model, backend event shape, and
control boundary.
