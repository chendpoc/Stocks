# Agent Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first executable Agent Core Backend that can ingest trader knowledge, read local market/news evidence, detect deterministic setups, produce auditable `SignalCandidate` states, and generate lite-backtested rule proposals without automatic trading.

**Architecture:** Standalone monorepo subproject under `apps/trader-agent/`. Phase 0 implements only `apps/trader-agent/backend/`, using deterministic services before Brain composition. The first version keeps rules and raw inputs in files, stores runtime state in SQLite, audits all mutations, and accesses data through `LocalToolAdapter`. PostgreSQL, Redis, vector DB, remote Tool Gateway, and distributed workers are production extensions, not Phase 1 requirements.

**Tech Stack:** Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2.x, SQLite, pytest, ruff, uvicorn, pandas, pandas-market-calendars, yfinance or fixture-backed market data.

---

## Source Documents

- [00-system-overview.md](./00-system-overview.md)
- [01-agent-core-backend-prd.md](./01-agent-core-backend-prd.md)
- [03-shared-platform-roadmap-prd.md](./03-shared-platform-roadmap-prd.md)
- [04-ai-rag-mcp-platform-roadmap-prd.md](./04-ai-rag-mcp-platform-roadmap-prd.md)
- [01-agent-core-development/README.md](./01-agent-core-development/README.md)
- [01-agent-core-development/21-rule-discovery-lite-backtest-engine.md](./01-agent-core-development/21-rule-discovery-lite-backtest-engine.md)

## First-Principles Scope

Agent Core 的第一版不是交易机器人，也不是自动投顾。它的本质是一个证据机器：

1. 把赵哥语料、市场数据、新闻公告和规则包转成结构化证据。
2. 把证据转成 `observe`、`waiting_trigger`、`triggered`、`invalidated` 等可审计 signal 状态。
3. 把新市场规律转成 `RuleCandidate`，通过简版回测和人工审批进入规则库候选区。
4. 明确拒绝自动实盘下单、绕过审批、自动扩大高风险工具权限。

本计划只覆盖 `apps/trader-agent/backend/`。Web Cockpit 属于同一子项目的 `apps/trader-agent/cockpit/`，但不在本计划实现。

## Non-Goals

- 不实现真实券商交易、自动下单或仓位执行。
- 不实现 PostgreSQL、Redis、远程 Tool Gateway、MCP 高风险工具。
- 不实现大规模向量检索和多用户权限系统。
- 不把 LLM Brain 放在 deterministic service 之前。
- 不把候选规则自动写入 active RulePack。
- 不把固定 RulePack 当作 SQLite 的主存储；规则文件才是第一版 source of truth。

## Implementation Path Decision

实现路径采用新的独立子项目 `apps/trader-agent/`，原因是 trader-agent 已经不是旧 research console 的功能扩展，而是一个新的产品系统。后端、前端 cockpit 和共享契约必须在同一产品子项目下管理。

本计划的 canonical backend entrypoint 是 `apps/trader-agent/backend/app/main.py`。

`apps/research-console/` 只作为迁移素材和参考实现，不承载新的 trader-agent 开发。

## Target File Tree

```text
apps/trader-agent/
  README.md
  package.json
  backend/
    README.md
    pyproject.toml
    app/
      __init__.py
      main.py
      api/
        __init__.py
        routes.py
        schemas.py
      core/
        __init__.py
        cache.py
        config.py
        events.py
        time.py
      db/
        __init__.py
        migrations.py
        models.py
        session.py
      modules/
        __init__.py
        corpus.py
        semantic_extraction.py
        ticker_alias.py
        market_context.py
        outcome_labeling.py
        playbook.py
        market_snapshot.py
        setup_detection.py
        rule_engine.py
        scoring.py
        risk.py
        signal_manager.py
        runtime_orchestrator.py
        rule_discovery.py
        explanation.py
        knowledge_source_registry.py
        document_indexer.py
        local_search.py
        model_gateway.py
      rulepack/
        __init__.py
        loader.py
      tools/
        __init__.py
        local_adapter.py
        sec_adapter.py
        yfinance_adapter.py
        longbridge_adapter.py
        news_archive_adapter.py
    tests/
      conftest.py
      fixtures/
        market_bars_spy.csv
        market_bars_tsla.csv
        market_bars_coin.csv
        market_bars_nvda.csv
        market_calendar_us.csv
        trader_messages.jsonl
        news_events.jsonl
        filing_events.jsonl
      test_health.py
      test_rulepack_loader.py
      test_local_tool_adapter.py
      test_signal_pipeline.py
      test_rule_discovery_lite_backtest.py
  cockpit/
    README.md
  shared/
    README.md
    fixtures/
      market_bars_spy.csv
      market_bars_tsla.csv
      market_bars_coin.csv
      market_bars_nvda.csv
      market_calendar_us.csv
      news_events.jsonl
      filing_events.jsonl
    rulepacks/
      v0_1_0.yaml
    schemas/
```

