# T015: LiveMarketDataPlane v0

Status: done

Spec: `.agent-dev/specs/live-market-data-plane-v0/spec.md`

Depends on: T014 Analysis-to-Execution Contract v0.

## Goal

Create the M2 contract that establishes the read-only real-market fact inlet
for analysis monitoring and future execution simulation.

```text
provider quote/depth/trade facts
-> ProviderTrace / quality flags
-> QuoteSnapshot / OrderBookSnapshot / TradeTick
-> SecondBar / MinuteBar / MarketMicrostructureFeatures
-> MarketStateSnapshot
```

T015 is a spec gate only. It does not implement provider subscriptions,
storage, paper trading, broker adapters, order storage, or CLI commands.

## Step Map

| Step | Scope | Status |
|---|---|---|
| S1 | Add M2 backlog/source doc and task/spec shell | done |
| S2 | Define market data artifact contracts and validation semantics | done |
| S3 | Link roadmap, README, backlog index, and Ubiquitous Language | done |
| S4 | Run planning verification commands | done |
| S5 | Plan-review `T015` before M2 implementation starts | done |

## Allowed Files

Create/modify only:

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

## Forbidden

- No `apps/trader-workflows/src/**` changes.
- No backend API/model/test changes.
- No `apps/trader-cli/**`, cockpit, or research-console changes.
- No live market data provider implementation.
- No provider SDK or API client changes.
- No database migration or storage implementation.
- No order, broker, account, position, PnL, fill, or RiskGate implementation.
- No new LangGraph graph.
- No CLI command.

## Acceptance

- `ProviderTrace`, `DataQualityFlag`, `QuoteSnapshot`, `OrderBookSnapshot`,
  `TradeTick`, `SecondBar`, `MinuteBar`, `MarketMicrostructureFeatures`,
  `MarketStateSnapshot`, and `ReplayCursor` are defined with required fields.
- `LiveMarketDataPlane` is explicitly read-only and outside broker/order
  behavior.
- Missing or degraded data uses `quality_flags` and `consumer_readiness`
  instead of silent fallback.
- `MarketStateSnapshot` is the compact artifact-ID handoff to analysis and
  future execution simulation.
- Current code limitations are named: no typed depth/trade stream, second-bar
  builder, order book snapshot, or execution behavior exists yet.
- Source docs and indexes point to the same M2 contract.

## Verification

```text
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/live-market-data-plane-v0/spec.json | ConvertFrom-Json | Out-Null; Get-Content -Raw -Encoding UTF8 .agent-dev/specs/live-market-data-plane-v0/decision-record.json | ConvertFrom-Json | Out-Null; Get-Content -Raw -Encoding UTF8 .agent-dev/specs/live-market-data-plane-v0/clarification-questions.json | ConvertFrom-Json | Out-Null; Get-Content -Raw -Encoding UTF8 .agent-dev/tasks/T015-live-market-data-plane-v0.json | ConvertFrom-Json | Out-Null
rg -n "LiveMarketDataPlane|ProviderTrace|DataQualityFlag|QuoteSnapshot|OrderBookSnapshot|TradeTick|MarketStateSnapshot|market_data_contract_failed" UBIQUITOUS_LANGUAGE.md project-docs/backlog apps/trader-workflows/README.md apps/trader-workflows/README.zh-CN.md .agent-dev/specs/live-market-data-plane-v0 .agent-dev/tasks/T015-live-market-data-plane-v0.md
git diff --check -- .agent-dev/specs/live-market-data-plane-v0 .agent-dev/tasks/T015-live-market-data-plane-v0.json .agent-dev/tasks/T015-live-market-data-plane-v0.md .agent-dev/tasks/README.md project-docs/backlog apps/trader-workflows/README.md apps/trader-workflows/README.zh-CN.md UBIQUITOUS_LANGUAGE.md
```

## Next Review

Use:

```text
Review task T015
```

The review should check source-of-truth conflicts, provider capability
assumptions, hidden execution semantics, silent fallback, missing quality/readiness
validation, and weak acceptance coverage.
