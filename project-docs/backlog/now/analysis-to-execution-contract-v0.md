# Analysis-to-Execution Contract v0

Status: done

## Requirement

Define the typed handoff that lets the AI Analysis Layer guide the future
Execution Simulation Layer without becoming an order-control system.

## Source

- [Workflow maturity roadmap](../workflow-maturity-roadmap.md)
- [Two-layer market analysis and execution system](../two-layer-market-analysis-and-execution-system.md)
- [Ubiquitous language](../../../UBIQUITOUS_LANGUAGE.md)
- [Risk-gated setup intelligence M0 PRD](../../research-agent/target-system/trader-agent/09-risk-gated-setup-intelligence-m0-prd.md)

## Boundary

M1 is a contract/spec task only. It defines these artifacts:

```text
OpportunityMap
RiskEnvelope
ExplorationPlan
ExecutionPolicy
```

These artifacts may focus monitoring, define risk constraints, and permit
paper/shadow exploration under explicit conditions. They must not contain broker
order commands, account instructions, order quantities, order types, broker
order IDs, or live execution permissions.

## Next Action

Use `.agent-dev/specs/analysis-to-execution-contract-v0/` and
`.agent-dev/tasks/T014-analysis-to-execution-contract-v0.md` as the current M1
contract evidence. Do not restart T014 from this backlog entry.

The active follow-up is the
[`LiveMarketDataPlane Implementation Decision Gate`](./live-market-data-plane-implementation-decision-gate.md).
