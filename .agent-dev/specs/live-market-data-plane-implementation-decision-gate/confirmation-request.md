# T016 Confirmation Request

Status: confirmed (2026-06-06)

## Purpose

User directed sequential M1 → M2 → M3 development. T016 D501–D508 are accepted as
recommended unless amended later.

## Confirmed Decisions

| ID | Confirmed rule |
|---|---|
| D501 | Longbridge OpenAPI as primary live provider candidate, with startup entitlement probe. |
| D502 | US equities first: `TSLA.US`, `NVDA.US`, `AAPL.US`, `QQQ.US`, `SPY.US`, regular trading hours first. |
| D503 | Dedicated M2 tables in `data/market_intel.db`; optional bounded raw refs. |
| D504 | 7 trading days retention for normalized quote/depth/trade facts; 30 calendar days for derived artifacts. |
| D505 | Backend read APIs plus CLI inspection first; no cockpit/TUI in M2. |
| D506 | Analysis warning if quote age > 5s, analysis blocked if > 30s, paper/shadow blocked if quote age > 2s or required depth/trade missing. |
| D507 | No silent live fallback; replay/degraded only, labeled, and cannot upgrade readiness. |
| D508 | M2 remains read-only; no PaperTradingEngine, RiskGate, orders, positions, PnL, broker/account, or live trading. |

## Next Step

T018 `LiveMarketDataPlane` implementation (code). M3 follows as T019.
