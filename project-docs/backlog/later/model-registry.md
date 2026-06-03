# Model Registry

Status: Later

## Requirement

Track model versions, dataset versions, checkpoints, metrics, promotion status,
and rollback metadata.

## Source

- [Self-learning market judgment roadmap](../../research-agent/target-system/trader-agent/06-self-learning-market-judgment-model-roadmap.md)

## Entry Note

Needed before any production model switching is possible.

## Boundary

The registry is governance infrastructure. It should not be introduced before
there is a concrete challenger model workflow to govern.

## Next Action

Define registry scope after ModelLearningGraph v0 has a concrete training and
evaluation contract.
