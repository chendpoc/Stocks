# Code Map

Private code locator for implementation, debugging, and review. Do not read
this file during ordinary repo orientation. Start from `CLAUDE.md` and
`.agent-dev/context/ai-index.md`; read this file only when code paths are not
already obvious.

## How To Use

1. Confirm the route in `.agent-dev/context/ai-index.md`.
2. For implementation or review, read the relevant `.agent-dev/specs/**` and
   `.agent-dev/tasks/**` first when required.
3. Use this map to choose the code area.
4. Use codegraph for symbol, caller, callee, trace, or impact questions.
5. Read exact source files only after the area is narrowed.

## Application Boundaries

| Area | Role | Primary entry | Notes |
|---|---|---|---|
| `apps/trader-agent/backend` | FastAPI backend, intel APIs, SQLite persistence | `app/main.py` | Use `.venv/Scripts/python.exe` for tests. |
| `apps/trader-agent/backend/app/intel` | Forward Market Intelligence backend subsystem | `api/*`, `db/schema.py`, `context/selector.py` | Stage 1 API lives under `api/stage1.py`. |
| `apps/trader-workflows` | Stage 1 workflow runtime and LangGraph graphs | `src/index.ts`, `src/runtime/stage1Runtime.ts` | Independent npm package. CLI invokes it through npm, not source imports. |
| `apps/trader-cli` | Commander CLI and Ink TUI | `src/index.ts`, `src/commands/*`, `src/tui/*` | Wraps backend and workflows. |
| `apps/trader-chart` | Rust ratatui chart UI | `src/main.rs`, `src/app.rs` | Cargo workspace member. |
| `apps/trader-cockpit` | Next.js cockpit | route-specific files under `app/`, `components/`, `lib/` | Touch only when cockpit route/spec allows it. |
| `apps/research-console` | Legacy research console | `app/`, `components/`, `lib/` | Reference/migration source unless route/spec allows edits. |
| `packages/summary-core` | Shared TypeScript summary utilities | package source files | Used by summary/research-console flows. |
| `scripts` | Node automation for summaries, release, audit, docs site | `*.mjs` | Public-site scripts are out of scope for private context cleanup. |

## Stage 1 Split

| Package | Owns | Must not own |
|---|---|---|
| `trader-agent/backend` | Stage 1 persistence, HTTP contracts, conflict rules | LangGraph orchestration or LLM calls |
| `trader-workflows` | Graph orchestration, run registry, workflow CLI envelopes | Direct old-table writes or TUI |
| `trader-cli` | Human/script entrypoints and thin command wrapping | Importing workflow source internals |

## Common Code Entry Points

| Need | Start here |
|---|---|
| Backend route registration | `apps/trader-agent/backend/app/main.py` |
| Intel route behavior | `apps/trader-agent/backend/app/intel/api/` |
| Intel schema/persistence | `apps/trader-agent/backend/app/intel/db/schema.py` |
| Stage 1 API | `apps/trader-agent/backend/app/intel/api/stage1.py` |
| Workflow CLI | `apps/trader-workflows/src/index.ts` |
| Workflow runtime | `apps/trader-workflows/src/runtime/stage1Runtime.ts` |
| Decision graph | `apps/trader-workflows/src/graphs/decisionGraph.ts` |
| CLI command routing | `apps/trader-cli/src/index.ts` and `apps/trader-cli/src/commands/` |
| Ink TUI | `apps/trader-cli/src/tui/` |
| Longbridge CLI agent | `apps/trader-cli/src/llm/longbridgeTools.ts` and related services |
| Ratatui chart | `apps/trader-chart/src/` |

## Read-Only Or High-Risk Areas

| Path | Rule |
|---|---|
| `docs/.vitepress/**` | Do not touch for private AI context cleanup. |
| `docs/summaries/**`, `docs/opportunities/**`, `docs/trading-experiences/**` | Runtime corpus paths; do not move in private context work. |
| `project-docs/research-agent/**` | Keep paths stable in private context work. |
| `data/trader-agent/trader-agent.db` | Do not alter old DB schema. |
| `apps/trader-agent/backend/app/modules/document_indexer.py` and `local_search.py` | Old indexers; do not extend. |
| `apps/trader-cockpit/**` | Edit only when cockpit route/spec explicitly allows it. |
| `apps/research-console/**` | Legacy reference unless route/spec explicitly allows it. |

## Verification Commands

```bash
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/<file>.py -v --tb=short
cd apps/trader-workflows && npm test
cd apps/trader-cli && npm test
cargo test -p trader-chart
node --test test/docs-ai-context.test.mjs
npm run test:summary
```

## Codegraph Use

- Use `codegraph_context` for area onboarding.
- Use `codegraph_trace` for flow/path questions.
- Use `codegraph_callers` and `codegraph_callees` for direct dependencies.
- Use `codegraph_impact` before changing shared code.
- Do not use codegraph to choose document authority; use
  `.agent-dev/context/ai-index.md` for that.
