# AlphaResearchGraph Spec

Status: Now

## Requirement

Define the bounded workflow for turning event/context windows into candidate
rules and lite backtest reports.

## Source

- [Self-learning market judgment roadmap](../../research-agent/target-system/trader-agent/06-self-learning-market-judgment-model-roadmap.md)

## Entry Note

Should reuse Rule Discovery instead of inventing a separate validation path.

## Boundary

This is a spec-first item. Do not start graph implementation until the candidate
contract, run artifact contract, and policy checks are mapped.

`AlphaResearchGraph` is a standalone module. Keep it separate from the
DecisionGraph and OutcomeGraph work already in flight.

## Next Action

Create `.agent-dev/specs/alpha-research-graph/` with `spec.md`, `spec.json`,
and `decision-record.json`.
