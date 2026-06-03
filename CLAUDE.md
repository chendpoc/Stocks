# CLAUDE.md

AI entrypoint for this repository. Keep this file small. Its job is to route
the agent to the right private context, not to explain the whole project.

Last updated: 2026-06-03

## Start Here

1. Read `.agent-dev/context/ai-index.md`.
2. Pick exactly one `task_type` from that index.
3. Read only that route's `read_first` documents before deciding the next step.
4. Read `.agent-dev/specs/**` and `.agent-dev/tasks/**` only when the route or
   task requires implementation, review, or non-trivial planning.
5. Read `.agent-dev/context/code_map.md` only when entering code work and the
   code path is not already obvious.
6. Read `.agent-dev/context/module_map.md` only after task scope is narrowed and
   module ownership is still unclear.
7. Use codegraph for code symbols, call paths, and impact analysis. Do not use
   codegraph to decide which docs are authoritative.

Default read set:

```text
CLAUDE.md
.agent-dev/context/ai-index.md
route.read_first
```

Do not expand beyond that unless the selected route says to.

## Hard Scope Rules

- Do not edit `docs/.vitepress/**` or public-site scripts for private AI context
  cleanup.
- Do not move or rename `docs/summaries/**`, `docs/opportunities/**`,
  `docs/trading-experiences/**`, `docs/assets/**`, `docs/alerts/**`,
  `docs/search*`, or `docs/index*` in private context work.
- Keep `project-docs/**` as the stable home for internal project docs.
- Do not touch unrelated dirty worktree changes.
- Do not stage, commit, push, reset, or restore unless the user explicitly asks.
- Do not echo long worker prompts in chat. Put long artifacts in `.agent-dev/`.
- Prefer focused fixes over broad refactors.

## Context Guardrails

- Do not broad-read `project-docs/**` or `project-docs/research-agent/**`.
  Select one route in `.agent-dev/context/ai-index.md`, then read only that
  route's `read_first` files.
- Do not run recursive document inventory commands such as `rg --files
  project-docs`, `rg --files project-docs/research-agent`, or recursive
  `Get-ChildItem project-docs` unless the selected route explicitly requires a
  bounded subdirectory.
- Use `project-docs/README.md` and route entrypoints for orientation; use
  `project-docs/research-agent/modules/**` only in `legacy_migration`.

## Dirty Worktree Rules

- Start with `git status --short`.
- Do not read a full unrestricted `git diff` by default.
- Inspect diffs only for the task scope, for example `git diff -- <path>`.
- Treat unrelated dirty files as user or parallel-agent work. Do not revert,
  move, stage, or format them unless the user explicitly asks.
- For reviews, list the allowed paths first, then inspect only those path diffs.

## Main Areas

| Area | Purpose | Notes |
|---|---|---|
| `apps/trader-agent/backend` | Python FastAPI backend and intel APIs | Use `.venv/Scripts/python.exe` for tests. |
| `apps/trader-workflows` | Stage 1 LangGraph workflows | Independent npm package. |
| `apps/trader-cli` | TypeScript CLI and Ink TUI | Wraps backend and workflows. |
| `apps/trader-chart` | Rust ratatui chart UI | Cargo workspace member. |
| `apps/trader-cockpit` | Web cockpit | Touch only when route/spec allows it. |
| `apps/research-console` | Legacy research console | Reference only unless route/spec allows it. |
| `.agent-dev` | Specs, tasks, reviews, private AI context | Primary private agent artifact area. |
| `project-docs` | Internal project, architecture, roadmap, ADR docs | Read through `.agent-dev/context/ai-index.md`. |
| `docs` | VitePress site content, public corpus, site assets | Do not mix internal docs back into this tree. |

## Common Commands

Run from the repository root unless a package script says otherwise.

```bash
npm run trader-agent:backend:dev
npm run trader-agent:backend:verify
npm run trader-agent:backend:stop

.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/<file>.py -v --tb=short

npm run trader-cli -- runs list --json
npm run trader-cli -- decide TSLA.US --json
npm run trader-workflows -- runs list --json

cd apps/trader-workflows && npm test
cd apps/trader-cli && npm test

node --test test/docs-ai-context.test.mjs
npm run test:summary
```

## Codegraph Boundary

Use codegraph after the route/spec has narrowed the work:

- `codegraph_context`: understand an area or symbol.
- `codegraph_trace`: trace flow between known endpoints.
- `codegraph_callers` / `codegraph_callees`: inspect direct dependencies.
- `codegraph_impact`: estimate blast radius.

Do not use codegraph as a replacement for `.agent-dev/context/ai-index.md` or
project source-of-truth docs.

## Verification

For private AI context changes, use:

```bash
git diff --check
node --test test/docs-ai-context.test.mjs
npm run test:summary
```

Add narrower package tests only when code behavior changed.
