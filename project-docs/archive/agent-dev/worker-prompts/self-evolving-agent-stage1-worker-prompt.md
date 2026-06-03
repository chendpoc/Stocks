# Worker Prompt: T006 Self-Evolving Agent Stage 1

> **S8 状态**：`code_map.md` / `CLAUDE.md` 已写入三应用边界与 CLI smoke；V208 见 spec.json（`runs list` 可离线，`decide` 需后端+LLM）。

You are implementing T006 for `D:\workspace\01-products\stock-community-summary`.

## Source of Truth

Read first:

1. `.agent-dev/specs/self-evolving-agent-stage1/spec.json`
2. `.agent-dev/specs/self-evolving-agent-stage1/spec.md`
3. `.agent-dev/specs/self-evolving-agent-stage1/decision-record.json`
4. `.agent-dev/tasks/T006.json`
5. `.agent-dev/tasks/T006-slices/README.md`
6. `project-docs/adr/0001-langgraph-minimal-stage1.md`
7. `CONTEXT.md`
8. `.agent-dev/context/code_map.md`
9. `project-docs/research-reports/deep-research-report.md`

Do not implement from `.agent-dev/specs/model-decision-store/` or `.agent-dev/model-decision-store-worker-prompt.md`; they are superseded provenance only.

## Goal

Implement the minimum durable Stage 1 loop:

```text
Raw Evidence
-> WeightedContextItem
-> immutable ContextSnapshot
-> DecisionGraph
-> model_decisions
-> OutcomeGraph
-> decision_outcomes
-> EvaluationGraph
-> promotion recommendation
```

Also implement `InsightExplorationGraph v0` for controlled ReAct exploration that persists only `InsightCandidate`.

## Required Scope

Runtime:

- Add new in-repo app `apps/trader-workflows`.
- Add minimal LangGraph runtime under `apps/trader-workflows/src/`.
- Keep LangGraph checkpoint store separate from `market_intel.db`.
- Add CLI run inspection commands as thin wrappers for `runs list/show/resume`.
- Add workflow command entry `apps/trader-workflows/src/index.ts`.
- Add checkpoint helper `apps/trader-workflows/src/runtime/checkpointStore.ts`.
- Use `@langchain/langgraph` as the graph runtime package and `better-sqlite3` for the local SQLite checkpoint/run-store facade.

Backend domain facts:

- Add Stage 1 tables to `apps/trader-agent/backend/app/intel/db/schema.py`.
- Add Stage 1 API route file if needed.
- Mount route in `apps/trader-agent/backend/app/intel/api/__init__.py`.
- Add pytest coverage.

CLI/services:

- Add workflow-side services for context snapshots, decisions, outcomes, evaluation reports, and insight candidates under `apps/trader-workflows/src/services/`.
- Add `DecisionGraph`, `OutcomeGraph`, `EvaluationGraph`, and `InsightExplorationGraph` tests under `apps/trader-workflows/src/`.
- Keep `apps/trader-cli` as command wrappers only; do not implement graph runtime in `apps/trader-cli`.
- Add CLI commands:
  - `trader decide SYMBOL`
  - `trader outcomes run --due`
  - `trader eval summary`
  - `trader insights explore`
  - `trader runs list/show`

Docs:

- Update `.agent-dev/context/code_map.md` and `CLAUDE.md` with concise Stage 1 pointers.
- Update `apps/trader-cli/package.json` test script only if explicit file lists require it.

## Frozen Implementation Contracts

CLI/workflow:

- `apps/trader-workflows/package.json` must expose script `workflows: "tsx src/index.ts"`.
- Root must expose `trader-workflows` as `npm --prefix apps/trader-workflows run workflows --`.
- `apps/trader-cli` wrappers spawn `npm --prefix apps/trader-workflows run workflows -- <command> --json`.
- `apps/trader-cli` must not import `apps/trader-workflows/src/**`.
- Workflow output is a JSON envelope with `ok`, `command`, `run_id`, `status`, `data`, and `error`.

Checkpoint:

- Default checkpoint DB: `data/trader-workflows/checkpoints.sqlite`.
- Override env: `TRADER_WORKFLOWS_CHECKPOINT_DB`.
- `apps/trader-workflows/src/runtime/checkpointStore.ts` exports `Stage1CheckpointStore`, a project-owned SQLite checkpoint/run-store facade.
- Graph code depends on `Stage1CheckpointStore`, not raw SQLite.
- Tests must use a temporary checkpoint DB.
- No checkpoint/run metadata is written to `market_intel.db`.

Backend API:

- Stage 1 routes live under `/api/intel/stage1`.
- Create endpoints must be idempotent for same id + same payload.
- Same id + different immutable payload must return `409`.
- Original `DecisionEnvelope` and historical `ContextSnapshot` records are immutable.
- `human_overrides_json` is append-only and must not replace `decision_json`.
- DecisionGraph pre-creates `decision_outcomes` pending rows for every `decision_id + horizon + path`.
- OutcomeGraph reads due pending rows and finalizes each row exactly once to `labeled`, `skipped`, or `failed`.

LLM/provider:

- Add `apps/trader-workflows/src/llm/provider.ts`.
- It may reuse env names from the CLI provider.
- Do not import `apps/trader-cli/src/llm/provider.ts`.

## Hard Boundaries

Do not implement:

- self-built TUI pages
- paper order submit/query/cancel
- Broker Mirror / Reconciler
- automatic model promotion or model switching
- automatic model training
- full Model Registry
- full multimodal intelligence schema
- rewriting historical ContextSnapshot weights
- LLM-only promotion from InsightCandidate to AcceptedLesson
- legacy hypotheses/predictions dual-write
- Web Cockpit changes
- trader-chart changes

## Domain Rules

- `DecisionEnvelope` is immutable.
- `HumanOverride` may supersede action downstream, but evaluation must keep `model_path` and `override_path` separate.
- `ContextSnapshot` is immutable.
- Outcome horizons are `30m`, `1h`, `EOD`, `1d`, `3d`.
- Outcome labels use absolute return, benchmark-relative return, invalidation proxy, and target proxy.
- `PAPER_*_CANDIDATE` actions are allowed but must not submit paper orders in Stage 1.
- `InsightExplorationGraph v0` can write `InsightCandidate` only.

## Verification

Run the verification commands defined in `.agent-dev/specs/self-evolving-agent-stage1/spec.json`.

At minimum:

```text
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_intel_stage1_schema_api.py -v --tb=short
cd apps/trader-workflows && npm test
cd apps/trader-cli && npm test
manual: npm run trader-cli -- runs list --json
manual: npm run trader-cli -- decide TSLA.US --json
manual: npm run trader-cli -- runs show <RUN_ID_FROM_DECIDE> --json
manual: npm run trader-cli -- outcomes run --due --json
manual: npm run trader-cli -- eval summary --json
manual: npm run trader-cli -- insights explore --symbol TSLA.US --window 30d --json
manual: review diff does not touch forbidden or non-goal modules
```

For slice execution, read the matching file under `.agent-dev/tasks/T006-slices/` and implement only that slice unless the orchestrator explicitly asks for multiple slices.

## Handoff

Return:

- files changed
- verification commands and results
- any known gaps
- confirmation that no self-built TUI, paper execution, broker mirror, automatic promotion, automatic training, or legacy hypotheses/predictions dual-write was added
