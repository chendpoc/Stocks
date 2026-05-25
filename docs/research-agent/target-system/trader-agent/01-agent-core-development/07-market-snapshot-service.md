# 07 - Market Snapshot Service

Source module: `01-agent-core-backend-prd.md` module 7.  
Phase: Phase 1 MVP.  
Domain: Market and opportunity chain.

## Module Goal

Build fresh market snapshots for the fixed MVP universe so setup detection, market gate, scoring, and risk can operate on deterministic data.

## Non-Goals

- Does not infer trader intent.
- Does not generate opportunities by itself.
- Does not create tickets.
- Does not fetch high-cost tools unless Tool Gateway policy allows.

## Inputs And Outputs

Inputs:

- Universe symbols from Configuration Service.
- Current time and market session state.
- Market data providers through Tool Gateway or local adapter.

Outputs:

- `MarketSnapshot` response for universe and symbol views.
- Freshness markers.
- `agent_events` for refresh runs and provider failures.

## Core Tables And Schema

No dedicated table is required in 03 PRD for live snapshots. Persist only when implementation needs cache history; the canonical event-level historical table remains `market_context_snapshots`.

Shared objects:

- `signals.evidence` consumes snapshot evidence.
- MVP-lite uses in-process cache for latest snapshots and freshness state.
- Production deployment may use Redis for shared snapshot cache.
- Tool calls are logged by Tool Gateway in Phase 2.

## API Contract

```text
GET  /api/market/snapshot
GET  /api/market/snapshot/{symbol}
POST /api/market/snapshot/refresh
```

Snapshot response:

```json
{
  "as_of": "2026-05-25T09:45:00-04:00",
  "freshness": "fresh",
  "symbols": {
    "TSLA": {
      "price": 260.12,
      "vwap": 258.9,
      "above_vwap": true,
      "relative_volume": 1.4,
      "relative_strength_vs_qqq": 0.8,
      "market_regime": "risk_on",
      "market_gate": "pass"
    }
  }
}
```

## Dependencies

- Requires Phase 0 configuration and cache abstraction.
- Uses Tool Gateway once platform Phase 2 exists.
- Feeds Setup Detection, Market Brain, Rule Engine, Scoring Engine, Risk Engine, and Agent Runtime Orchestrator.
- Does not trigger approval for low-cost market data.
- Does not affect RulePack directly.

## Implementation Steps

1. Load fixed universe from config.
2. Fetch quote and intraday bars for SPY, QQQ, TSLA, NVDA, AAPL, COIN, BMNR.
3. Compute VWAP, opening range, relative volume, relative strength, ATR, EMA8, EMA20, SMA50.
4. Compute market regime and market gate from RulePack inputs.
5. Cache latest snapshot with freshness metadata.
6. Return partial snapshots with missing markers rather than failing the whole universe.
7. Write refresh run summary to `agent_events`.

## Failure Modes

- Provider unavailable: return cached snapshot if not stale beyond configured threshold.
- Missing symbol data: mark symbol as `missing_data`.
- Benchmark data missing: block relative-strength fields and mark dependent scoring unavailable.
- Cache unavailable: serve direct response and skip cache write.
- Market closed: return latest session-aware snapshot with closed-session marker.

## Acceptance Criteria

- Returns SPY, QQQ, TSLA, NVDA, AAPL, COIN, and BMNR snapshots.
- Includes freshness metadata.
- Snapshot output can be consumed by Rule Engine.
- Missing data does not crash refresh.
- Refresh writes `agent_events`.

## Test Scenarios

- Refresh full universe with fixture provider data.
- Refresh with missing BMNR data and verify partial response.
- Verify VWAP and opening range calculations.
- Verify QQQ risk-off input is present for Rule Engine.
- Verify stale cache policy marks snapshot freshness correctly.
