# Alpha Run Artifact Contract

Status: Now

## Requirement

Define minimal persisted artifacts for long-running alpha research runs.

## Source

- [Agent engineering principles proposal](../../research-agent/target-system/trader-agent/08-agent-engineering-principles-proposal.md)
- [Workflow orchestration roadmap](../../research-agent/target-system/trader-agent/05-agent-workflow-orchestration-roadmap.md)

## Entry Note

Start with AlphaResearchGraph v0; do not force every existing graph to migrate
first.

## Boundary

Artifacts must be more durable than chat context and compact enough for
progressive disclosure. Do not require a full platform-wide artifact migration
in the first slice.

## Next Action

Specify the minimum artifact set for alpha research: candidate, evidence
summary, policy check output, lite backtest report, and final run summary.
