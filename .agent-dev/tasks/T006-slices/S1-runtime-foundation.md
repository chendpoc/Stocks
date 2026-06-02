# S1 Runtime Foundation

## Goal

Create `apps/trader-workflows` as the in-repo LangGraph runtime app. This slice only establishes durable workflow infrastructure; it does not implement DecisionGraph, OutcomeGraph, EvaluationGraph, or InsightExplorationGraph behavior.

## Scope

- Create `apps/trader-workflows/package.json`.
- Add `apps/trader-workflows/src/index.ts` as the workflow app command entry.
- Add `apps/trader-workflows/src/runtime/checkpointStore.ts`.
- Add `apps/trader-workflows/src/runtime/stage1Runtime.ts`.
- Add `apps/trader-workflows/src/runtime/stage1Runtime.test.ts`.
- Add `apps/trader-workflows/src/api/client.ts` for backend `/api/intel` access.
- Add thin CLI `runs list/show/resume` wrapper in `apps/trader-cli`.
- Add root/package scripts needed to run trader-workflows tests and commands.

## Frozen Contracts

- `apps/trader-workflows/package.json` uses package name `trader-workflows`, `type: "module"`, script `workflows: "tsx src/index.ts"`, and test script `tsx --test`.
- Root script must expose `npm run trader-workflows -- <command> --json`.
- `apps/trader-workflows/package.json` must include runtime dependencies `@langchain/langgraph` and `better-sqlite3`, plus dev dependency `@types/better-sqlite3`.
- CLI wrappers call `npm --prefix apps/trader-workflows run workflows -- <command> --json`; they do not import `apps/trader-workflows/src/**`.
- Workflow command output is always a JSON envelope with `ok`, `command`, `run_id`, `status`, `data`, and `error`.
- Checkpoint DB default is `data/trader-workflows/checkpoints.sqlite`; override via `TRADER_WORKFLOWS_CHECKPOINT_DB`.
- `apps/trader-workflows/src/runtime/checkpointStore.ts` exports `Stage1CheckpointStore`, a project-owned SQLite checkpoint/run-store facade used by graph code.
- Tests must use a temporary checkpoint DB and must prove no runtime state is written to `market_intel.db`.

## Exit Criteria

- A workflow run has a `run_id`, graph name, status, current node, checkpoint reference, and timestamps.
- Runtime state is stored in a LangGraph checkpoint store, not in `market_intel.db`.
- `trader runs list/show/resume` can inspect or resume runtime state through thin wrappers.
- `runs list/show/resume` pass through the workflow JSON envelope and non-zero exit codes.
- No domain tables are created in this slice.

## Verification

Run `V203` from `.agent-dev/specs/self-evolving-agent-stage1/spec.json`.

## Non-goals

- No DecisionGraph implementation.
- No outcome labels.
- No domain schema/API changes except CLI/runtime wiring required for run inspection.
- No TUI.
