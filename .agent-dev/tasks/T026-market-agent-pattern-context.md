# T026: Market Agent Pattern/Failure Memory + SessionContextBootstrap

Status: done

Spec: `.agent-dev/specs/market-agent-mvp-v0/spec.md`

Depends on: T021 and T025.

## Goal

Implement durable PatternMemory, FailureMemory, and SessionContextBootstrap
behavior over the Market Agent memory repository.

## Implementation Plan

### T026A: Backend Memory And Context Services

1. Reuse the T021 repository and schema objects for `pattern_memories`,
   `failure_memories`, and `session_context_packs`.
2. Add `patterns.py` with deterministic service functions:
   - list pattern memories by symbol, pattern/setup id, and status fields stored
     inside `memory_json`;
   - promote only with an explicit confirm flag;
   - degrade/retire without deleting historical rows.
3. Add failure memory listing over existing `failure_memories`:
   - active warnings are records whose `failure_json.status` is active/open or
     missing-retired;
   - support symbol/setup/failure_type filters where available.
4. Add `context.py` SessionContextBootstrap:
   - select promoted/degrading patterns, active failures, recent setup/decision
     summaries where available;
   - build bounded Markdown plus structured metadata;
   - persist a new `session_context_packs` record on every bootstrap call.
5. Backend tests must prove:
   - list/promote/degrade behavior;
   - `promote` fails without explicit confirm;
   - active failure listing filters correctly;
   - context bootstrap is bounded and append-only for repeated session ids;
   - `context latest` returns the latest persisted pack.

### T026B: Workflow CLI Adapter

1. Keep T026B as a workflow CLI adapter only. Do not add backend API routes in
   this subtask; T027 owns real `/api/intel/...` route implementation.
2. Extend `apps/trader-workflows/src/services/marketAgent.ts` as a thin
   `fetchIntel(...)` HTTP contract over future Market Agent endpoints:
   - `POST /market-agent/context/bootstrap`
   - `GET /market-agent/context/latest`
   - `GET /market-agent/pattern-memory`
   - `POST /market-agent/pattern-memory/promote`
   - `POST /market-agent/pattern-memory/degrade`
   - `GET /market-agent/failure-memory`
3. Extend `apps/trader-workflows/src/index.ts` with:
   - `context bootstrap/latest`;
   - `pattern-memory list/promote/degrade`;
   - `failure-memory list`.
4. Keep all commands under `npm run workflows -- <command>`.
5. Preserve existing `context snapshots list/show` behavior.
6. Command parsing contract:
   - `context bootstrap` accepts `--session-id`, `--profile`, `--symbol`, and
     `--max-chars`. If `--session-id` is absent, use `--profile` or `default`
     as the session id for the adapter payload.
   - `context latest` accepts `--session-id`, `--profile`, and `--symbol` with
     the same defaulting rule.
   - `pattern-memory list` accepts `--symbol`, `--pattern-id`, `--status`, and
     `--limit`.
   - `pattern-memory promote` requires `--confirm` and at least one of
     `--pattern-memory-id` or `--candidate-id`.
   - `pattern-memory degrade` requires at least one of `--pattern-memory-id` or
     `--pattern-id`, and accepts `--reason`.
   - `failure-memory list` accepts `--symbol`, `--type`/`--failure-type`,
     `--setup`, `--status`, and `--limit`.
7. Workflow tests must mock fetch, prove URL/query/body contracts, and verify
   `--confirm` is required before promote.

Do not implement T026B until T026A backend tests pass.

## Allowed Files

- `apps/trader-agent/backend/app/intel/market_agent/patterns.py`
- `apps/trader-agent/backend/app/intel/market_agent/context.py`
- `apps/trader-agent/backend/app/intel/market_agent/repositories.py`
- `apps/trader-agent/backend/app/intel/market_agent/schemas.py`
- `apps/trader-agent/backend/tests/test_market_agent_pattern_memory.py`
- `apps/trader-agent/backend/tests/test_market_agent_context_pack.py`
- `apps/trader-workflows/src/index.ts`
- `apps/trader-workflows/src/index.test.ts`
- `apps/trader-workflows/src/services/marketAgent.ts`
- `apps/trader-workflows/src/services/marketAgent.test.ts`
- `.agent-dev/tasks/T026-market-agent-pattern-context.*`

## Forbidden

- Do not auto-promote patterns without `--confirm`.
- Do not write context packs outside repository-managed or explicit output paths.
- Do not edit cockpit, research-console, or trader-cli.

## Acceptance

- Pattern memory supports list, promote, and degrade state changes.
- Failure memory supports active warning listing.
- `context bootstrap` builds a bounded Markdown context pack and persists
  `session_context_packs`.
- `context latest` returns the latest persisted context pack summary.

## Verification

```text
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_market_agent_pattern_memory.py apps/trader-agent/backend/tests/test_market_agent_context_pack.py -v --tb=short
npm --prefix apps/trader-workflows test -- src/index.test.ts src/services/marketAgent.test.ts
git diff --check -- apps/trader-agent/backend/app/intel/market_agent apps/trader-agent/backend/tests/test_market_agent_pattern_memory.py apps/trader-agent/backend/tests/test_market_agent_context_pack.py apps/trader-workflows/src/index.ts apps/trader-workflows/src/index.test.ts apps/trader-workflows/src/services/marketAgent.ts apps/trader-workflows/src/services/marketAgent.test.ts
```

## Review Prompt

Review task T026.
