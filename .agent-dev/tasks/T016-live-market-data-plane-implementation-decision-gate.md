# T016: LiveMarketDataPlane Implementation Decision Gate

Status: done

Spec: `.agent-dev/specs/live-market-data-plane-implementation-decision-gate/spec.md`

Depends on: T015 LiveMarketDataPlane v0.

## Goal

Create the M2 implementation decision gate that blocks coding until the user
confirms provider, entitlement, symbol scope, storage, retention, inspection,
readiness, fallback, and execution-boundary choices.

T016 is a decision gate only. It does not implement provider adapters, storage
migrations, stream handlers, CLI/API inspection, paper trading, broker adapters,
or execution simulation.

## Step Map

| Step | Scope | Status |
|---|---|---|
| S1 | Add implementation decision gate source doc and spec/task shell | done |
| S2 | Record provider evidence, local evidence, recommendations, and alternatives | done |
| S3 | Link roadmap, backlog index, workflow README, and task index | done |
| S4 | Run planning verification commands | done |
| S5 | User confirms or changes D501-D508 | done |

## Proposed Decisions Pending User Confirmation

Confirmation helper:
`.agent-dev/specs/live-market-data-plane-implementation-decision-gate/confirmation-request.md`

| ID | Proposed rule |
|---|---|
| D501 | Longbridge OpenAPI as primary live provider candidate, with startup entitlement probe. |
| D502 | US equities first: `TSLA.US`, `NVDA.US`, `AAPL.US`, `QQQ.US`, `SPY.US`, regular trading hours first. |
| D503 | Dedicated M2 tables in `data/market_intel.db`; optional bounded raw refs. |
| D504 | 7 trading days retention for normalized quote/depth/trade facts; 30 calendar days for derived artifacts. |
| D505 | Backend read APIs plus CLI inspection first; no cockpit/TUI in M2. |
| D506 | Analysis warning > 5s quote age, analysis blocked > 30s, paper/shadow blocked > 2s or missing required depth/trade. |
| D507 | No silent live fallback; replay/degraded only, labeled, and cannot upgrade readiness. |
| D508 | M2 remains read-only; no PaperTradingEngine, RiskGate, orders, positions, PnL, broker/account, or live trading. |

## Allowed Files

Create/modify only:

```text
.agent-dev/specs/live-market-data-plane-implementation-decision-gate/**
.agent-dev/tasks/T016-live-market-data-plane-implementation-decision-gate.md
.agent-dev/tasks/T016-live-market-data-plane-implementation-decision-gate.json
.agent-dev/tasks/README.md
project-docs/backlog/README.md
project-docs/backlog/now/live-market-data-plane-implementation-decision-gate.md
project-docs/backlog/workflow-maturity-roadmap.md
apps/trader-workflows/README.md
apps/trader-workflows/README.zh-CN.md
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

- The gate lists every M2 implementation decision that blocks coding.
- Provider capability statements cite official Longbridge quote docs and remain
  separated from entitlement assumptions.
- Recommendations are marked pending user confirmation, not confirmed.
- The gate blocks implementation work until user confirmation.
- Source docs and indexes point to the same T016 decision gate.

## Verification

```text
Get-Content -Raw -Encoding UTF8 .agent-dev/specs/live-market-data-plane-implementation-decision-gate/spec.json | ConvertFrom-Json | Out-Null; Get-Content -Raw -Encoding UTF8 .agent-dev/specs/live-market-data-plane-implementation-decision-gate/decision-record.json | ConvertFrom-Json | Out-Null; Get-Content -Raw -Encoding UTF8 .agent-dev/specs/live-market-data-plane-implementation-decision-gate/clarification-questions.json | ConvertFrom-Json | Out-Null; Get-Content -Raw -Encoding UTF8 .agent-dev/tasks/T016-live-market-data-plane-implementation-decision-gate.json | ConvertFrom-Json | Out-Null
rg -n "LiveMarketDataPlane Implementation Decision Gate|implementation decision gate|D501|pending_user_confirmation|Longbridge|provider_fallback" .agent-dev/specs/live-market-data-plane-implementation-decision-gate .agent-dev/tasks/T016-live-market-data-plane-implementation-decision-gate.md project-docs/backlog apps/trader-workflows/README.md apps/trader-workflows/README.zh-CN.md
git diff --check -- .agent-dev/specs/live-market-data-plane-implementation-decision-gate .agent-dev/tasks/T016-live-market-data-plane-implementation-decision-gate.json .agent-dev/tasks/T016-live-market-data-plane-implementation-decision-gate.md .agent-dev/tasks/README.md project-docs/backlog apps/trader-workflows/README.md apps/trader-workflows/README.zh-CN.md
```

## Next Review

After the user confirms or changes D501-D508, generate the M2 implementation
spec/task. Do not write implementation code from T016 directly.
