# Code Map

Private code locator for implementation, debugging, and review. Do not read
this file during ordinary repo orientation. Start from `CLAUDE.md` and
`.agent-dev/context/ai-index.md`; read this file only after the selected route,
spec, task step, or review target requires code work and the code path is not
already obvious.

## How To Use

1. Confirm one route in `.agent-dev/context/ai-index.md`.
2. Read the relevant `spec.scope`, task step, and slice before code docs.
3. Use `git status --short` only to identify dirty files.
4. Use `git diff --name-only` for changed-file audit only.
5. Read `.agent-dev/context/module_map.md` only when a scoped code area is still
   unclear.
6. Use codegraph for symbols, callers, callees, traces, and impact.
7. Inspect only exact source files or scoped diffs such as
   `git diff -- <scoped-path>`.

## Context Files

| File | Purpose | Read by default |
|---|---|---|
| `.agent-dev/context/ai-index.md` | Route selection and document authority | yes |
| `.agent-dev/context/code_map.md` | This lightweight code-work entrypoint | no |
| `.agent-dev/context/module_map.md` | Coarse module hints after scope narrowing | no |

## Diff Rules

- Do not run an unrestricted `git diff` by default.
- Do not use an unrestricted `git diff --stat` as review evidence.
- Use `git diff -- <scoped-path>` or `git diff --stat -- <scoped-path>` after
  deriving paths from `spec.scope`, `task.steps[].files_expected`, or the review
  target.
- `rg` is allowed only inside narrowed paths.

## Codegraph Use

- Use `codegraph_context` for area onboarding.
- Use `codegraph_trace` for flow/path questions.
- Use `codegraph_callers` and `codegraph_callees` for direct dependencies.
- Use `codegraph_impact` before changing shared code.
- Do not use codegraph to choose document authority; use
  `.agent-dev/context/ai-index.md` for that.
