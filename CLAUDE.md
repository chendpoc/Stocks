# CLAUDE.md

AI entrypoint for this repository. Keep this file small. Its job is to route
the agent to the right private context, not to explain the whole project.

Last updated: 2026-06-03

## Start Here
Default read set:

```text
CLAUDE.md
.agent-dev/context/ai-index.md
route.read_first
```

1. Read `.agent-dev/context/ai-index.md`.
2. Pick exactly one `task_type`.
3. Read only that route's `read_first` documents before deciding the next step.
4. Read `.agent-dev/specs/**` and `.agent-dev/tasks/**` only for an active
   unarchived task.
5. Use `.agent-dev/context/code_map.md` only when entering code work and the
   code path is not already obvious.
6. Use `.agent-dev/context/module_map.md` only after task scope is narrowed and
   module ownership is still unclear.



Do not expand beyond that unless the selected route says to.

## Hard Rules

- Do not broad-read `project-docs/**` or `project-docs/research-agent/**`.
  Select one route first, then read only that route's bounded files.
- Do not run recursive document inventory commands such as `rg --files
  project-docs`, `rg --files project-docs/research-agent`, or recursive
  `Get-ChildItem project-docs` unless the route explicitly requires a bounded
  subdirectory.
- Use `project-docs/archive/**` only when historical context is explicitly in
  scope.
- Do not edit public-site content or scripts for private AI context cleanup:
  `docs/.vitepress/**`, `docs/summaries/**`, `docs/opportunities/**`,
  `docs/trading-experiences/**`, `docs/assets/**`, `docs/alerts/**`,
  `docs/search*`, or `docs/index*`.
- Do not touch unrelated dirty worktree changes.
- Do not stage, commit, push, reset, or restore unless the user explicitly asks.
- Do not echo long worker prompts in chat. Put long artifacts in `.agent-dev/`.

## Dirty Worktree And Diff

- Start with `git status --short`.
- Do not read a full unrestricted `git diff` by default.
- Inspect only scoped diffs, for example `git diff -- <path>`.
- For reviews, list the allowed paths first, then inspect only those path diffs.

## Main Areas

| Area | Role | Notes |
|---|---|---|
| `apps/trader-agent/backend` | Python backend, intel APIs, domain persistence | Backend contracts and tests are source of truth for server behavior. |
| `apps/trader-workflows` | LangGraph workflow runtime and graph execution | Owns workflow state, checkpoints, and graph-level composition. |
| `apps/trader-cli` | TypeScript CLI and Ink TUI | Operator surface; wraps backend/workflows rather than owning domain logic. |
| `.agent-dev` | Active private AI context, specs, tasks, subagent protocols | Historical tasks are archived under `project-docs/archive/agent-dev/`. |
| `project-docs` | Internal architecture, roadmap, ADR, target-system docs | Read through route entrypoints; do not broad-read by default. |
| `docs` | Public VitePress content, summaries, assets, search index | Do not mix internal project docs back into this tree. |

## Agent Engineering Brief

For new agentic workflow, long-running run, subagent, MCP/tool surface, skill,
or alpha research work:

- Keep the core path as deterministic workflow + bounded LLM calls +
  backend/shared contracts + CLI/TUI operator surface.
- Long-running work must leave typed artifacts, audit events, checkpoints, and
  approval boundaries.
- Keep LLM context compact: pass summaries and `EvidenceRef` links, not raw
  corpora, full diffs, or large tool payloads.
- Full proposal:
  `project-docs/research-agent/target-system/trader-agent/08-agent-engineering-principles-proposal.md`.

Do not read the full proposal by default; open it only when the selected route
touches agent harness, workflow composition, tool/MCP, skill, context
engineering, or alpha workflow design.

## Code Boundary

Use codegraph after the route/spec has narrowed the work. Use it for code
symbols, call paths, and impact analysis, not to decide which docs are
authoritative.

## Common Verification

Pick the narrowest command that matches the touched area:

```bash
node --test test/docs-ai-context.test.mjs
npm run trader-agent:backend:verify
cd apps/trader-workflows && npm test
cd apps/trader-cli && npm test
npm run test:summary
```

## Final Verification

For private AI context changes:

```bash
git diff --check
node --test test/docs-ai-context.test.mjs
```

Run package-specific tests only when code behavior changed.
