# Alpha Policy Check Nodes

Status: Now

## Requirement

Add explicit checks for family validity, evidence completeness,
trigger/invalidation readiness, backtest readiness, and promotion boundary.

## Source

- [Agent engineering principles proposal](../../research-agent/target-system/trader-agent/08-agent-engineering-principles-proposal.md)

## Entry Note

These nodes inspect facts and emit audit output; they do not fetch new data.

## Boundary

Policy checks are deterministic gate nodes. They should not perform research,
call tools for missing evidence, or make product approval decisions.

## Next Action

Define each check as an input/output contract before wiring it into
AlphaResearchGraph.
