# LiveMarketDataPlane Implementation Decision Gate

> Source backlog: `project-docs/backlog/now/live-market-data-plane-implementation-decision-gate.md`
> Structured contract: `spec.json`
> Decisions: `decision-record.json`
> Open questions: `clarification-questions.md`

Status: review

## Purpose

Define T016 for the M2 implementation decision gate.

T015 completed the `LiveMarketDataPlane v0` contract. T016 does not implement
market data. It collects the provider, entitlement, scope, storage, retention,
inspection, readiness, fallback, and execution-boundary decisions that must be
confirmed before implementation.

## Source Docs

- `project-docs/backlog/now/live-market-data-plane-implementation-decision-gate.md`
- `project-docs/backlog/now/live-market-data-plane-v0.md`
- `project-docs/backlog/now/analysis-to-execution-contract-v0.md`
- `project-docs/backlog/workflow-maturity-roadmap.md`
- `project-docs/backlog/two-layer-market-analysis-and-execution-system.md`
- `UBIQUITOUS_LANGUAGE.md`

Official provider references:

- `https://open.longbridge.com/docs/quote/subscribe/overview`
- `https://open.longbridge.com/docs/quote/push/depth`
- `https://open.longbridge.com/docs/quote/push/trade`
- `https://open.longbridge.com/docs/quote/objects`

Readonly local implementation context:

- `apps/trader-agent/backend/app/tools/longbridge_adapter.py`
- `apps/trader-agent/backend/app/tools/tool_registry.py`
- `apps/trader-agent/backend/app/intel/db/connection.py`
- `apps/trader-agent/backend/app/intel/db/schema.py`
- `apps/trader-agent/backend/app/intel/ingestion/market_data.py`
- `apps/trader-workflows/src/services/outcomes.ts`

## Proposed Decisions

For the confirmation prompt, use `confirmation-request.md` in this spec
directory. It is only a user response template; it does not confirm any decision
by itself.

| ID | Proposed rule | Confirmation status |
|---|---|---|
| D501 | Use Longbridge OpenAPI as primary live provider candidate, with startup entitlement probe. | pending_user_confirmation |
| D502 | First scope is US equities: `TSLA.US`, `NVDA.US`, `AAPL.US`, `QQQ.US`, `SPY.US`, regular trading hours first. | pending_user_confirmation |
| D503 | Store normalized artifacts in `data/market_intel.db` dedicated M2 tables; raw payloads are optional bounded raw refs. | pending_user_confirmation |
| D504 | Retain normalized quote/depth/trade facts for 7 trading days; retain derived bars/features/state snapshots for 30 calendar days. | pending_user_confirmation |
| D505 | Inspect through backend read APIs plus CLI first; no cockpit/TUI in M2. | pending_user_confirmation |
| D506 | Use deterministic readiness thresholds: analysis warning > 5s quote age, analysis blocked > 30s, paper/shadow blocked > 2s or missing required depth/trade. | pending_user_confirmation |
| D507 | No silent live fallback; fallback is replay/degraded only, labeled, and cannot upgrade readiness. | pending_user_confirmation |
| D508 | M2 still excludes PaperTradingEngine, RiskGate, orders, positions, PnL, broker/account, and live trading. | pending_user_confirmation |

## Allowed Files

T016 may create or modify only planning artifacts:

```text
.agent-dev/specs/live-market-data-plane-implementation-decision-gate/**
.agent-dev/specs/live-market-data-plane-implementation-decision-gate/confirmation-request.md
.agent-dev/tasks/T016-live-market-data-plane-implementation-decision-gate.md
.agent-dev/tasks/T016-live-market-data-plane-implementation-decision-gate.json
.agent-dev/tasks/README.md
project-docs/backlog/README.md
project-docs/backlog/now/live-market-data-plane-implementation-decision-gate.md
project-docs/backlog/workflow-maturity-roadmap.md
apps/trader-workflows/README.md
apps/trader-workflows/README.zh-CN.md
```

Readonly context:

```text
.agent-dev/specs/live-market-data-plane-v0/**
.agent-dev/specs/analysis-to-execution-contract-v0/**
apps/trader-agent/backend/app/tools/longbridge_adapter.py
apps/trader-agent/backend/app/tools/tool_registry.py
apps/trader-agent/backend/app/intel/db/connection.py
apps/trader-agent/backend/app/intel/db/schema.py
apps/trader-agent/backend/app/intel/ingestion/market_data.py
apps/trader-workflows/src/services/outcomes.ts
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

1. The gate lists every M2 implementation decision that blocks coding.
2. Provider capability statements cite official Longbridge quote docs and remain
   separated from entitlement assumptions.
3. Recommendations are marked pending user confirmation, not confirmed.
4. The gate explicitly blocks provider adapters, storage migrations, streams,
   CLI/API work, and execution simulation until the user confirms decisions.
5. Backlog, roadmap, task index, and workflow README point to the decision gate.

## Verification

```text
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/live-market-data-plane-implementation-decision-gate/spec.json | ConvertFrom-Json | Out-Null; Get-Content -Raw -Encoding UTF8 .agent-dev/specs/live-market-data-plane-implementation-decision-gate/decision-record.json | ConvertFrom-Json | Out-Null; Get-Content -Raw -Encoding UTF8 .agent-dev/specs/live-market-data-plane-implementation-decision-gate/clarification-questions.json | ConvertFrom-Json | Out-Null; Get-Content -Raw -Encoding UTF8 .agent-dev/tasks/T016-live-market-data-plane-implementation-decision-gate.json | ConvertFrom-Json | Out-Null
rg -n "LiveMarketDataPlane Implementation Decision Gate|implementation decision gate|D501|pending_user_confirmation|Longbridge|provider_fallback" .agent-dev/specs/live-market-data-plane-implementation-decision-gate .agent-dev/tasks/T016-live-market-data-plane-implementation-decision-gate.md project-docs/backlog apps/trader-workflows/README.md apps/trader-workflows/README.zh-CN.md
git diff --check -- .agent-dev/specs/live-market-data-plane-implementation-decision-gate .agent-dev/tasks/T016-live-market-data-plane-implementation-decision-gate.json .agent-dev/tasks/T016-live-market-data-plane-implementation-decision-gate.md .agent-dev/tasks/README.md project-docs/backlog apps/trader-workflows/README.md apps/trader-workflows/README.zh-CN.md
```

No implementation tests are required for T016 because it is a decision gate.
