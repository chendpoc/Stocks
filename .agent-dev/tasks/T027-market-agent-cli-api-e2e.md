# T027: Market Agent CLI/API & E2E Acceptance

Status: complete

Spec: `.agent-dev/specs/market-agent-mvp-v0/spec.md`

Depends on: T021, T022, T023, T024, T025, and T026.

## Goal

Finish the public Market Agent CLI/API surface and full local acceptance chain.

## Implementation Plan

T027A, T027B, and T027C are complete and reviewed.

### T027A: Backend Market Agent API

1. Add `apps/trader-agent/backend/app/intel/api/market_agent.py` and mount it in
   `app.intel.api.__init__` with prefix `/market-agent`, so every new endpoint
   is under `/api/intel/market-agent/...`.
2. Keep every endpoint as a thin adapter over T021-T026 services or existing
   Stage 1 tables. Do not create a new service process.
3. Backend endpoint contract:
   - `POST /market-agent/memory/init`
     - initialize/verify the existing intel DB schema and return status plus
       known Market Agent table names.
   - `POST /market-agent/context/bootstrap`
     - body: `session_id`, optional `profile`, `symbol`, `max_chars`;
       if `session_id` is absent, use `profile` or `default`.
     - calls `SessionContextBootstrap.bootstrap(...)`.
   - `GET /market-agent/context/latest`
     - query: optional `session_id`, `profile`, `symbol`; same defaulting rule.
     - returns 404 when no pack exists for the filter.
   - `GET /market-agent/pattern-memory`
     - query: optional `symbol`, `pattern_id`, `status`, `limit`;
       returns `{ items, count }`.
   - `POST /market-agent/pattern-memory/promote`
     - body: `confirm`, plus one of `pattern_memory_id` or `candidate_id`.
     - requires `confirm=true`.
     - `pattern_memory_id` promotes an existing pattern memory entry.
     - `candidate_id` creates/promotes a PatternMemory from an existing
       `insight_candidates` row without adding new physical tables.
   - `POST /market-agent/pattern-memory/degrade`
     - body: one of `pattern_memory_id` or `pattern_id`, optional `reason`.
   - `GET /market-agent/failure-memory`
     - query: optional `symbol`, `failure_type`, `setup`, `status`, `limit`;
       status defaults to active-warning semantics.
   - `POST /market-agent/market-monitor/run`
     - body: `symbols`, `timeframes`, optional `limit`, `min_required`,
       `allow_live_fallback`; default remains monitor-only and no execution
       behavior is allowed.
   - `GET /market-agent/market-data/fetch`
     - query: `symbol`, optional `timeframe`, `limit`, `min_required`,
       `allow_live_fallback`.
   - `GET /market-agent/market-data/health`
     - query: optional `symbol`; reuses existing market status capability.
   - `GET /market-agent/market-data/quality`
     - query: `symbol`, optional `timeframe`, `limit`, `min_required`;
       returns DataQualityGate output without fabricating bars.
4. Add `apps/trader-agent/backend/tests/test_market_agent_api.py` covering:
   mount path, memory init, context bootstrap/latest, pattern list/promote/degrade,
   failure list, market data fetch/quality/health, and market monitor run.
5. Do not implement broker/order/position/PnL/live trading behavior.

### T027B: Workflow CLI Remaining Commands

1. Extend `apps/trader-workflows/src/services/marketAgent.ts` to match the
   backend API contract from T027A.
2. Extend `apps/trader-workflows/src/index.ts` with:
   - `memory init`;
   - `decisions list`;
   - `market-monitor run`;
   - `market-data fetch`;
   - `market-data health`;
   - `market-data quality`.
3. Preserve all completed commands:
   - `context snapshots list/show`;
   - `context bootstrap/latest`;
   - `outcomes list/run --due`;
   - `eval summary`;
   - `insights explore/list`;
   - `pattern-memory list/promote/degrade`;
   - `failure-memory list`.
