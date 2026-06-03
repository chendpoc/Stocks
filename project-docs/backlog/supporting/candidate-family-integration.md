# Candidate Family Integration

Status: Supporting dependency

## Requirement

Use the finite `CandidateFamily` taxonomy when creating or validating
`InsightCandidate` / `RuleCandidate`.

## Source

- [Rule Discovery / Lite Backtest Engine](../../research-agent/target-system/trader-agent/01-agent-core-development/21-rule-discovery-lite-backtest-engine.md)

## Entry Note

Keep it as an enum constraint, not a registry or storage framework. Pull it
forward when alpha candidate validation needs it.

## Boundary

This is a validation and classification constraint. It should not become a new
plugin registry, database model, or strategy framework.

## Next Action

Audit current candidate creation paths and add the smallest shared validation
contract that prevents loose family strings.
