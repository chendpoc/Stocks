# Reflection Engine

Status: Now

## Requirement

Run daily/weekly learning summaries, mistake analysis, and rule proposal
generation without activating rules.

## Source

- [Reflection Engine](../../research-agent/target-system/trader-agent/01-agent-core-development/18-reflection-engine.md)

## Entry Note

Now tracked as part of workflow feedback-loop maturity. It should hand
candidates to Rule Discovery instead of changing active policy.

## Boundary

Reflection can generate proposals and lessons. It must not update active
RulePack or model state without explicit approval/versioning contracts.

## Next Action

Define the handoff from reflection output to Rule Discovery candidate intake.
