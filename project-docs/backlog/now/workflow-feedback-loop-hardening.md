# Workflow Feedback Loop Hardening

Status: Now

## Requirement

Harden the loop from decision generation to outcome labeling and the alpha
research handoff.

## Source

- [Trader Workflows README](../../../apps/trader-workflows/README.md)
- [Self-learning market judgment roadmap](../../research-agent/target-system/trader-agent/06-self-learning-market-judgment-model-roadmap.md)

## Entry Note

This is the minimum path toward sustainable self-improvement. The loop must
produce reviewable improvement candidates, not automatic policy changes.

## Boundary

This pass covers `DecisionGraph`, `OutcomeGraph`, and `AlphaResearchGraph`
only. `EvaluationGraph` and `InsightExplorationGraph` are intentionally out of
scope for now.

Reflection, when it is added later, can propose lessons, candidate changes, or
follow-up research. It must not mutate active RulePack, promote models, or
rewrite historical snapshots.

## Next Action

Use the active spec and task artifacts:

```text
.agent-dev/specs/workflow-feedback-loop-maturity-v1/spec.md
.agent-dev/tasks/T010-outcome-graph-maturity-v1.md
.agent-dev/tasks/T011-evaluation-graph-maturity-v1.md
.agent-dev/tasks/T012-insight-exploration-graph-maturity-v1.md
```

Implementation order:

```text
DecisionGraph maturity v1
-> OutcomeGraph maturity v1
-> AlphaResearchGraph v0 spec
```
