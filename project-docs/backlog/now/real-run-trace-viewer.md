# Real Run Trace Viewer

Status: Now

## Requirement

Show the real execution chain for one agent run, backed by run metadata and
agent events.

## Source

- [Workflow orchestration roadmap](../../research-agent/target-system/trader-agent/05-agent-workflow-orchestration-roadmap.md)

## Entry Note

Useful before building editable workflow surfaces. Current scope is workflow
run inspection, not a full cross-system run monitor.

## Boundary

This is an operator visibility surface. It should not imply workflow editing,
node replay, or approval operations until contracts exist.

## Next Action

Align run metadata and event semantics with the workflow runtime before
designing the viewer.
