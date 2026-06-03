# Workflow Runtime Run / Checkpoint / Audit Alignment

Status: Now

## Requirement

Align workflow run identity, checkpoint persistence, run artifacts, and audit
events so existing and future workflow graphs share one durable execution
contract.

## Source

- [Workflow orchestration roadmap](../../research-agent/target-system/trader-agent/05-agent-workflow-orchestration-roadmap.md)
- [Trader Workflows README](../../../apps/trader-workflows/README.md)

## Entry Note

This is the foundation for making workflows mature and inspectable. It should
come before building more graph surface area.

## Boundary

This item is about workflow runtime semantics. It does not require completing
Agent Core, broker execution, workflow builder, or cross-system scheduler
contracts.

## Next Action

Audit `Stage1Runtime`, checkpoint store, graph result types, and CLI run
inspection to define the smallest shared run/checkpoint/audit contract.
