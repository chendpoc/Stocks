# Run Monitor

Status: Now

## Requirement

Show active and historical workflow runs, failed nodes, retries, resume state,
and audit events.

## Source

- [Workflow orchestration roadmap](../../research-agent/target-system/trader-agent/05-agent-workflow-orchestration-roadmap.md)

## Entry Note

Needed for long-running graphs and workflow maturity. Current scope is minimal
workflow run list/detail over the runtime contract.

## Boundary

Run Monitor is observability first. Scheduling, approvals, and active workflow
management remain blocked until their contracts exist.

## Next Action

Define the run list and run detail read models after the run schema stabilizes.
