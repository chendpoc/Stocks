# 00e Cockpit Workflow And Skill Routing

版本：`v0.2`

范围：`apps/trader-cockpit` 和 `02-web-agent-cockpit-development` 下的局部执行路由。

上级入口：[../00-workflow-router.md](../00-workflow-router.md)。本文件只处理 Cockpit 前端任务，不决定 Agent Core、Shared Memory、Shared Platform 或全系统架构。

## 1. Purpose

This router prevents three recurring failures:

1. Coding starts before the page job and interaction model are clear.
2. Review agents check code hygiene while missing product and UX problems.
3. Generic skills override Cockpit-specific product boundaries.

## 2. Priority Order

When instructions conflict, use this order:

| Priority | Source | Role |
|---:|---|---|
| 1 | Current user instruction | Current product and execution decision |
| 2 | [../00-workflow-router.md](../00-workflow-router.md) | Trader-agent global workflow order |
| 3 | [../02-web-agent-cockpit-prd.md](../02-web-agent-cockpit-prd.md) | Cockpit product boundary |
| 4 | [README.md](./README.md), [00-implementation-status.md](./00-implementation-status.md), module docs | Cockpit current state and route contracts |
| 5 | Accepted [plans/](./plans/) spec | Current implementation contract |
| 6 | Project-specific skills | Execution workflow |
| 7 | General skills and memory | Method or context only |

Do not reference a project `AGENTS.md` unless a real file exists in the repo.

## 3. Cockpit Workflow Router

| Task type | Primary workflow | Supporting skills | Product-owner gate | Output |
|---|---|---|---|---|
| New page, major page restructure, route purpose change | [00b Visual Design Review Workflow](./00b-visual-design-review-workflow.md) | `product-requirements-discussion`, `frontend-design`, `web-design-guidelines` | yes | sketch prompt, reviewed visual direction, implementation plan |
| Cockpit plan or worker prompt before coding | `module-spec-quality-gate` | this router, current PRD/status/module docs | yes if source or UX decision is open | source-checked executable spec |
| Cockpit frontend implementation after design/spec is accepted | `cockpit-frontend-workflow` | `vercel-react-best-practices`, `vercel-composition-patterns` when relevant | only for scope or interaction changes | bounded code diff, browser QA, lint/build/tests |
| Module or phase implementation with worker agents | `agent-module-development-loop` | `phase-review-agent-workflow` after implementation | only for product or scope changes | worker prompt, review/fix loop, final verification |
| Read-only review of design, screenshot, diff, or worker result | `phase-review-agent-workflow` | `web-design-guidelines` for UI review | yes for UX decisions | findings-first review, accepted fixes or product questions |
| Bug, regression, or unexplained behavior | systematic debugging workflow | verification skill | no unless fix changes product behavior | root cause, narrow fix, regression verification |
| Small typo, copy, import, or test-maintenance fix | local direct workflow | optional verification skill | no | narrow patch and relevant command output |
| New backend/API/data contract assumption | use parent router; not this document | relevant backend docs | yes | explicit contract decision |
| New UI library, graph library, table abstraction, or design primitive | [00b Visual Design Review Workflow](./00b-visual-design-review-workflow.md) | `find-skills`, frontend ecosystem skills | yes | tradeoff note and accepted implementation boundary |

## 4. Design Gate

Use the design gate before code when the task changes any of these:

- page information hierarchy
- first-viewport layout
- sidebar, navigation, or route entry points
- drawer, panel, modal, or drill-down behavior
- table density, local scroll, pagination, or row actions
- Agent console, chat, activity chain, or workflow visualization
- visual system primitives, HeroUI wrapper strategy, or theme tokens

Minimum accepted path:

```text
current page / screenshot / issue inventory
    -> first-principles problem statement
    -> image prompt or low-fidelity sketch
    -> product-owner review
    -> spec gate / implementation plan
    -> worker or direct implementation
    -> browser screenshot QA
```

Do not use this gate for spelling fixes, simple broken imports, build-only repairs, or test-only edits.

## 5. Skill Usage Rules

1. Select one primary workflow for the task.
2. Announce the primary workflow and why it applies.
3. Add supporting skills only for the active work surface.
4. Do not let a general skill override Cockpit exclusions.
5. Do not let a review agent decide product behavior; convert uncertainty into questions for the product owner.
6. Do not leave worker or review agents running after their result is no longer needed.
7. Do not commit unless the user explicitly asks for a commit.

## 6. Cockpit Frontend Skill Boundary

The local `cockpit-frontend-workflow` skill should be used for `apps/trader-cockpit` frontend work after the product direction and spec are clear.

It owns:

- HeroUI-first implementation discipline
- cockpit primitives before one-off components
- TypeScript-only business code
- `@/*` import discipline
- adapter-only data access
- browser visual QA
- lint/build/test verification

It does not own:

- product route scope
- trading or execution policy
- Agent Core API contract changes
- workflow orchestration roadmap
- memory architecture
- plan/spec source-of-truth adjudication

Those decisions stay in PRD/docs and require product-owner confirmation when they change behavior or architecture.

## 7. Review Routing

Use review agents differently by artifact:

| Artifact | Reviewer focus |
|---|---|
| Image or low-fidelity sketch | page job, hierarchy, interaction cost, first viewport, scroll boundary |
| Pre-code plan/spec | source conflicts, missing decisions, scope leaks, verification gaps |
| Worker diff | requirement gaps, bugs, missing tests, forbidden scope |
| Browser screenshot | visual hierarchy, clipping, table wrapping, sidebar usability |
| Commit gate | remaining dirty state, verification commands, unintended files |

Review findings are not automatically accepted. The main agent must reject stale, wrong, out-of-scope, or product-incompatible findings.

## 8. Required Verification

For Cockpit code changes, run the relevant subset:

```powershell
pnpm --filter trader-cockpit lint
pnpm --filter trader-cockpit build
node --test test/trader-cockpit-phase0.test.mjs
```

For docs-only Cockpit changes:

```powershell
rg "TB[D]|TO[D]O|待[定]" project-docs/research-agent/target-system/trader-agent/02-web-agent-cockpit-development project-docs/research-agent/target-system/trader-agent/02-web-agent-cockpit-prd.md
pnpm run docs:build
```

For visual changes, add browser inspection of the affected route and report what was checked.

## 9. Current-Version Exclusions

No workflow or skill may reintroduce these first-version exclusions:

- trading execution surfaces
- order-shaped objects
- account trading actions
- standalone approval center
- scheduler or task-control console
- standalone capability permission console
- standalone rule editor
- standalone historical journal console
- standalone audit console
