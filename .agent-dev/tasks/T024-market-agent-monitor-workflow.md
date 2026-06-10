# T024: Market Agent MarketMonitor Workflow

Status: done

Spec: `.agent-dev/specs/market-agent-mvp-v0/spec.md`

Depends on: T021, T022, and T023.

## Goal

Implement the Market Monitor service wrapper that runs market data, feature,
setup, deterministic RiskGate boundary, and existing DecisionEnvelope-compatible
persistence into `model_decisions`.

## Allowed Files

- `apps/trader-agent/backend/app/intel/market_agent/monitor.py`
- `apps/trader-agent/backend/app/intel/market_agent/risk.py`
- `apps/trader-agent/backend/app/intel/market_agent/repositories.py`
- `apps/trader-agent/backend/app/intel/market_agent/schemas.py`
- `apps/trader-agent/backend/tests/test_market_agent_monitor.py`
- `.agent-dev/tasks/T024-market-agent-monitor-workflow.*`

## Forbidden

- Do not create `OrderIntent` or execution behavior.
- Do not modify existing workflow graphs.
- Do not edit `apps/trader-cli/**`, cockpit, or research-console.

## Acceptance

- Monitor run can process symbols and timeframes using deterministic services.
- Every generated DecisionEnvelope-compatible decision is persisted to
  `model_decisions`.
- Blocked/invalid data still records an auditable decision or failure memory
  candidate without creating execution output.
- Tests cover positive watch/review path and blocked data path.

## Verification

```text
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_market_agent_monitor.py -v --tb=short
rg -n "OrderIntent|broker|position|PnL|live trading" apps/trader-agent/backend/app/intel/market_agent
git diff --check -- apps/trader-agent/backend/app/intel/market_agent apps/trader-agent/backend/tests/test_market_agent_monitor.py
```

## Review Prompt

Review task T024.
