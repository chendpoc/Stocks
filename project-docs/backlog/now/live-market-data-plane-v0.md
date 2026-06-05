# LiveMarketDataPlane v0

Status: done

## Purpose

`LiveMarketDataPlane v0` is the M2 spec gate for the real-market fact inlet.
It defines how quote, depth, trade, derived bars, microstructure features, and
compact market state snapshots should be represented before any paper-trading
or broker-facing implementation exists.

The core question is:

```text
How do we normalize live market facts so analysis and future execution
simulation can inspect and replay them without creating order behavior?
```

## Source Baseline

- [Workflow maturity roadmap](../workflow-maturity-roadmap.md)
- [Two-layer market analysis and execution system](../two-layer-market-analysis-and-execution-system.md)
- [Analysis-to-Execution Contract v0](./analysis-to-execution-contract-v0.md)
- [Ubiquitous language](../../../UBIQUITOUS_LANGUAGE.md)
- Current backend market data code:
  - `apps/trader-agent/backend/app/tools/longbridge_adapter.py`
  - `apps/trader-agent/backend/app/tools/tool_registry.py`
  - `apps/trader-agent/backend/app/intel/ingestion/market_data.py`
  - `apps/trader-agent/backend/app/modules/market_snapshot.py`
  - `apps/trader-workflows/src/services/outcomes.ts`

Current implementation evidence matters: the backend has read-only market bar
and lightweight quote/candlestick adapter shapes, but it does not yet expose a
typed depth stream, trade tape stream, second-bar builder, order book snapshot,
or execution account path.

## Scope

M2 defines the contract only. It may create planning/spec artifacts and update
indexes. It must not implement provider streams, storage, paper trading,
broker adapters, order state, CLI commands, or workflow graph nodes.

## Contract Boundary

`LiveMarketDataPlane` is infrastructure, not an AI workflow.

It owns:

- provider trace metadata;
- normalized quote snapshots;
- normalized order book snapshots;
- normalized trade ticks;
- derived second/minute bars;
- market microstructure feature snapshots;
- compact `MarketStateSnapshot` artifacts;
- data quality flags;
- replay/inspection cursor semantics.

It does not own:

- `OpportunityMap`, `RiskEnvelope`, `ExplorationPlan`, or `ExecutionPolicy`;
- `OrderIntent`, `RiskDecision`, `OrderEvent`, or `PositionSnapshot`;
- paper trading state;
- live broker submission, cancellation, replacement, or account reads;
- LLM prompts or LangGraph workflow topology.

## Artifact Contracts

All M2 artifacts use:

```text
schema_version: live_market_data_plane.v0
symbol
market
asof_ts
received_at
provider_trace
quality_flags[]
```

### ProviderTrace

Purpose: make every normalized fact traceable to its upstream provider,
subscription, request, replay file, or fixture.

Required fields:

```text
provider_trace_id
provider
source_channel: rest | websocket | file_replay | fixture
source_endpoint
provider_symbol
normalized_symbol
market
received_at
normalization_version
entitlement_state: realtime | delayed | unknown
```

Optional fields:

```text
request_id
subscription_id
sequence
provider_ts
ingested_at
latency_ms
raw_ref
connection_id
```

### DataQualityFlag

Purpose: surface missing, stale, delayed, inconsistent, or replay-only data
without hiding it behind a fallback.

Required fields:

```text
flag_code
severity: warning | error
observed_at
message
blocking_for[]
```

Allowed `blocking_for[]` values for v0:

```text
analysis_monitoring
paper_simulation
shadow_tracking
```

Baseline `flag_code` values:

```text
quote_incomplete
stale_quote
provider_delayed
provider_disconnected
book_crossed
book_locked
depth_unavailable
trade_gap
bar_gap
replay_only
provider_fallback
normalization_error
```

### QuoteSnapshot

Purpose: represent top-of-book and last-trade quote facts.

Required fields:

```text
quote_snapshot_id
bid_price
bid_size
ask_price
ask_size
quote_time
```

Optional fields:

```text
last_price
last_size
last_trade_time
```

### OrderBookSnapshot

Purpose: represent visible depth when the provider and entitlement allow it.

Required fields:

```text
order_book_snapshot_id
book_time
depth_type: top_of_book | level2 | unknown
levels[]
```

`levels[]` required fields:

```text
level
bid_price
bid_size
ask_price
ask_size
```

If provider depth is unavailable, the data plane must emit
`depth_unavailable`. It must not synthesize depth from bars.

### TradeTick

Purpose: represent executed market prints.

Required fields:

```text
trade_tick_id
trade_time
price
size
```

Optional fields:

```text
trade_id
aggressor_hint: buy_initiated | sell_initiated | unknown
```

Do not call this field `side` in M2 artifacts. `side` is reserved as a
forbidden order-command semantic in the analysis-to-execution contract.

### SecondBar And MinuteBar

Purpose: provide deterministic bars derived from provider bars or trade ticks.

Required fields:

```text
bar_id
timeframe: 1s | 1m
start_ts
end_ts
open
high
low
close
volume
construction: provider_bar | derived_from_trades | replay_fixture
source_count
```

Optional fields:

```text
vwap
trade_count
```

Second bars must not be assumed to exist natively at the provider. They are a
normalized artifact and must carry `construction` and `ProviderTrace`.

### MarketMicrostructureFeatures

Purpose: summarize deterministic market-state features for analysis and future
execution simulation.

Required fields:

