# ModelLearningGraph V0

Status: Later

## Requirement

Orchestrate offline training runs for challenger models, checkpoint evaluation,
walk-forward validation, and promotion recommendations.

## Source

- [Self-learning market judgment roadmap](../../research-agent/target-system/trader-agent/06-self-learning-market-judgment-model-roadmap.md)

## Entry Note

First target should be `opportunity_ranking_model`, not a full trading policy.

## Boundary

This graph can recommend promotion. It must not automatically switch production
models without registry, gate, shadow metrics, and rollback contracts.

## Next Action

Revisit after alpha candidate and run artifact contracts are working in a real
workflow.