## Local Data Layout

The backend uses files for human-authored or append-only raw material, and SQLite for queryable runtime state:

```text
data/trader-agent/
  trader-agent.db
  raw/
    trader_messages.jsonl
    x_posts.jsonl
    news_events.jsonl
    filing_events.jsonl
  fixtures/                  # optional local overrides for Settings.fixture_data_dir
  audit/
    agent_events.jsonl
```

Storage rule:

- RulePack: canonical storage is `apps/trader-agent/shared/rulepacks/v0_1_0.yaml`.
- Raw trader messages: canonical storage can be JSONL; parsed semantic events are indexed in SQLite.
- Versioned market/calendar/news/filing seed fixtures live in `apps/trader-agent/shared/fixtures/`; local overrides may use `data/trader-agent/fixtures/` via `Settings.fixture_data_dir`.
- Agent runtime state: SQLite.
- Agent audit: SQLite `agent_events` is required; `data/trader-agent/audit/agent_events.jsonl` is an optional mirror for human inspection.

## Shared Runtime Contracts

| Contract | Phase 1 implementation | Later extension |
|---|---|---|
| Storage | Files for rules/raw inputs; SQLite for runtime state | PostgreSQL for runtime state only when needed |
| Cache | Process-local TTL cache | Redis |
| Events | `agent_events` table plus optional JSONL audit mirror | Event bus or WebSocket stream |
| Tools | `LocalToolAdapter` | Tool Gateway / MCP adapter |
| RulePack | YAML file loaded at startup as source of truth | Versioned DB-backed RulePack after approval workflow matures |
| Scheduler | Manual API trigger and single-process scan loop | Worker queue |
| Approval | Stored approval request records | Cockpit approval workflow |

## Public API Minimum

The implementation keeps canonical public paths compatible with `01-agent-core-backend-prd.md`. Do not create alternate aliases such as `/agent/runtime/scan` for PRD-defined APIs.

```text
GET  /health
GET  /api/agent/status
POST /api/corpus/import
POST /api/market/snapshot/refresh
POST /api/setups/detect
POST /api/rules/evaluate
GET  /api/signals
POST /api/signals
GET  /api/signals/{id}
PATCH /api/signals/{id}
POST /api/rule-candidates
POST /api/rule-candidates/{id}/lite-backtest
POST /api/rule-candidates/{id}/submit-approval
POST /api/agent/run-scan
POST /api/agent/run-symbol/{symbol}
GET  /api/agent/runs
GET  /api/agent/runs/{id}
GET  /api/agent/events
```

`GET /api/agent/status` and `GET /api/agent/events` are Phase 0 operational extensions. Every mutating endpoint writes `agent_events`.

## SQLite Runtime Data Model Minimum

Implement these SQLite-compatible runtime tables first. Field definitions must come from `03-shared-platform-roadmap-prd.md` Part 5 where that document defines a concrete table schema, then apply this plan's SQLite type mapping.

```text
trader_raw_messages
trader_semantic_events
market_context_snapshots
event_outcomes
playbooks
signals
trade_tickets
agent_messages
agent_events
agent_tasks
agent_rules
agent_capabilities
approval_requests
human_feedback
rule_candidates
rule_candidate_evidence_requirements
lite_backtest_reports
rule_proposals
rule_versions
```

Do not invent fields for logical table names that are listed in `03-shared-platform-roadmap-prd.md` section 3.2 but not defined in Part 5. For Phase 0, `playbook_examples`, `signal_outcomes`, `tool_call_logs`, `agent_runs`, `learning_summaries`, and `failure_cases` remain deferred until their fields are explicitly specified.

`agent_rules` is not the canonical fixed-rule store in Phase 1. It stores loaded RulePack metadata, rule hashes, active version references, and audit linkage so that signals can explain which rule version was evaluated. The canonical fixed rules remain in YAML.

