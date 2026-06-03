# Agent Explanation Service

Status: Supporting dependency

## Requirement

Translate decisions into conclusion, evidence, missing conditions, risks, and
next action for CLI/TUI/chat-like output.

## Source

- [Agent Explanation Service](../../research-agent/target-system/trader-agent/01-agent-core-development/20-agent-explanation-service.md)

## Entry Note

Useful for operator output, but not part of the current workflow maturity
mainline unless a run detail or CLI/TUI slice requires it.

## Boundary

Explanation is a read-only presentation layer over existing decisions,
evidence, and risk state.

## Next Action

Define the explanation input envelope and verify that CLI/TUI can consume it
without duplicating domain logic.
