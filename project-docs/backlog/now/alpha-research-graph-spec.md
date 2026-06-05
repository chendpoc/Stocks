# AlphaResearchGraph Spec

Status: Done (M1 spec gate; implementation via T013)

## Requirement

Define the bounded workflow for turning event/context windows into candidate
rules and lite backtest reports.

## Source

- [Self-learning market judgment roadmap](../../research-agent/target-system/trader-agent/06-self-learning-market-judgment-model-roadmap.md)

## Entry Note

Should reuse Rule Discovery instead of inventing a separate validation path.

## Boundary

T013 covers the spec gate, backend minimal API slice, and AlphaResearchGraph v0
implementation. These remain strictly gated internally:

```text
M1 spec gate
-> M2 backend minimal API slice
-> M3 AlphaResearchGraph v0
```

v0 is a thin validation and lite-backtest orchestration graph. It is not the
full research-agent version of alpha research.

`AlphaResearchGraph` is a standalone module. Keep it separate from the
DecisionGraph and OutcomeGraph work already in flight.

The research-agent version is recorded separately as
[AlphaResearchAgent v1](../later/alpha-research-agent-v1.md). Do not implement
that Later item in T013.

## Next Action

Review `.agent-dev/specs/alpha-research-graph/` and
`.agent-dev/tasks/T013-alpha-research-graph-v0.md`, then implement T013 in the
M1 -> M2 -> M3 order.