SQLite field mapping:

| Logical type | SQLite type |
|---|---|
| UUID | TEXT |
| TIMESTAMPTZ | TEXT ISO-8601 |
| JSONB | TEXT JSON |
| ENUM | TEXT with application validation |
| VECTOR | TEXT JSON array only when needed |

## Phase 0: Backend Foundation

- [ ] Create `apps/trader-agent/package.json` as the monorepo workspace package entry for backend and future cockpit scripts.
- [ ] Create `apps/trader-agent/backend/pyproject.toml` with package metadata, runtime dependencies, `[project.optional-dependencies].dev`, pytest config, and ruff config. Runtime deps include FastAPI, Pydantic, SQLAlchemy, uvicorn, pandas, pandas-market-calendars, and yfinance. Dev deps include pytest and ruff.
- [ ] Create `apps/trader-agent/backend/app/main.py` with FastAPI app factory and `/health`.
- [ ] Create `app/core/config.py` with local data dir, universe, RulePack path, market timezone, and tool capability flags.
- [ ] Create local data directory bootstrap for `data/trader-agent/raw`, `data/trader-agent/fixtures`, and `data/trader-agent/audit`.
- [ ] Create `app/db/session.py` with SQLite engine and session dependency.
- [ ] Create `app/db/models.py` with the Phase 0 runtime tables listed above, using `03-shared-platform-roadmap-prd.md` Part 5 as the schema source.
- [ ] Create `app/db/migrations.py` with idempotent local schema bootstrap.
- [ ] Create `app/core/events.py` with `record_agent_event(...)`.
- [ ] Make `record_agent_event(...)` write SQLite first and optionally mirror to `data/trader-agent/audit/agent_events.jsonl`.
- [ ] Create `app/core/cache.py` with process-local TTL cache abstraction.
- [ ] Create `backend/app/rulepack/loader.py` and `shared/rulepacks/v0_1_0.yaml`.
- [ ] Add `tests/test_health.py`, `tests/test_rulepack_loader.py`, `tests/test_db_bootstrap.py`, and `tests/test_agent_events.py`.

Commands:

```powershell
py -3.11 -m venv .venv
.venv\Scripts\python.exe -m pip install -e "apps/trader-agent/backend[dev]"
.venv\Scripts\python.exe -m pytest apps/trader-agent/backend/tests/test_health.py -q
.venv\Scripts\python.exe -m pytest apps/trader-agent/backend/tests/test_rulepack_loader.py -q
.venv\Scripts\python.exe -m pytest apps/trader-agent/backend/tests/test_db_bootstrap.py -q
.venv\Scripts\python.exe -m pytest apps/trader-agent/backend/tests/test_agent_events.py -q
```

All commands run from the repository root.

Expected result:

```text
4 focused test files pass
```

Phase 0 test expectations:

- `/health` returns ok.
- RulePack YAML loads and validates version, universe, and at least one active rule.
- A clean data dir bootstraps SQLite and creates every Phase 0 runtime table.
- `record_agent_event(...)` writes SQLite first.
- JSONL audit mirror can be disabled or enabled deterministically.

## Phase 1A: Knowledge Ingestion Chain

- [ ] Implement `modules/corpus.py` for `trader_raw_messages` ingestion from JSONL or API body; keep raw JSONL as source material and store parsed/indexed records in SQLite.
- [ ] Implement `modules/ticker_alias.py` with fixed universe as default and optional discovery marked `requires_approval`.
- [ ] Implement `modules/semantic_extraction.py` to extract rule mentions, ticker mentions, trigger conditions, invalidation conditions, and source confidence.
- [ ] Implement `modules/market_context.py` to bind semantic events to price/news context.
- [ ] Implement `modules/outcome_labeling.py` to attach future outcome labels from fixture or local market data.
- [ ] Implement `modules/playbook.py` to aggregate repeated trader patterns into playbook candidates.
- [ ] Add corpus fixture tests using `tests/fixtures/trader_messages.jsonl`.

Acceptance:

- A Zhao-style rule mention such as "减持后等三天" becomes a semantic event with source, ticker context, trigger, waiting condition, and invalidation note.
- Raw message storage remains readable as JSONL; SQLite stores normalized records for lookup and joins.
- Unknown tickers outside fixed universe are not silently added to active universe.
- Every ingestion batch writes `agent_events`.

