# Reflection Engine

Status: Supporting dependency

## Requirement

Run daily/weekly learning summaries, mistake analysis, and rule proposal
generation without activating rules. This is a backend learning capability, not
a standalone LangGraph workflow target.

## Source

- [Reflection Engine](../../research-agent/target-system/trader-agent/01-agent-core-development/18-reflection-engine.md)

## Entry Note

Use reflection output as feedback report and proposal sections inside
`FeedbackLearningWorkflow` until a reviewed split-boundary spec proves a
separate `ReflectionGraph` is needed. It should hand candidates to Rule
Discovery instead of changing active policy.

## Boundary

Reflection can generate proposals and lessons. It must not update active
RulePack or model state without explicit approval/versioning contracts. Do not
promote this into a standalone graph from the current workflow roadmap.

## Next Action

Pull this forward only when `FeedbackLearningWorkflow` needs a concrete
reflection-output-to-Rule-Discovery handoff.
