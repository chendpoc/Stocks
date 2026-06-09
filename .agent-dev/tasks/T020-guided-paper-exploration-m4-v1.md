# T020 — Guided Paper Exploration (M4 v1)

Status: in_progress

## Goal

Wire M1 `ExecutionPolicy` through deterministic `RiskGate` into M3 `PaperTradingEngine`, returning `ExecutionFeedback` for operator review. No broker or live trading.

## Scope

- `execution_policy` validate + store
- `risk_gate` allow/reject from policy + `MarketStateSnapshot.consumer_readiness`
- `guided_paper_exploration` orchestrator + `guided_paper_runs` persistence
- API: `POST/GET /api/guided-paper/execution-policies`, `POST /api/guided-paper/runs`
- M2 depth/trade artifacts via `persist_websocket_push`

## Out of scope

- LangGraph workflow node
- Longbridge order placement
- Cockpit UI

## Verification

```bash
cd apps/trader-agent/backend
python -m pytest tests/test_guided_paper_exploration.py tests/test_live_market_plane_ws.py -q
```

## Evidence

终端冒烟记录：`.agent-dev/reviews/workflow-cli-smoke-2026-06-06.md`

| 区域 | 结果 |
|------|------|
| Workflows 核心（decide / runs / context / outcomes / eval / insights） | pass（outcomes/eval 为数据空样本） |
| Trader CLI 包装 | pass（建议 `cd apps/trader-cli && npx tsx`） |
| M4 policy register/get | pass |
| M4 guided run E2E | blocked：无 M2 MarketState |
| M2 ingest/stream | blocked：SDK + capability |

Fixture：`apps/trader-agent/backend/tests/fixtures/execution-policy-demo.json`
