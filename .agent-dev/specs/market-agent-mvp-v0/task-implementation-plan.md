# Market Agent MVP Task Implementation Plan

This file is the task-level implementation contract for T021-T027. It turns the
source-of-truth docs into concrete development steps before each worker task is
dispatched or accepted.

## Planning Contract

For every task, the controller and worker must do this in order:

1. Confirm source-of-truth files: `project-docs/market-agent/**`, this spec, the
   task card, `.agent-dev/context/code_map.md`, and the ubiquitous language.
2. Locate existing logic with CodeGraph before reading broad file trees.
3. Reuse existing storage, Workflow, Native LangGraph Graph, CLI, Outcome,
   RiskGate, ExecutionPolicy, and OrderIntent terminology.
4. Define the smallest write scope and forbidden paths before editing.
5. Write or update scoped tests that prove the task contract.
6. Run scoped tests, `git diff --check`, read the scoped diff, then request
   read-only review.
7. Send real review findings back to a worker for repair and re-review.

Do not treat conceptual aliases as physical names:

- `market_snapshots` maps to `market_bars`.
- `decision_memories` maps to `model_decisions`.
- `outcome_memories` maps to `decision_outcomes` plus
  `insight_candidate_outcomes`.

## T021: Memory Schema & Repository

Status: completed and reviewed.

Implementation steps:

1. Add only the five approved tables:
   `feature_snapshots`, `setup_events`, `pattern_memories`,
   `failure_memories`, and `session_context_packs`.
2. Add idempotent `market_bars.quality_status` migration only if absent.
3. Create repository helpers for idempotent create/list and JSON field
   round-trip.
4. Keep `session_context_packs` append-only by allowing repeated `session_id`.
5. Prove no physical `market_snapshots`, `decision_memories`, or
   `outcome_memories` tables are created.

Acceptance evidence:

- T021 backend schema/repository tests pass.
- Existing Stage 1 schema/API tests pass.
- Review verdict is pass.

## T022: MarketDataService & DataQualityGate

Status: completed and reviewed.

Implementation steps:

1. Wrap existing `market_bars` query/ingestion through `MarketDataService`.
2. Keep live provider behavior inside existing ingestion code; do not add a new
   provider.
3. Normalize quality status to `pass`, `warning`, `failed`, or `blocked`.
4. Make failed/blocked visible and avoid fabricated bars.
5. Test temporary SQLite and mocks only.

Acceptance evidence:

- T022 market data tests pass.
- T021 repository regression tests pass.
- Existing market TTL/status tests pass.
- Review verdict is pass.

## T023: FeatureEngine & SetupDetector

Status: completed and reviewed after repair.

Implementation steps:

1. Compute deterministic features from trusted bars:
   VWAP, EMA 9/20/50, ATR true range, volume ratio,
   `relative_strength_spy`, and `relative_strength_qqq`.
2. Persist feature snapshots only for `pass` or `warning` quality input.
3. Detect MVP setup names:
   `VWAP_RECLAIM`, `RELATIVE_STRENGTH_PULLBACK`, and
   `OPENING_RANGE_BREAKOUT`.
4. Block normal setup detection for `failed` or `blocked` quality input while
   retaining an audit path.
5. Persist `setup_events` using the T021 physical schema: setup details live in
   `setup_json` and context details live in `context_json`.

Acceptance evidence:

- Feature/setup tests pass.
- T021/T022 regressions pass.
- Review verdict is pass after fixes for blocked audit persistence, SPY/QQQ
  relative-strength OR semantics, and ATR true range.

## T024: MarketMonitor Workflow

Status: completed and reviewed.

Implementation plan:

1. Inventory existing logic:
   - Use T022 `MarketDataService` for bars and quality.
   - Use T023 `FeatureEngine` and `SetupDetector` for facts and setup events.
   - Use existing `model_decisions` schema and Stage 1 decision semantics.
   - Use DecisionEnvelope-compatible fields from
     `apps/trader-workflows/src/llm/decisionEnvelope.ts` without calling LLMs.
2. Add `risk.py` as a deterministic RiskGate boundary:
   - Input: quality, setup events, feature metadata, monitor mode.
   - Output: `pass`, `watch_only`, `blocked`, or
     `requires_user_confirmation`.
   - MVP default remains monitor-only, so no execution action can be produced.