## Phase 1B: Local Tool Adapter

- [x] Implement `tools/local_adapter.py` with one stable interface for market bars, market calendar, news events, and filing events.
- [x] Support fixture-backed reads before live provider calls.
- [x] Gate live provider usage behind config capability flags.
- [x] Return normalized evidence objects with provider, timestamp, symbol, payload, and cost category.
- [x] Add tests that prove missing capability blocks the call.

Acceptance:

- Historical bar lookup works from `market_bars_spy.csv`.
- News and filing lookups work from JSONL fixtures.
- No module imports provider SDKs directly; all calls route through `LocalToolAdapter`.

## Phase 1C: Deterministic Signal Pipeline

- [x] Implement `modules/market_snapshot.py` using `LocalToolAdapter`.
- [x] Implement `modules/setup_detection.py` for deterministic setups: gap fill, volume contraction after sharp drop, BTC move alert, post-reduction wait window, Friday options risk pattern.
- [ ] Implement `modules/rule_engine.py` to evaluate active RulePack rules.
- [ ] Implement `modules/scoring.py` with transparent score components: setup strength, evidence quality, catalyst risk, liquidity, historical hit rate.
- [ ] Implement `modules/risk.py` with veto priority over score and ticket generation.
- [ ] Implement `modules/signal_manager.py` with legal states: `observe`, `waiting_trigger`, `triggered`, `ticket_ready`, `waiting_approval`, `rejected`, `review`, `completed`, `invalidated`.
- [x] Add `tests/test_signal_pipeline.py` for Phase 1C-1 market snapshot and setup detection coverage.
- [ ] Extend `tests/test_signal_pipeline.py` for rule engine, scoring, risk, and signal manager coverage.

Acceptance:

- A sharp drop plus volume contraction can produce `waiting_trigger`, not a buy order.
- A blocked risk rule produces `invalidated` with reason.
- Signal output includes evidence IDs, rule hits, score breakdown, risk decision, and next trigger condition.

## Phase 1D: Runtime Orchestration

- [x] Implement `modules/runtime_orchestrator.py` for manual `POST /api/agent/run-scan`.
- [x] Wire Phase 1D scan flow: market snapshot -> setup detection -> run summary -> agent_events.
- [x] Add `GET /api/agent/status` with storage health, RulePack version, universe size, enabled capabilities, and last scan time.
- [x] Add `GET /api/agent/events` with filters for module, symbol, event type, status, run_id, time range, and bounded limit.
- [x] Add `POST /api/agent/run-symbol/{symbol}`, `GET /api/agent/runs`, and `GET /api/agent/runs/{id}` backed by `agent_events`.
- [x] Add runtime test using fixture SPY data.

Acceptance:

- A scan can run end-to-end with fixtures and create deterministic setup candidates.
- Runtime never calls a live provider unless explicitly enabled.
- Every step records traceable `agent_events`.
- Rule Engine, Scoring Engine, Risk Engine, and Signal Manager remain Phase 1C/1D follow-up work and are not implemented by Runtime Orchestrator.

## Phase 1.5: Rule Discovery And Lite Backtest

- [ ] Implement `modules/rule_discovery.py` with `RuleCandidate` creation from semantic events, anomaly observations, or manual API input.
- [ ] Implement evidence requirement validation against `LocalToolAdapter` capabilities.
- [ ] Implement lite backtest with explicit sample window, no future leakage, entry condition, exit condition, invalidation condition, and cost assumptions.
- [ ] Store report in `lite_backtest_reports`.
- [ ] Advance proposal state only through the approved state machine: `draft -> evidence_required -> backtest_pending -> backtested -> needs_more_data/rejected/pending_shadow_tracking/pending_manual_approval`.
- [ ] Add `tests/test_rule_discovery_lite_backtest.py`.

Acceptance:

- A candidate rule cannot reach shadow tracking without a lite backtest report.
- A candidate with missing historical data capability is blocked with a specific evidence gap.
- Backtest report includes sample size, hit rate, average return, max adverse excursion, failure cases, and recommendation.
- No rule is written into active RulePack without manual approval.

## Phase 1.6: Explanation Service

