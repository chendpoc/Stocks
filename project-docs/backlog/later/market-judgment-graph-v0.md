# MarketJudgmentGraph V0

Status: Later (deferred as standalone workflow)

## Requirement

Potentially split market-read presentation into a standalone graph only if the
three-workflow model proves an actual boundary that `DecisionWorkflow` cannot
own cleanly.

## Source

- [Self-learning market judgment roadmap](../../research-agent/target-system/trader-agent/06-self-learning-market-judgment-model-roadmap.md)

## Entry Note

Current roadmap guidance says market judgment belongs inside
`DecisionWorkflow` and operator views over its artifacts. Do not treat this item
as the next implementation target.

## Boundary

This graph may summarize and structure market judgment only after a reviewed
split-boundary spec proves a separate cadence, artifact owner, approval
boundary, or source-of-truth need. It must not override risk gates, activate
rules, submit orders, or become another alpha-discovery workflow.

## Next Action

Keep market-read needs inside `DecisionWorkflow` and operator surfaces. Revisit
this item only after the split-boundary test passes.
