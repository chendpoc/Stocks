# Workflow Feedback Loop Hardening

Status: Done (T011/T012 closeout)

## Requirement

Harden the loop from decision generation to outcome labeling and the alpha
research handoff.

## Source

- [Trader Workflows README](../../../apps/trader-workflows/README.md)
- [Self-learning market judgment roadmap](../../research-agent/target-system/trader-agent/06-self-learning-market-judgment-model-roadmap.md)

## Entry Note

This pass produced reviewable improvement candidates, not automatic policy
changes. The feedback loop now closes through typed outcomes, evaluation
reports, and bounded insight exploration.

## Boundary

Implemented and documented in v1:

- `OutcomeGraph` — dual-source due outcome labeling (see T010)
- `EvaluationGraph` — structured evaluation report sections (T011, done)
- `InsightExplorationGraph` — evaluation-driven candidates + outcome scheduling
  (T012, done)

`DecisionGraph` remains the upstream decision entry. `AlphaResearchGraph` is
the next workflow slice and is still out of scope for this backlog item.

Reflection, when added later, can propose lessons, candidate changes, or
follow-up research. It must not mutate active RulePack, promote models, or
rewrite historical snapshots.

## Evidence

```text
.agent-dev/tasks/T011-evaluation-graph-maturity-v1.md      (done)
.agent-dev/tasks/T012-insight-exploration-graph-maturity-v1.md (done)
.agent-dev/reviews/T011-review-presentation.md
.agent-dev/reviews/T012-review-presentation.md
```

Workflow verification (2026-06-05): `cd apps/trader-workflows && npm test` → 101/101.

## Next Action

Move to alpha handoff planning:

```text
.agent-dev/specs/workflow-feedback-loop-maturity-v1/spec.md   (done)
project-docs/backlog/now/alpha-research-graph-spec.md
T013 AlphaResearchGraph v0 (planned)
```

Implementation order after closeout:

```text
AlphaResearchGraph v0 spec gate
-> minimal RuleCandidate / LiteBacktestReport backend slice
-> AlphaResearchGraph v0 workflow
```
