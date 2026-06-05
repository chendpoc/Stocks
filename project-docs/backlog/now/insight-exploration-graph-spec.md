# InsightExplorationGraph Spec

Status: done (T012 maturity v1)

## Requirement

Record the completed T012 maturity work for turning measured feedback and
bounded context into `InsightCandidate` records.

## Source

- [Workflow Feedback Loop Hardening](./workflow-feedback-loop-hardening.md)

## Entry Note

T012 implemented this as an artifact inside `FeedbackLearningWorkflow`, not as a
new product workflow lane. It remains separate from `OutcomeGraph` and
`AlphaResearchGraph`: it produces insight candidates only and does not own
outcome labeling or alpha validation.

## Boundary

Candidate contract, scheduling contract, and allowed evidence inputs are mapped
in `.agent-dev/tasks/T012-insight-exploration-graph-maturity-v1.md` and
`.agent-dev/specs/workflow-feedback-loop-maturity-v1/`.

Do not restart this from a new `.agent-dev/specs/insight-exploration-graph/`
folder unless a future reviewed split-boundary spec proves T012 is no longer
sufficient.

## Next Action

Use `.agent-dev/tasks/T012-insight-exploration-graph-maturity-v1.md` and
`.agent-dev/specs/workflow-feedback-loop-maturity-v1/` as the current evidence.
Future work should extend the feedback-loop spec instead of reopening this item.
