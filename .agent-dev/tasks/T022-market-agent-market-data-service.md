# T022: Market Agent MarketDataService & DataQualityGate

Status: done

Spec: `.agent-dev/specs/market-agent-mvp-v0/spec.md`

Depends on: T021.

## Goal

Expose a Market Agent service wrapper over existing `market_bars` ingestion and
queries with explicit data quality status.

## Allowed Files

- `apps/trader-agent/backend/app/intel/market_agent/market_data.py`
- `apps/trader-agent/backend/app/intel/market_agent/schemas.py`
- `apps/trader-agent/backend/app/intel/market_agent/repositories.py`
- `apps/trader-agent/backend/tests/test_market_agent_market_data.py`
- `.agent-dev/tasks/T022-market-agent-market-data-service.*`

## Forbidden

- Do not add a new live provider or provider SDK.
- Do not implement setup detection, decisions, or execution behavior.
- Do not edit `apps/trader-workflows/**`.

## Acceptance

- Service reads/writes standard OHLCV bars through existing `market_bars`.
- Quality status is one of `pass`, `warning`, `failed`, or `blocked`.
- Failed/blocked responses are visible and do not fabricate bars.
- Tests use fixtures or temporary SQLite, not real network calls.

## Verification

```text
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_market_agent_market_data.py -v --tb=short
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_intel_cache_market_ttl.py apps/trader-agent/backend/tests/test_intel_market_status.py -v --tb=short
git diff --check -- apps/trader-agent/backend/app/intel/market_agent apps/trader-agent/backend/tests/test_market_agent_market_data.py
```

## Review Prompt

Review task T022.
