# 04 - Market Context Builder

Source module: `01-agent-core-backend-prd.md` module 4.  
Phase: Phase 1 MVP.  
Domain: Corpus learning chain.

## Module Goal

Backfill market context for a historical `TraderSemanticEvent` using only data available at or before the event timestamp, then persist `market_context_snapshots`.

## Non-Goals

- Does not label outcome after the event.
- Does not scan current opportunities.
- Does not overwrite semantic extraction decisions.
- Does not use future bars or later news as context.

## Inputs And Outputs

Inputs:

- `TraderSemanticEvent` with `timestamp` and optional `symbol`.
- Historical bars and market data through Tool Gateway or configured low-cost providers.
- Optional news and options summaries.

Outputs:

- `market_context_snapshots` row.
- Missing-data markers where data is unavailable.
- `agent_events` entries for build runs and tool failures.

## Core Tables And Schema

Primary table: `market_context_snapshots`.

Required content:

- Symbol price, VWAP, above-VWAP status.
- Relative volume and relative strength versus QQQ and SPY.
- SPY, QQQ, VIX, BTC, ETH state objects.
- News and options summaries as bounded JSON.

Related tables:

- Reads `trader_semantic_events`.
- Writes `agent_events`.
- Tool calls are logged through Tool Gateway in Phase 2.

## API Contract

```text
POST /api/context/build/{event_id}
POST /api/context/build/batch
GET  /api/context/{event_id}
```

Build response:

```json
{
  "event_id": "uuid",
  "context_id": "uuid",
  "symbol": "TSLA",
  "timestamp": "2026-05-25T09:45:00-04:00",
  "missing_fields": [],
  "context_builder_version": "market-context-v0.1"
}
```

## Dependencies

- Requires Semantic Extraction Service and Ticker Alias Resolver.
- Uses Tool Gateway once platform Phase 2 exists.
- Requires historical bar provider abstraction.
- Does not trigger approval for low-cost market data.
- High-cost news, options, or deep research summaries require Capability and Approval checks.
- Does not directly affect RulePack or Risk Engine.

## Implementation Steps

1. Load event by id and reject events without timestamp.
2. Resolve usable symbol or mark context as insufficient.
3. Fetch historical bars ending at event timestamp.
4. Compute VWAP, relative volume, relative strength, and benchmark states.
5. Attach BTC and ETH state only for crypto-beta names such as COIN and BMNR.
6. Add bounded news and options summaries when approved tools are available.
7. Persist context with builder version and missing-data list.

## Failure Modes

- Missing symbol: create no context row and return `insufficient_symbol`.
- Historical data gap: persist row with explicit missing fields.
- Provider timeout: retry according to platform retry policy and log failure.
- Future data detected: reject provider response for that field.
- High-cost tool not approved: skip tool and record skipped reason.

## Acceptance Criteria

- Given an `event_id`, builds a context snapshot anchored to the event timestamp.
- Does not use data after the event timestamp.
- Computes VWAP, relative volume, and relative strength.
- Handles missing data without crashing.
- Writes traceable build events.

## Test Scenarios

- Build TSLA context with complete bars and benchmark data.
- Build COIN context and verify BTC/ETH fields are considered.
- Build event with missing bars and verify missing markers.
- Verify provider data after timestamp is not used.
- Run batch build with partial failures and stable summary counts.