4. CLI parsing contract:
   - `decisions list` accepts `--symbol`, `--model-version`, `--limit`.
   - `market-monitor run` accepts `--symbols`, `--timeframes`, `--limit`,
     `--min-required`, and `--allow-live-fallback`.
   - `market-data fetch/quality` accepts `--symbol`, `--timeframe`, `--limit`,
     `--min-required`, and fetch also accepts `--allow-live-fallback`.
   - `market-data health` accepts optional `--symbol`.
5. Add workflow tests that mock fetch and prove URL/method/body/envelope
   contracts for all new commands.

### T027C: Acceptance And Docs

1. Add `apps/trader-agent/backend/tests/test_market_agent_e2e.py` for the local
   backend acceptance chain:
   - memory init;
   - seed minimal `market_bars` fixture rows as market facts;
   - context bootstrap;
   - market-monitor run;
   - verify `model_decisions` via existing Stage 1 route;
   - create an insight candidate through existing Stage 1 route;
   - pattern-memory promote with `confirm=true` equivalent API payload;
   - context bootstrap again and assert the new pack observes promoted memory.
2. Keep workflow graph E2E covered by existing workflow tests; do not rewrite
   OutcomeGraph, EvaluationGraph, or InsightExplorationGraph.
3. Update `apps/trader-workflows/README.md` and `README.zh-CN.md` examples to
   use actual `npm run workflows -- <command>` names only.
4. Correct this task's JSON metadata so T027B owns workflow CLI command files
   and T027C owns backend E2E plus README/final consistency.
5. Run consistency checks:
   - no top-level `trader memory`, `trader monitor`, or `trader market-data`;
   - no `tests/market_agent/` recommendation;
   - no physical `market_snapshots`, `decision_memories`, or
     `outcome_memories` table creation.

## Allowed Files

- `apps/trader-agent/backend/app/intel/api/market_agent.py`
- `apps/trader-agent/backend/app/intel/api/__init__.py`
- `apps/trader-agent/backend/tests/test_market_agent_api.py`
- `apps/trader-agent/backend/tests/test_market_agent_e2e.py`
- `apps/trader-workflows/src/index.ts`
- `apps/trader-workflows/src/index.test.ts`
- `apps/trader-workflows/src/services/marketAgent.ts`
- `apps/trader-workflows/src/services/marketAgent.test.ts`
- `apps/trader-workflows/README.md`
- `apps/trader-workflows/README.zh-CN.md`
- `.agent-dev/tasks/T027-market-agent-cli-api-e2e.*`

## Forbidden

- Do not add top-level `trader` CLI.
- Do not edit `apps/trader-cli/**`.
- Do not add frontend UI.
- Do not add execution behavior.

## Acceptance

- Backend Market Agent APIs are mounted under `/api/intel`.
- Workflow CLI supports the documented Market Agent command set.
- Local backend e2e test covers memory init, context bootstrap, market monitor,
  Stage 1 decision inspection, Stage 1 insight candidate creation, pattern
  promote, and context bootstrap again.
- Workflow graph and CLI tests continue to cover outcomes run, eval summary,
  insights explore, and the Market Agent command adapters.
- Documentation examples in workflow README match actual command names.

## Verification

```text
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_market_agent_api.py apps/trader-agent/backend/tests/test_market_agent_e2e.py -v --tb=short
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_market_agent_*.py -v --tb=short
npm --prefix apps/trader-workflows test
npm --prefix apps/trader-workflows run workflows -- memory init --json
npm --prefix apps/trader-workflows run workflows -- context bootstrap --json
npm --prefix apps/trader-workflows run workflows -- market-monitor run --symbols TSLA --timeframes 5m --json
rg -n "trader memory|trader monitor|trader market-data|tests/market_agent|CREATE TABLE IF NOT EXISTS (market_snapshots|decision_memories|outcome_memories)" project-docs/market-agent .agent-dev apps/trader-agent/backend apps/trader-workflows
git diff --check
```

## Review Prompt

Review task T027.
