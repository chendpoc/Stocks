# Module Map

Private coarse module guide. Use this only after `spec.scope`, the current task
step, or a review target has narrowed the work. This file points to first reads;
it does not replace source files, tests, or codegraph.

| Module | Role | Allowed first reads | Codegraph starting point | Default avoid | Verification |
|---|---|---|---|---|---|
| `apps/trader-agent/backend` | FastAPI backend, intel APIs, SQLite persistence | `app/main.py`, scoped `app/intel/**`, matching backend tests | `apps/trader-agent/backend app.main or target symbol` | Old `app/modules/**`, runtime DB files, unrelated schemas | `.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/<file>.py -v --tb=short` |
| `apps/trader-workflows` | Stage 1 workflow runtime and LangGraph graphs | `src/index.ts`, scoped `src/runtime/**` or `src/graphs/**`, matching tests | `stage1Runtime or changed graph symbol` | Backend schema/API edits, direct TUI code, old-table writes | `cd apps/trader-workflows && npm test` |
| `apps/trader-cli` | Commander CLI and Ink TUI wrapper | `src/index.ts`, scoped `src/commands/**`, `src/tui/**`, matching tests | `CLI command or TUI component symbol` | Importing workflow source internals, backend persistence logic | `cd apps/trader-cli && npm test` |
| `apps/trader-chart` | Rust ratatui chart UI | `src/main.rs`, scoped `src/app.rs`, matching Rust modules | `trader-chart app state or changed function` | Backend API changes, CLI command rewrites | `cargo test -p trader-chart` |
| `apps/trader-cockpit` | Next.js cockpit | route/component paths named by the cockpit spec | `cockpit route or component symbol` | Research console edits, public VitePress paths | `npm run trader-cockpit:lint` then `npm run trader-cockpit:build` |
| `apps/research-console` | Legacy research console and migration reference | exact files named by a legacy migration route/spec | `ResearchWorkspace or scoped legacy symbol` | Treating it as the new cockpit target | `npm run console:lint`, `npm run console:build` |
| `packages/summary-core` | Shared TypeScript summary utilities | scoped package source and matching tests | `summary-core exported symbol` | Public site routing or private agent docs | `npm run test:summary` |
| `scripts` | Node automation for summaries, release, audits, docs site | exact `*.mjs` named by task scope | `script function or command entry` | Public-site scripts during private context cleanup | task-specific script test plus `git diff --check` |

## High-Risk Paths

| Path | Default rule |
|---|---|
| `docs/.vitepress/**` | Avoid unless the selected route explicitly targets public-site behavior. |
| `docs/summaries/**`, `docs/opportunities/**`, `docs/trading-experiences/**` | Runtime corpus; avoid outside `corpus_research`. |
| `project-docs/research-agent/modules/**` | Historical plans; avoid outside `legacy_migration`. |
| `.agent-dev/*-worker-prompt.md` | Read only when executing or reviewing that worker task. |
| `.agent-dev/reviews/**` | Read only when reviewing that review artifact. |