```text
feature_snapshot_id
asof_ts
quote_snapshot_id
spread_bps
mid_price
quote_age_ms
```

Optional fields:

```text
order_book_snapshot_id
recent_trade_tick_ids[]
depth_imbalance
trade_intensity
volume_burst_score
trade_gap_seconds
```

### MarketStateSnapshot

Purpose: provide a compact, durable market-state artifact consumed by operators,
AI analysis, and future execution simulation.

Required fields:

```text
market_state_snapshot_id
symbol
market
asof_ts
valid_until
provider_trace_refs[]
quality_flags[]
consumer_readiness
```

Optional artifact references:

```text
quote_snapshot_id
order_book_snapshot_id
recent_trade_tick_ids[]
second_bar_id
minute_bar_id
feature_snapshot_id
```

`consumer_readiness` required fields:

```text
analysis_monitoring: ready | warning | blocked
paper_simulation: ready | warning | blocked
shadow_tracking: ready | warning | blocked
reason_codes[]
```

## Validation Contract

Validation failure status:

```text
market_data_contract_failed
```

Blocking validation failures:

- missing `schema_version`, artifact ID, `symbol`, `market`, `asof_ts`, or
  `received_at`;
- missing `ProviderTrace`;
- non-positive price or size where price/size is required;
- quote with missing bid/ask when a quote snapshot is requested;
- crossed book (`bid_price > ask_price`);
- order book levels out of order or missing level number;
- trade tick missing `trade_time`, `price`, or `size`;
- bar with `end_ts <= start_ts`;
- bar OHLC values that cannot contain `open` and `close` inside `high/low`;
- `MarketStateSnapshot` missing both quote and feature references;
- `consumer_readiness.paper_simulation = ready` while required quote/depth/trade
  quality is blocked;
- any broker, account, order, position, PnL, submit, cancel, or replace
  semantic in an M2 artifact.

Warnings:

- stale quote;
- provider delayed entitlement;
- locked book (`bid_price = ask_price`);
- missing optional depth;
- recent trade gap;
- provider fallback occurred and was labeled;
- replay-only data.

Fallback rule:

```text
Fallback may be recorded, but it must be visible as provider_fallback and may
not upgrade consumer_readiness from blocked to ready unless the fallback source
meets the same required contract.
```

## Replay And Inspection

M2 must define replay semantics before implementation:

```text
ReplayCursor
  replay_cursor_id
  source_window
  symbols[]
  start_ts
  end_ts
  current_ts
  provider_trace_refs[]
  quality_flags[]
```

Replay must reproduce normalized artifact order by timestamp and sequence where
available. It does not need to reproduce real provider connection behavior.

## Allowed Files

M2 may create or modify only planning artifacts:

```text
.agent-dev/specs/live-market-data-plane-v0/**
.agent-dev/tasks/T015-live-market-data-plane-v0.md
.agent-dev/tasks/T015-live-market-data-plane-v0.json
.agent-dev/tasks/README.md
project-docs/backlog/README.md
project-docs/backlog/now/live-market-data-plane-v0.md
project-docs/backlog/workflow-maturity-roadmap.md
project-docs/backlog/two-layer-market-analysis-and-execution-system.md
apps/trader-workflows/README.md
apps/trader-workflows/README.zh-CN.md
UBIQUITOUS_LANGUAGE.md
```

Readonly context:

```text
.agent-dev/specs/analysis-to-execution-contract-v0/**
apps/trader-agent/backend/app/tools/longbridge_adapter.py
apps/trader-agent/backend/app/tools/tool_registry.py
apps/trader-agent/backend/app/intel/ingestion/market_data.py
apps/trader-agent/backend/app/modules/market_snapshot.py
apps/trader-workflows/src/services/outcomes.ts
project-docs/research-agent/target-system/trader-agent/09-risk-gated-setup-intelligence-m0-prd.md
```

Forbidden:

```text
apps/trader-workflows/src/**
apps/trader-agent/backend/app/**
apps/trader-agent/backend/tests/**
apps/trader-cli/**
apps/trader-cockpit/**
apps/research-console/**
data/**
```

## Acceptance

1. The spec defines `ProviderTrace`, `DataQualityFlag`, `QuoteSnapshot`,
   `OrderBookSnapshot`, `TradeTick`, `SecondBar`, `MinuteBar`,
   `MarketMicrostructureFeatures`, `MarketStateSnapshot`, and `ReplayCursor`.
2. The spec explicitly keeps `LiveMarketDataPlane` read-only and outside the
   broker/order/account path.
3. Missing or degraded data produces visible `quality_flags` and readiness
   blocking instead of silent fallback.
4. `MarketStateSnapshot` is consumable by the analysis layer and future
   execution simulation through artifact IDs, not chat context.
5. M2 records that current code lacks typed depth/trade stream and execution
   behavior, so implementation must not assume those contracts already exist.
6. Backlog, roadmap, workflow README, task index, and Ubiquitous Language link
   to the same M2 contract.

## Open Decisions Before Implementation

- Which provider and entitlement level supplies quote, depth, and trade facts?
- Which symbols and markets are in the first M2 implementation slice?
- What storage location and retention policy should normalized market facts use?
- Which operator surface inspects `MarketStateSnapshot` first?
- What staleness thresholds block analysis monitoring versus paper/shadow use?

## Next Action

Resolve the M2 implementation decisions before writing provider adapters,
storage, stream handlers, or execution simulation code.
