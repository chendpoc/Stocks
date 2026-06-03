# Rule Discovery / Lite Backtest Engine

Status: Supporting dependency

## Requirement

Convert market ideas and model-generated insights into `RuleCandidate`,
evidence requirements, and `LiteBacktestReport`.

## Source

- [Rule Discovery / Lite Backtest Engine](../../research-agent/target-system/trader-agent/01-agent-core-development/21-rule-discovery-lite-backtest-engine.md)

## Entry Note

Required by AlphaResearchGraph, but should be pulled forward only for concrete
workflow integration needs.

## Boundary

The engine can produce candidates and reports. It must not activate rules,
publish active RulePack changes, or claim production tradability.

## Next Action

Review the existing candidate and backtest code paths, then decide whether the
next slice is validation, persistence, or workflow integration.
