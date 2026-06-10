# T023: Market Agent FeatureEngine & SetupDetector

Status: complete

Spec: `.agent-dev/specs/market-agent-mvp-v0/spec.md`

Depends on: T021 and T022.

## Goal

Compute deterministic feature snapshots and setup events from trusted market
bars. No LLM may write fact-layer features or setup facts.

## Allowed Files

- `apps/trader-agent/backend/app/intel/market_agent/features.py`
- `apps/trader-agent/backend/app/intel/market_agent/setups.py`
- `apps/trader-agent/backend/app/intel/market_agent/repositories.py`
- `apps/trader-agent/backend/app/intel/market_agent/schemas.py`
- `apps/trader-agent/backend/tests/test_market_agent_features.py`
- `apps/trader-agent/backend/tests/test_market_agent_setups.py`
- `.agent-dev/tasks/T023-market-agent-feature-setup.*`

## Forbidden

- Do not edit `apps/trader-workflows/**`.
- Do not call LLMs or external market APIs.
- Do not create decisions or outcomes.

## Acceptance

- FeatureEngine computes VWAP, EMA 9/20/50, ATR, volume ratio, and benchmark
  relative strength when enough bars exist.
- Feature snapshots are persisted only for `pass` or `warning` quality input.
- SetupDetector emits deterministic setup events for MVP setup names from
  `project-docs/market-agent`.
- Tests cover insufficient data, blocked data, and a positive setup scenario.

## Verification

```text
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_market_agent_features.py apps/trader-agent/backend/tests/test_market_agent_setups.py -v --tb=short
git diff --check -- apps/trader-agent/backend/app/intel/market_agent apps/trader-agent/backend/tests/test_market_agent_features.py apps/trader-agent/backend/tests/test_market_agent_setups.py
```

## Review Prompt

Review task T023.
