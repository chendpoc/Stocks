# T019: PaperTradingEngine v0

Status: done

Spec: `.agent-dev/specs/paper-trading-engine-v0/spec.json`

Depends on: T018 MarketStateSnapshot availability.

## Goal

Deterministic paper order lifecycle: `OrderIntent` → `RiskDecision` (allow) →
`OrderEvent` fills → `PositionSnapshot` + PnL. Replay tests must be stable.

## Verification

```text
cd apps/trader-agent/backend && python -m pytest tests/test_paper_trading_engine.py -v --tb=short
```

## Outcome

M3 v0 implemented: deterministic paper fills from `MarketStateSnapshot`,
idempotent replay on duplicate `order_intent_id`, `/api/paper-trading/intents`.

## Evidence

| ID | Command | Exit | Result |
|---|---|---|---|
| V701 | `python -m pytest tests/test_paper_trading_engine.py -v --tb=short` | 0 | 2 passed |
