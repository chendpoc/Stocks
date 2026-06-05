# PaperTradingEngine v0

Status: done

## Purpose

M3 builds the deterministic simulated order core. Given a `MarketStateSnapshot`
(from M2) and bounded `ExecutionPolicy` inputs (from M1), the engine produces
reproducible `OrderEvent`, `PositionSnapshot`, and PnL facts without broker
connectivity.

## Scope

- `OrderIntent`, `RiskDecision`, `OrderEvent`, `PositionSnapshot` v0 schemas
- Deterministic fill + slippage model
- SQLite persistence in `data/market_intel.db`
- Backend read/write APIs for paper intents and positions
- Replay tests

## Non-Goals

- Live broker submission
- RiskGate workflow graph
- Cockpit/TUI
- LangGraph nodes

## Task

`.agent-dev/tasks/T019-paper-trading-engine-v0.md`
