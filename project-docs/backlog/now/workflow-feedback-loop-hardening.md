# Workflow Feedback Loop Hardening

Status: done

## Requirement

Harden the loop from decision generation to outcome labeling, evaluation, and
bounded insight exploration.

## Source

- [Trader Workflows README](../../../apps/trader-workflows/README.md)
- [Workflow maturity roadmap](../workflow-maturity-roadmap.md)
- [Self-learning market judgment roadmap](../../research-agent/target-system/trader-agent/06-self-learning-market-judgment-model-roadmap.md)

## Entry Note

This pass produced reviewable improvement candidates, not automatic policy
changes. The feedback loop now closes through typed outcomes, evaluation
reports, and bounded insight exploration.

## Boundary

Implemented and documented in v1:

- `OutcomeGraph`: dual-source due outcome labeling (T010, done)
- `EvaluationGraph`: structured evaluation report sections (T011, done)
- `InsightExplorationGraph`: evaluation-driven candidates plus outcome
  scheduling (T012, done)

`DecisionGraph` remains the upstream decision entry. `AlphaResearchGraph v0` is
the downstream validation workflow and is tracked separately by T013.

Reflection, when added later, can propose lessons, candidate changes, or
follow-up research. It must not mutate active RulePack, promote models, or
rewrite historical snapshots.

## Evidence

```text
.agent-dev/specs/workflow-feedback-loop-maturity-v1/spec.md      (done)
.agent-dev/specs/workflow-feedback-loop-maturity-v1/spec.json    (done)
.agent-dev/tasks/T010-outcome-graph-maturity-v1.md               (done)
.agent-dev/tasks/T011-evaluation-graph-maturity-v1.md            (done)
.agent-dev/tasks/T012-insight-exploration-graph-maturity-v1.md   (done)
```

Workflow verification (2026-06-05):

```text
cd apps/trader-workflows && npm test
```

Result: 115/115 tests passed.

## Next Action

Use `.agent-dev/specs/workflow-feedback-loop-maturity-v1/` and
`.agent-dev/tasks/T010-*`, `.agent-dev/tasks/T011-*`, `.agent-dev/tasks/T012-*`
as the current feedback-loop evidence. Do not restart T010-T012 from this
backlog entry.

The active follow-up is the M2
[`LiveMarketDataPlane Implementation Decision Gate`](./live-market-data-plane-implementation-decision-gate.md).
