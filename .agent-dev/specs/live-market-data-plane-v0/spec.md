# LiveMarketDataPlane v0

> Source backlog: `project-docs/backlog/now/live-market-data-plane-v0.md`
> Structured contract: `spec.json`
> Decisions: `decision-record.json`
> Open questions: `clarification-questions.md`

Status: done

## Purpose

Define T015 for M2 `LiveMarketDataPlane v0`.

M2 creates the contract for the real-market fact inlet. It does not implement
provider subscriptions, storage, paper trading, broker adapters, order events,
or a new LangGraph workflow.

The contract answers one question:

```text
How do we normalize live market facts so analysis and future execution
simulation can inspect and replay them without creating order behavior?
```

## Source Docs

- `project-docs/backlog/now/live-market-data-plane-v0.md`
- `project-docs/backlog/now/analysis-to-execution-contract-v0.md`
- `project-docs/backlog/workflow-maturity-roadmap.md`
- `project-docs/backlog/two-layer-market-analysis-and-execution-system.md`
- `project-docs/research-agent/target-system/trader-agent/09-risk-gated-setup-intelligence-m0-prd.md`
- `UBIQUITOUS_LANGUAGE.md`

Readonly implementation context:

- `apps/trader-agent/backend/app/tools/longbridge_adapter.py`
- `apps/trader-agent/backend/app/tools/tool_registry.py`
- `apps/trader-agent/backend/app/intel/ingestion/market_data.py`
- `apps/trader-agent/backend/app/modules/market_snapshot.py`
- `apps/trader-workflows/src/services/outcomes.ts`

## Design Baseline

The system target is two layers plus a shared data plane:

```text
LiveMarketDataPlane
  -> QuoteSnapshot / OrderBookSnapshot / TradeTick
  -> SecondBar / MinuteBar / MarketMicrostructureFeatures
  -> MarketStateSnapshot

AI Analysis Layer
  -> OpportunityMap / RiskEnvelope / ExplorationPlan / ExecutionPolicy

Execution Simulation Layer
  -> RiskGate / PaperTradingEngine / OrderEventStore
```

M2 owns only the first block. It may be consumed later by analysis workflows and
execution simulation, but it must not create order, broker, account, position,
PnL, or paper-trading behavior.

The first principle is:

```text
Market data is fact input.
Execution is a separate deterministic state machine.
LLMs consume compact snapshots, not tick-by-tick streams.
```

## Confirmed Decisions

| Decision | Chosen rule | Why |
|---|---|---|
| D401 | M2 is a contract/spec gate, not implementation. | Provider choice, storage, and stream handling need a reviewed contract first. |
| D402 | `LiveMarketDataPlane` is read-only infrastructure, not an AI workflow. | It should normalize facts and emit artifacts, not reason or trade. |
| D403 | Provider-specific details must be traceable but provider-agnostic at the contract layer. | Allows Longbridge or another provider later without baking vendor semantics into downstream artifacts. |
| D404 | Missing or degraded data must surface as `quality_flags` and `consumer_readiness`, not silent fallback. | Data gaps are system facts and should block downstream use when they matter. |
| D405 | `TradeTick` uses `aggressor_hint`, not `side`. | Avoids collision with forbidden order-side semantics from M1. |
| D406 | Second bars are normalized artifacts, not assumed provider-native data. | Prevents implementation from depending on unverified provider capability. |
| D407 | `MarketStateSnapshot` is the compact handoff artifact. | AI and future execution simulation should consume artifact IDs and summaries instead of raw streams. |
| D408 | M2 does not create `OrderIntent`, `RiskDecision`, `OrderEvent`, or `PositionSnapshot`. | These belong to M3+ execution simulation. |

## Contract Principles

1. **Read-only facts**: M2 artifacts represent market data only.
2. **Provider traceability**: every normalized fact carries `ProviderTrace`.
3. **Visible degradation**: missing, stale, delayed, replay-only, or fallback
   data is represented as `DataQualityFlag`.
4. **Deterministic readiness**: consumers read `consumer_readiness` before using
   a `MarketStateSnapshot`.
5. **No order semantics**: M2 artifacts must not include broker, account, order,
   position, PnL, submit, cancel, or replace instructions.
6. **Replayable state**: normalized facts are ordered by timestamp and provider
   sequence where available.

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

Required fields:

```text
flag_code
severity: warning | error
observed_at
message
blocking_for[]
```

Allowed `blocking_for[]` values:

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

If depth is unavailable, emit `depth_unavailable`. Do not synthesize depth from
bars.

### TradeTick

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

Do not call this field `side` in M2 artifacts.

### SecondBar And MinuteBar

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

### MarketMicrostructureFeatures

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

`ReplayCursor` required fields:

```text
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

T015 may create or modify only documentation and spec artifacts:

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

## Non-Goals

- No provider subscription implementation.
- No provider SDK or API client changes.
- No database migration or market data storage implementation.
- No stream handler.
- No `PaperTradingEngine`.
- No `OrderIntent`, `RiskDecision`, `OrderEvent`, or `PositionSnapshot`.
- No broker adapter.
- No account, position, order, PnL, or fill storage.
- No new LangGraph graph.
- No CLI command.
- No LLM prompt changes.
- No automatic RulePack mutation, model promotion, or execution.

## Acceptance

1. The spec defines `ProviderTrace`, `DataQualityFlag`, `QuoteSnapshot`,
   `OrderBookSnapshot`, `TradeTick`, `SecondBar`, `MinuteBar`,
   `MarketMicrostructureFeatures`, `MarketStateSnapshot`, and `ReplayCursor`.
2. The spec keeps `LiveMarketDataPlane` read-only and outside broker/order
   behavior.
3. Missing or degraded data produces visible `quality_flags` and readiness
   blocking instead of silent fallback.
4. `MarketStateSnapshot` is the compact artifact-ID handoff to analysis and
   future execution simulation.
5. Current code limitations are named: no typed depth/trade stream,
   second-bar builder, order book snapshot, or execution behavior exists yet.
6. Backlog, roadmap, workflow README, task index, and Ubiquitous Language link
   to the same M2 contract.

## Verification

Planning/document gates:

```text
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/live-market-data-plane-v0/spec.json | ConvertFrom-Json | Out-Null; Get-Content -Raw -Encoding UTF8 .agent-dev/specs/live-market-data-plane-v0/decision-record.json | ConvertFrom-Json | Out-Null; Get-Content -Raw -Encoding UTF8 .agent-dev/specs/live-market-data-plane-v0/clarification-questions.json | ConvertFrom-Json | Out-Null; Get-Content -Raw -Encoding UTF8 .agent-dev/tasks/T015-live-market-data-plane-v0.json | ConvertFrom-Json | Out-Null
rg -n "LiveMarketDataPlane|ProviderTrace|DataQualityFlag|QuoteSnapshot|OrderBookSnapshot|TradeTick|MarketStateSnapshot|market_data_contract_failed" UBIQUITOUS_LANGUAGE.md project-docs/backlog apps/trader-workflows/README.md apps/trader-workflows/README.zh-CN.md .agent-dev/specs/live-market-data-plane-v0 .agent-dev/tasks/T015-live-market-data-plane-v0.md
git diff --check -- .agent-dev/specs/live-market-data-plane-v0 .agent-dev/tasks/T015-live-market-data-plane-v0.json .agent-dev/tasks/T015-live-market-data-plane-v0.md .agent-dev/tasks/README.md project-docs/backlog apps/trader-workflows/README.md apps/trader-workflows/README.zh-CN.md UBIQUITOUS_LANGUAGE.md
```

No implementation tests are required for T015 because it is a spec gate.
