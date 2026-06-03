# Alpha Candidate Contract

Status: Now

## Requirement

Promote alpha candidate shape from loose JSON into validated fields:
`candidate_family`, `sub_family`, `mechanism`, `horizon`, `trigger`,
`invalidation`, `required_evidence`, and `backtest_plan`.

## Source

- [Agent engineering principles proposal](../../research-agent/target-system/trader-agent/08-agent-engineering-principles-proposal.md)

## Entry Note

Required before AlphaResearchGraph can be considered production-shaped.

## Boundary

This contract constrains candidate structure. It does not approve candidates,
activate rules, or imply execution readiness.

## Next Action

Define the TypeScript/Python boundary for alpha candidate validation before
adding new graph nodes.