- [ ] Implement `modules/explanation.py` for signal explanations from persisted evidence only.
- [ ] Add `GET /signals/{signal_id}/explanation`.
- [ ] Include status, reason, trigger, invalidation, evidence timeline, rule hits, risk blocks, and next human decision point.
- [ ] Block explanations that invent missing evidence.

Acceptance:

- Explanation for `waiting_trigger` clearly says what must happen before action consideration.
- Explanation for `invalidated` clearly says which condition failed.
- Explanation does not contain direct execution language such as automatic buy or automatic sell.

## Phase 1.7: Local Knowledge And Lightweight RAG

This phase implements the practical subset of `04-ai-rag-mcp-platform-roadmap-prd.md`: local-first knowledge retrieval without vector DB, SaaS, or agent framework dependency.

- [ ] Implement `modules/knowledge_source_registry.py` to register local source roots: `docs/summaries/**/*.md`, `data/trader-agent/raw/trader_messages.jsonl`, `data/trader-agent/raw/x_posts.jsonl`, `data/trader-agent/raw/news_events.jsonl`, and `data/trader-agent/raw/filing_events.jsonl`.
- [ ] Implement `modules/document_indexer.py` to parse Markdown and JSONL sources into normalized chunks with source path, source type, symbol hints, timestamp hints, confidence, and raw text.
- [ ] Implement `modules/local_search.py` with SQLite FTS5 keyword search and filters for symbol, source type, date range, and rule keyword.
- [ ] Add idempotent index bootstrap tables for document chunks and FTS rows.
- [ ] Add `POST /api/knowledge/reindex` for manual reindex only.
- [ ] Add `GET /api/knowledge/search` with bounded result count and evidence IDs.
- [ ] Add tests using at least one `docs/summaries` fixture and one JSONL fixture.

Acceptance:

- Zhao-style historical summaries can be searched by ticker, rule phrase, and date range.
- Search returns source path, snippet, source type, evidence ID, confidence, and timestamp when available.
- X posts are indexed only when present in local `x_posts.jsonl`; public web scraping is not part of this phase.
- Search results may support explanation and rule discovery, but cannot alone trigger a signal state change.
- The phase passes without LlamaIndex, Chroma, Qdrant, Milvus, Pinecone, LangChain, or LangGraph dependencies.

## Phase 1.8: ModelGateway

This phase introduces AI model participation as a structured, auditable helper. It must not replace deterministic setup detection, rule evaluation, risk veto, or signal lifecycle decisions.

- [ ] Implement `modules/model_gateway.py` with `generate_structured(...)`.
- [ ] Add model profiles: `local_light`, `codex_cli`, and `deepseek_api`.
- [ ] Keep `deepseek_api` disabled by default and gated by explicit config.
- [ ] Require every model call to declare `task_type`, `schema`, `model_profile`, `evidence_ids`, and `cost_policy`.
- [ ] Validate model outputs through Pydantic schemas before returning them to business modules.
- [ ] Record `agent_events` for each remote model call, schema validation failure, and disabled-capability rejection.
- [ ] Add tests for disabled DeepSeek rejection, schema validation failure, and successful local stub generation.

Acceptance:

- A disabled DeepSeek profile cannot be called accidentally.
- Remote model calls include source evidence IDs and do not accept untracked raw prompts.
- Model output cannot enter `signals`, `rule_candidates`, or `lite_backtest_reports` unless schema validation succeeds.
- Model text may explain evidence, classify events, or draft rule candidates, but cannot create execution instructions.

## Phase 1.9: External Evidence Adapters

This phase expands `LocalToolAdapter` with manually enabled read-only evidence sources. It does not add broker execution or simulation account actions.

- [ ] Implement `tools/sec_adapter.py` for SEC / EDGAR-style filing evidence lookup.
- [ ] Implement `tools/news_archive_adapter.py` for local news archive lookup.
- [ ] Add optional `tools/yfinance_adapter.py` behind a capability flag for US equity market data.
- [ ] Add optional `tools/longbridge_adapter.py` behind a capability flag for market data only.
- [ ] Add optional Alpha Vantage adapter only if a free/manual-key path is configured; otherwise keep it documented as deferred.
- [ ] Normalize every provider response into the shared evidence object shape from `04-ai-rag-mcp-platform-roadmap-prd.md`.
- [ ] Add provider-level limitations, freshness, and cost category fields.
- [ ] Add tests that prove business modules cannot import provider SDKs directly.

Acceptance:

- Filing evidence can validate earnings, reduction, major holding, litigation, or corporate-action contexts.
- News archive evidence can classify macro, earnings, filing, geopolitical, sector, company-specific, options-market, and crypto-beta events.
- Live provider usage stays disabled unless explicitly enabled.
- Longbridge simulation account capability remains backlog and is not exposed by this phase.
- AkShare is not added as a default dependency for US stock MVP.

## Phase 2A: Tool Registry And Read-Only MCP Preparation

This phase prepares tool governance. It does not require a remote MCP server yet.

- [ ] Implement `ToolRegistry` metadata for read-only tools, required capabilities, cost policy, and allowed input scope.
- [ ] Implement `ToolPermissionPolicy` with explicit allow/deny results and denial reasons.
- [ ] Implement `ToolCallAudit` records through `agent_events`.
- [ ] Mark read-only MCP-compatible tools as candidates: local file search, local knowledge search, market data lookup, filing lookup, and news archive lookup.
- [ ] Explicitly deny tools that modify RulePack active state, expand active universe, invoke unapproved remote services, or touch broker execution.

Acceptance:

- Every tool call can be explained by capability, permission, provider, evidence ID, and audit event.
- Read-only MCP integration has a clear contract but is not required for Phase 1 completion.
- No write-capable MCP or broker-action tool is exposed.

## Phase 2 Deferral Boundary

These capabilities are intentionally deferred until the local deterministic pipeline is stable:

- Trader Brain, Market Brain, and Opportunity Brain as LLM composition layers.
- WebSocket/SSE stream to Web Cockpit.
- Remote Tool Gateway and MCP adapter beyond read-only preparation.
- PostgreSQL and Redis migration.
- Real approval UI integration.
- Trade ticket drafting beyond stored conditional notes.
- Longbridge simulation account integration.
- Vector DB, LlamaIndex, LangGraph, or Backtrader adapters unless the upgrade triggers in `04-ai-rag-mcp-platform-roadmap-prd.md` are met.

The reason is simple: if deterministic evidence, rules, risk veto, and signal lifecycle are unstable, adding Brain and remote tools only increases ambiguity and debugging cost.

## Verification Commands

Run after each phase:

```powershell
.venv\Scripts\python.exe -m pytest apps/trader-agent/backend/tests -q
pnpm run docs:build
```

Run before claiming implementation complete:

```powershell
rg -n "自动下单|直接买入|直接卖出|绕过审批|guaranteed profit|risk-free" apps/trader-agent
```

Manual review / allowed documentation matches:

- Target docs may contain boundary statements such as "不实现真实券商交易、自动下单或仓位执行" and "拒绝自动实盘下单、绕过审批、自动扩大高风险工具权限".
- Review documentation matches manually for boundary framing; do not use docs matches as a no-match verification gate.

Expected result:

```text
No forbidden execution-boundary wording in implementation code.
All backend tests pass.
VitePress build exits with code 0.
```

## Development Order For Agentic Workers

1. Complete Phase 0 and stop for review.
2. Complete Phase 1A and stop for review.
3. Complete Phase 1B and stop for review.
4. Complete Phase 1C and stop for review.
5. Complete Phase 1D and stop for review.
6. Complete Phase 1.5 and stop for review.
7. Complete Phase 1.6 and stop for review.
8. Complete Phase 1.7 and stop for review.
9. Complete Phase 1.8 and stop for review.
10. Complete Phase 1.9 and stop for review.
11. Complete Phase 2A only after Phase 1 evidence, model, and adapter boundaries are stable.

Each review must include:

- Files changed.
- Tests run and exact result.
- Any deviation from this plan.
- Open risks that block the next phase.

## Definition Of Done

- Backend starts locally with `/health` returning ok.
- SQLite schema bootstraps from a clean local data dir.
- Fixed universe is enforced.
- Fixture scan creates auditable signals.
- Signal statuses use observe, waiting trigger, triggered, and invalidated correctly.
- Rule candidate can be created and lite-backtested.
- Rule candidate cannot become active without manual approval.
- Local knowledge search can retrieve `docs/summaries` evidence by symbol, date, and rule phrase.
- ModelGateway can run with local/stub profile and rejects disabled DeepSeek calls.
- External live data providers remain capability-gated.
- Every state mutation writes `agent_events`.
- Documentation build passes.
- No trading execution path exists.