3. Add `monitor.py` as orchestration service:
   - `run_symbol(...)` fetches market data, checks quality, computes/persists
     features, detects/persists setup events, applies RiskGate, and persists a
     DecisionEnvelope-compatible row in `model_decisions`.
   - Positive path produces watch/review-style decisions only.
   - Blocked path skips normal setup detection and persists an auditable
     decision payload with quality/risk reason.
4. Add a small repository helper only if it mirrors Stage 1 model decision
   insert/idempotency semantics; otherwise write locally in monitor with the
   same schema contract.
5. Tests must cover:
   - positive watch/review path writes `feature_snapshots`, `setup_events`, and
     `model_decisions`;
   - blocked data path writes an auditable `model_decisions` row and no normal
     setup event;
   - duplicate deterministic run is idempotent or conflict-safe;
   - forbidden terms do not appear as implementation surface.

Non-goals:

- No OrderIntent.
- No broker, position, PnL, or live trading.
- No workflow graph rewrite.

## T025: Outcome/Evaluation/Insight Adapter

Status: completed and reviewed.

Implementation plan:

1. Inventory existing workflow logic:
   - `OutcomeGraph.runDue(...)`
   - `EvaluationGraph.runSummary(...)`
   - `InsightExplorationGraph` existing command path
   - `Stage1Runtime.runGraph(...)`
   - Stage 1 API/service list helpers for outcomes and insight candidates.
2. Keep graph implementations read-only; only adapt CLI/service behavior.
3. Add `services/marketAgent.ts` as a thin command adapter:
   - `outcomes list` reads Stage 1 outcomes;
   - `outcomes run --due` delegates to the existing OutcomeGraph path;
   - `eval summary` delegates to the existing EvaluationGraph path;
   - `insights explore` delegates to existing InsightExplorationGraph path;
   - `insights list` reads Stage 1 insight candidates.
4. Update `index.ts` command dispatch without adding a top-level `trader` CLI.
5. Tests must prove command parsing and delegation through `Stage1Runtime`, not
   direct graph rewrites.

Non-goals:

- No backend schema changes.
- No graph rewrites under `graphs/01-outcome`, `graphs/02-evaluation`, or
  `graphs/03-insightExploration`.

## T026: Pattern/Failure Memory + SessionContextBootstrap

Status: completed and reviewed.

Implementation plan:

1. Inventory current T021 repository helpers for `pattern_memories`,
   `failure_memories`, and `session_context_packs`.
2. Add backend pattern memory service:
   - list patterns by symbol/setup/status;
   - promote only when explicit confirm is supplied;
   - degrade or retire without deleting history.
3. Add backend failure memory query service:
   - list active warnings;
   - filter by symbol/setup/failure type where available.
4. Add SessionContextBootstrap:
   - read promoted/degrading patterns, active failures, recent setup/decision
     summaries, and risk boundaries;
   - build bounded Markdown plus structured metadata;
   - persist a new `session_context_packs` record every bootstrap call.
5. Add workflow service/CLI commands:
   - `pattern-memory list/promote/degrade`;
   - `failure-memory list`;
   - `context bootstrap/latest`.
6. Tests must prove no auto-promotion, bounded context output, append-only
   context packs, and CLI service behavior.

T026B concrete CLI adapter plan:

1. Do not add backend API routes in T026B; T027 will implement real
   `/api/intel/...` endpoints.
2. Add thin `fetchIntel(...)` service functions in
   `apps/trader-workflows/src/services/marketAgent.ts` for:
   `context bootstrap/latest`, `pattern-memory list/promote/degrade`, and
   `failure-memory list`.
3. Use this adapter endpoint contract for T026B tests and T027 backend work:
   `POST /market-agent/context/bootstrap`,
   `GET /market-agent/context/latest`,
   `GET /market-agent/pattern-memory`,
   `POST /market-agent/pattern-memory/promote`,
   `POST /market-agent/pattern-memory/degrade`, and
   `GET /market-agent/failure-memory`.
4. Extend `apps/trader-workflows/src/index.ts` command dispatch while preserving
   `context snapshots list/show`.
5. Parse CLI flags conservatively:
   - `context bootstrap/latest`: `--session-id`, `--profile`, `--symbol`,
     `--max-chars` for bootstrap only; default session id is `--profile` or
     `default`.
   - `pattern-memory list`: `--symbol`, `--pattern-id`, `--status`, `--limit`.
   - `pattern-memory promote`: require `--confirm` and
     `--pattern-memory-id` or `--candidate-id`.
   - `pattern-memory degrade`: require `--pattern-memory-id` or
     `--pattern-id`; pass optional `--reason`.
   - `failure-memory list`: `--symbol`, `--type`/`--failure-type`, `--setup`,
     `--status`, `--limit`.
