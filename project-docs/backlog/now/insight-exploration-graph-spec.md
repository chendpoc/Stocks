# InsightExplorationGraph Spec

Status: Now

## Requirement

Define the standalone workflow for turning measured feedback and bounded
context into `InsightCandidate` records.

## Source

- [Workflow Feedback Loop Hardening](./workflow-feedback-loop-hardening.md)

## Entry Note

This module is separate from `OutcomeGraph` and `AlphaResearchGraph`. It
produces insight candidates only and does not own outcome labeling.

## Boundary

This is a spec-first item. Do not start implementation until the candidate
contract, scheduling contract, and allowed evidence inputs are mapped.

`InsightExplorationGraph` is a standalone module. Keep it separate from the
`DecisionGraph`, `OutcomeGraph`, and `AlphaResearchGraph` work already in
flight.

## Next Action

Create `.agent-dev/specs/insight-exploration-graph/` with `spec.md`,
`spec.json`, and `decision-record.json`.
