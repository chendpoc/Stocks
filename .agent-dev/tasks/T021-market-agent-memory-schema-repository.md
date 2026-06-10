# T021: Market Agent Memory Schema & Repository

Status: done

Spec: `.agent-dev/specs/market-agent-mvp-v0/spec.md`

Depends on: current backend SQLite schema.

## Goal

Add Market Agent memory storage without duplicating existing Stage 1 physical
tables.

## Implementation Scope

Create only the approved physical tables:

```text
feature_snapshots
setup_events
pattern_memories
failure_memories
session_context_packs
```

Reuse existing physical tables:

```text
market_snapshots -> market_bars
decision_memories -> model_decisions
outcome_memories -> decision_outcomes + insight_candidate_outcomes
insight_candidates -> insight_candidates
```

If `market_bars.quality_status` is missing, add it through the same idempotent
column migration style used by `market_bars.ingested_at`.

## Allowed Files

- `apps/trader-agent/backend/app/intel/db/schema.py`
- `apps/trader-agent/backend/app/intel/market_agent/__init__.py`
- `apps/trader-agent/backend/app/intel/market_agent/schemas.py`
- `apps/trader-agent/backend/app/intel/market_agent/repositories.py`
- `apps/trader-agent/backend/tests/test_market_agent_memory_schema.py`
- `apps/trader-agent/backend/tests/test_market_agent_repositories.py`
- `.agent-dev/specs/market-agent-mvp-v0/**`
- `.agent-dev/tasks/T021-market-agent-memory-schema-repository.*`

## Forbidden

- Do not edit `apps/trader-workflows/**`.
- Do not create `market_snapshots`, `decision_memories`, or `outcome_memories`.
- Do not edit forbidden roots from `market-agent-mvp-v0/spec.json`.

## Acceptance

- Schema bootstrap creates the five new tables and keeps existing Stage 1 tables.
- `market_bars` has `quality_status` after bootstrap.
- Repository helpers support idempotent create/list for the five new table types.
- JSON fields are stored as TEXT and deserialized by repository methods.
- Existing Stage 1 schema/API tests still pass.

## Verification

```text
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_market_agent_memory_schema.py apps/trader-agent/backend/tests/test_market_agent_repositories.py -v --tb=short
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_intel_stage1_schema_api.py apps/trader-agent/backend/tests/test_intel_phase0_schema.py -v --tb=short
rg -n "CREATE TABLE IF NOT EXISTS (market_snapshots|decision_memories|outcome_memories)" apps/trader-agent/backend/app/intel apps/trader-agent/backend/tests
git diff --check -- apps/trader-agent/backend/app/intel/db/schema.py apps/trader-agent/backend/app/intel/market_agent apps/trader-agent/backend/tests/test_market_agent_memory_schema.py apps/trader-agent/backend/tests/test_market_agent_repositories.py
```

## Review Prompt

Review task T021.
