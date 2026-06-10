# Market Agent MVP v0

Status: in_progress

Source of truth:

- `project-docs/market-agent/00_README.md`
- `project-docs/market-agent/04_database_schema.md`
- `project-docs/market-agent/11_api_and_cli_spec.md`
- `project-docs/market-agent/12_development_phases.md`
- `project-docs/market-agent/13_acceptance_tests.md`
- `UBIQUITOUS_LANGUAGE.md`

## Goal

Implement the Market Agent MVP as a local, durable research workflow that records
market facts, deterministic features, setup detections, structured decisions,
outcomes, pattern memory, failure memory, and startup context packs.

The implementation must reuse current Stage 1 workflow and backend contracts
instead of rebuilding completed graphs.

## Confirmed Decisions

| Ref | Decision |
|---|---|
| D701 | Add only five new physical tables: `feature_snapshots`, `setup_events`, `pattern_memories`, `failure_memories`, `session_context_packs`. |
| D702 | `market_snapshots`, `decision_memories`, and `outcome_memories` are concept names only. They map to existing `market_bars`, `model_decisions`, and `decision_outcomes` plus `insight_candidate_outcomes`. |
| D703 | CLI work extends `apps/trader-workflows` through `npm run workflows -- <command>`. Do not add a top-level `trader` CLI. |
| D704 | Reuse existing `DecisionEnvelope`, `OutcomeGraph`, `EvaluationGraph`, and `InsightExplorationGraph`; this task only adapts mapping, command surfaces, and tests. |
| D705 | Market Agent MVP is not an execution system. It must not create `OrderIntent`, broker/account behavior, positions, PnL, live trading, or a new custom UI. |
| D706 | Backend APIs stay under the existing `/api/intel` FastAPI router. |

## Task Map

| Task | Scope | Status |
|---|---|---|
| T021 | Memory Schema & Repository | pending |
| T022 | MarketDataService & DataQualityGate | pending |
| T023 | FeatureEngine & SetupDetector | pending |
| T024 | MarketMonitor Workflow | pending |
| T025 | Outcome/Evaluation/Insight Adapter | pending |
| T026 | Pattern/Failure Memory + SessionContextBootstrap | pending |
| T027 | CLI/API & E2E Acceptance | pending |

## Shared Boundaries

Allowed implementation roots:

```text
apps/trader-agent/backend/app/intel/**
apps/trader-agent/backend/tests/test_market_agent_*.py
apps/trader-workflows/src/**
apps/trader-workflows/README.md
apps/trader-workflows/README.zh-CN.md
```

Allowed planning roots:

```text
.agent-dev/specs/market-agent-mvp-v0/**
.agent-dev/tasks/T021-*.md
.agent-dev/tasks/T021-*.json
.agent-dev/tasks/T022-*.md
.agent-dev/tasks/T022-*.json
.agent-dev/tasks/T023-*.md
.agent-dev/tasks/T023-*.json
.agent-dev/tasks/T024-*.md
.agent-dev/tasks/T024-*.json
.agent-dev/tasks/T025-*.md
.agent-dev/tasks/T025-*.json
.agent-dev/tasks/T026-*.md
.agent-dev/tasks/T026-*.json
.agent-dev/tasks/T027-*.md
.agent-dev/tasks/T027-*.json
.agent-dev/tasks/README.md
```

Forbidden:

```text
.deepseek/**
.obsidian/**
apps/research-console/**
apps/trader-cockpit/**
apps/trader-cli/**
project-docs/archive/**
data/**
.github/**
```

## Verification Baseline

Use scoped verification first, then broaden only when the task requires it:

```text
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_market_agent_*.py -v --tb=short
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_intel_stage1_schema_api.py apps/trader-agent/backend/tests/test_intel_phase0_schema.py -v --tb=short
npm --prefix apps/trader-workflows test
git diff --check
```

`node --test test/docs-ai-context.test.mjs` currently has a known unrelated
T016 status assertion failure and is not a Market Agent blocker unless the
Market Agent task edits docs routing.
