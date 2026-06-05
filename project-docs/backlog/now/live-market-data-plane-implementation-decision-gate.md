# LiveMarketDataPlane Implementation Decision Gate

Status: review

## Machine Status

```text
gate_status: pending_user_confirmation
implementation_may_start: false
```

## Purpose

T015 completed the M2 data-plane contract. This gate records the implementation
decisions that must be confirmed before any provider adapter, storage migration,
stream handler, replay API, CLI inspection command, or execution-simulation code
is written.

This is intentionally a decision gate, not an implementation plan.

## Source Baseline

- [LiveMarketDataPlane v0](./live-market-data-plane-v0.md)
- [Analysis-to-Execution Contract v0](./analysis-to-execution-contract-v0.md)
- [Workflow maturity roadmap](../workflow-maturity-roadmap.md)
- [Two-layer market analysis and execution system](../two-layer-market-analysis-and-execution-system.md)
- Current local code:
  - `apps/trader-agent/backend/app/tools/longbridge_adapter.py`
  - `apps/trader-agent/backend/app/tools/tool_registry.py`
  - `apps/trader-agent/backend/app/intel/db/connection.py`
  - `apps/trader-agent/backend/app/intel/db/schema.py`
  - `apps/trader-agent/backend/app/intel/ingestion/market_data.py`
  - `apps/trader-workflows/src/services/outcomes.ts`
- Official provider capability references checked on 2026-06-05:
  - Longbridge quote subscription overview:
    `https://open.longbridge.com/docs/quote/subscribe/overview`
  - Longbridge depth push:
    `https://open.longbridge.com/docs/quote/push/depth`
  - Longbridge trade push:
    `https://open.longbridge.com/docs/quote/push/trade`
  - Longbridge candlestick objects:
    `https://open.longbridge.com/docs/quote/objects`

## Local Evidence

Current backend code supports read-only market bars plus a lightweight
Longbridge quote/candlestick adapter shape. It does not yet expose typed depth
stream handling, trade-tape stream handling, second-bar construction, order book
snapshots, or execution account behavior.

`apps/trader-agent/backend/app/intel/db/connection.py` uses the existing
`data/market_intel.db` SQLite path for intel data. Current market bars live in
`market_bars`; live quote/depth/trade artifacts are not present yet.

## Provider Evidence

Official Longbridge documentation shows that the OpenAPI quote domain supports
subscribing to quote data and receiving quote-domain pushes, including depth and
trade push pages. Provider availability is still not enough for implementation:
actual entitlement, account region, symbol market, and subscription permissions
must be verified at runtime and written into `ProviderTrace`.

M2 must use only quote/market-data capabilities. Longbridge trading or account
contexts remain forbidden for this milestone.

## Proposed Decisions

These are recommended defaults for the first M2 implementation slice. They are
not confirmed until the user approves them.

| ID | Question | Recommended decision | Alternatives | Why this recommendation |
|---|---|---|---|---|
| D501 | Which provider and entitlement supplies quote, depth, and trade facts? | Use Longbridge OpenAPI as the primary live provider candidate, but require a startup capability probe that records entitlement as `realtime`, `delayed`, or `unknown` per symbol and data type. | Use yfinance/Alpha Vantage bars only; build replay fixtures first; delay live provider. | The product target needs quote/depth/trade facts. Existing yfinance/Alpha Vantage paths are bar-oriented and cannot prove order book or trade-tape behavior. |
| D502 | Which symbols and markets are first? | Start with US equities only: `TSLA.US`, `NVDA.US`, `AAPL.US`, `QQQ.US`, `SPY.US`, regular trading hours first. | Single-symbol TSLA only; broader watchlist; include HK/China/options. | This covers current workflow examples, benchmarks, and high-liquidity names without exploding entitlement, session, and retention complexity. |
| D503 | Where should normalized market facts be stored? | Store normalized M2 artifacts in `data/market_intel.db` with dedicated tables; store raw provider payloads only as optional bounded raw refs, not as required hot-path state. | New SQLite DB; JSONL-only; in-memory cache only. | Reuses the existing backend intel data boundary and keeps replay/query inspectable. JSONL-only makes indexed inspection harder; in-memory loses replay. |
| D504 | What retention should v0 use? | Keep raw quote/depth/trade normalized facts for 7 trading days; keep derived second/minute bars, features, and market-state snapshots for 30 calendar days; curated replay fixtures are explicit and manually retained. | Keep everything forever; keep only session memory; store bars only. | v0 needs replay and debugging without pretending to be a long-term tick warehouse. |
| D505 | Which operator surface inspects `MarketStateSnapshot` first? | Backend read APIs plus CLI inspection first; no cockpit or TUI implementation in M2. | Cockpit first; TUI first; no operator surface. | CLI/API are the shortest path to verify data correctness and replay. UI work should wait until artifacts stabilize. |
| D506 | What staleness/gap thresholds define readiness? | During live US regular session: analysis monitoring is `warning` if quote age > 5s and `blocked` if > 30s; paper/shadow readiness is `blocked` if quote age > 2s, required depth is unavailable, or recent trade gap > 10s when trade data is required. Delayed entitlement blocks paper/shadow readiness. | Looser analysis-only thresholds; stricter execution-style thresholds; per-symbol thresholds. | Keeps AI monitoring tolerant enough to observe while preventing paper/shadow consumers from treating stale or delayed facts as executable. |
| D507 | Is provider fallback allowed? | No silent live fallback. Fallback may be used only for dev/replay or explicitly labeled degraded mode with `provider_fallback` / `replay_only`; it must not upgrade readiness from `blocked` to `ready`. | Automatic fallback to yfinance bars; fail hard on any provider issue. | Aligns with T015: data gaps are system facts, not something to hide. |
| D508 | Does M2 include execution simulation? | No. M2 ends at normalized read-only market facts, features, `MarketStateSnapshot`, replay, and inspection. | Start PaperTradingEngine in the same milestone. | M3 owns deterministic order state, fills, position, PnL, and risk decisions. |

## Decisions Requiring User Confirmation

The user must confirm or change these before implementation:

1. Provider: Longbridge primary live provider candidate with entitlement probe.
2. First market/symbol scope: US equities, `TSLA.US`, `NVDA.US`, `AAPL.US`,
   `QQQ.US`, `SPY.US`, regular trading hours first.
3. Storage: `data/market_intel.db` dedicated M2 tables, with optional bounded
   raw refs.
4. Retention: 7 trading days for normalized raw quote/depth/trade facts, 30
   days for derived artifacts.
5. Operator inspection: backend read APIs plus CLI first.
6. Readiness thresholds: analysis warning > 5s, analysis blocked > 30s,
   paper/shadow blocked > 2s quote age or missing required depth/trade.
7. Fallback: no silent live fallback; replay/degraded fallback must be labeled
   and cannot upgrade readiness.
8. Execution boundary: M2 remains read-only and excludes PaperTradingEngine,
   RiskGate, orders, positions, PnL, broker/account, and live trading.

## Implementation May Not Start Until

- every proposed decision above is either confirmed or changed by the user;
- a follow-up implementation spec/task is created from confirmed decisions;
- the implementation spec maps each acceptance criterion to backend tests,
  contract tests, replay tests, and CLI/API inspection checks;
- forbidden scope remains explicit: no order submission, no broker account, no
  PaperTradingEngine, no RiskGate, no PnL, no live trading.

## Next Action

Ask the user to approve or amend the eight implementation decisions using
`.agent-dev/specs/live-market-data-plane-implementation-decision-gate/confirmation-request.md`.