6. Tests must mock `fetch`, assert URL/method/body contracts, assert envelopes,
   and prove missing `--confirm` returns a command error before network I/O.

Non-goals:

- Do not write context packs outside repository-managed or explicit output
  paths.
- Do not change cockpit, research-console, or trader-cli.

## T027: CLI/API & E2E Acceptance

Status: T027A and T027B completed and reviewed. T027C pending.

Implementation plan:

1. Inventory current FastAPI `app.intel.api` aggregation and workflow CLI
   dispatch.
2. Split implementation into three serial subtasks:
   - T027A backend API;
   - T027B workflow CLI;
   - T027C acceptance docs and E2E checks.
3. Add backend Market Agent API under `/api/intel/...` only:
   - mount through existing `intel_router`;
   - do not create a separate service;
   - expose market-agent endpoints as thin adapters over T021-T026 services.
4. Backend endpoint contract:
   - `POST /market-agent/memory/init`;
   - `POST /market-agent/context/bootstrap`;
   - `GET /market-agent/context/latest`;
   - `GET /market-agent/pattern-memory`;
   - `POST /market-agent/pattern-memory/promote`;
   - `POST /market-agent/pattern-memory/degrade`;
   - `GET /market-agent/failure-memory`;
   - `POST /market-agent/market-monitor/run`;
   - `GET /market-agent/market-data/fetch`;
   - `GET /market-agent/market-data/health`;
   - `GET /market-agent/market-data/quality`.
5. Finalize workflow CLI command set under
   `npm run workflows -- <command>`:
   - `memory init`;
   - `context bootstrap/latest`;
   - `decisions list`;
   - `outcomes list/run --due`;
   - `eval summary`;
   - `insights explore/list`;
   - `pattern-memory list/promote/degrade`;
   - `failure-memory list`;
   - `market-monitor run`;
   - `market-data fetch/health/quality`.
6. Update workflow README examples to match actual command names.
7. Add local E2E acceptance:
   - temporary SQLite init;
   - `memory init`;
   - `context bootstrap`;
   - `market-monitor run`;
   - `outcomes run --due`;
   - `eval summary`;
   - `insights explore`;
   - `pattern-memory promote --confirm`;
   - second `context bootstrap`.
8. Run consistency checks:
   - no `trader memory`, `trader monitor`, or top-level `trader` CLI;
   - no recommended `tests/market_agent/`;
   - no physical `market_snapshots`, `decision_memories`, or
     `outcome_memories` table creation.

T027C concrete acceptance/docs plan:

1. Add `apps/trader-agent/backend/tests/test_market_agent_e2e.py`.
2. Use FastAPI `TestClient` with temporary SQLite and public API calls for
   durable artifacts where those APIs already exist:
   - `POST /api/intel/market-agent/memory/init`;
   - seed only deterministic `market_bars` fixture rows as market facts;
   - `POST /api/intel/market-agent/context/bootstrap`;
   - `POST /api/intel/market-agent/market-monitor/run`;
   - `GET /api/intel/stage1/model-decisions`;
   - `POST /api/intel/stage1/insight-candidates`;
   - `POST /api/intel/market-agent/pattern-memory/promote` with
     `confirm=true`;
   - `POST /api/intel/market-agent/context/bootstrap` again and assert the new
     pack includes promoted memory.
3. Keep OutcomeGraph, EvaluationGraph, and InsightExplorationGraph covered by
   workflow tests and existing adapters; do not fake graph success inside the
   backend E2E test.
4. Update `apps/trader-workflows/README.md` and `README.zh-CN.md` examples so
   they advertise only real `npm run workflows -- <command>` names, including
   `memory init`, `context bootstrap/latest`, `decisions list`,
   `market-monitor run`, and `market-data fetch/health/quality`.
5. Correct `.agent-dev/tasks/T027-market-agent-cli-api-e2e.*` status metadata:
   T027B owns workflow CLI commands; T027C owns backend E2E and README/final
   consistency.
6. Run the T027C backend tests, all `test_market_agent_*.py` tests, workflow
   tests, forbidden-text checks, and `git diff --check`.

Non-goals:

- No frontend UI.
- No execution behavior.
- No edits under `apps/trader-cli/**`.
