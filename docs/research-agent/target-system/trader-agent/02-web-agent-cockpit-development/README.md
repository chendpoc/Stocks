# 02 Agent Market Cockpit Development Index

本文档包是 `02-web-agent-cockpit-prd.md` 的实施拆解层。当前版本服务 Layer 2 Agent Market Cockpit，目标是把 Agent Core 的只读市场判断、signal、证据、工具来源、学习结果和对话能力组织成可开发的前端工作台。

- **代码位置：** `apps/trader-cockpit`
- **实现快照：** [00-implementation-status.md](./00-implementation-status.md)（与代码同步的真值来源）
- **全局 Workflow 入口：** [../00-workflow-router.md](../00-workflow-router.md)（先判断任务类型、source-of-truth 和 spec gate）
- **Cockpit 局部路由：** [00e-workflow-and-skill-routing.md](./00e-workflow-and-skill-routing.md)（只处理 Cockpit 前端任务）
- **Plan Contract：** [00-development-workflow.md](./00-development-workflow.md)（plan 模板、worker prompt、状态回写）

## Current Progress (2026-05-29)

| 里程碑 | 状态 |
|---|---|
| Phase 0A mock adapter + 7 routes + shell + i18n | done |
| Phase 0B signals/inbox/theories/learning deep-link | done |
| Phase 0C Dashboard v5 + Today Focus Queue | done |
| Phase 0D-1 Agent Console breadth skeleton | done |
| Frontend quality reset + Dashboard reference page | active → [00d-cockpit-frontend-quality-reset.md](./00d-cockpit-frontend-quality-reset.md), [plans/02-dashboard-reference-page-quality-reset.md](./plans/02-dashboard-reference-page-quality-reset.md) |
| Phase 0D-2 Read-only Activity DAG | in_progress（graph scaffold exists, chat still uses ActivityChain） → [plans/01-agent-activity-graph-readonly.md](./plans/01-agent-activity-graph-readonly.md) |
| Real-readonly Agent Core adapter | pending |
| DeepSeek `POST /api/agent-chat` | pending |

下一批任务见 [plans/README.md](./plans/README.md)。

## First Principles

1. Cockpit 的本质是市场意图解释和 Agent 协作工作台，不是交易执行系统。
2. 第一版优先展示 signal、market intent、scenario plan、evidence、tool source、playbook theory 和 learning。
3. 前端不实现策略判断，不直接创建 signal/rule/learning proposal。
4. DeepSeek direct 只作为 Chat/解释层，不能绕过 Agent Core 的 schema、audit 和只读边界。
5. 第一版采用真实只读 Agent Core 接入 + mock fallback。
6. 机会类内容使用 `Scenario Plan / 关注计划`，不使用订单类对象。
7. 实时能力先用 polling + chat stream，不把完整 WebSocket Event Bus 作为第一版前置。

## Source PRDs

- System overview: `../00-system-overview.md`
- Agent Core backend: `../01-agent-core-backend-prd.md`
- Web Agent Cockpit: `../02-web-agent-cockpit-prd.md`
- Shared Platform: `../03-shared-platform-roadmap-prd.md`
- Contract gap review: [01-agent-core-to-cockpit-contract-gap-review.md](./01-agent-core-to-cockpit-contract-gap-review.md)

## Development Defaults

与当前代码一致（2026-05-27）：

| Area | Decision |
|---|---|
| App package | `apps/trader-cockpit` |
| Route prefix | `/cockpit/*` |
| Product form | Agent Market Cockpit |
| App framework | Next.js App Router + React + TypeScript |
| UI system | HeroUI v3 + Tailwind v4 semantic tokens |
| Data layer | `mockCockpitAdapter` only（real-readonly 待 Phase 1） |
| AI call boundary | Next.js API route for DeepSeek direct, read-only context only |
| Server state | TanStack Query |
| UI state | Zustand, only for local UI state |
| Data table | HeroUI Table for current version; dedicated table library only when sorting/filtering complexity requires it |
| Financial chart | Current mock chart first; TradingView Lightweight Charts remains a later enhancement |
| Statistical chart | Current mock/stateless chart first; Recharts/Tremor remains a later enhancement |
| Forms | React Hook Form + Zod |
| Realtime v1 | polling + manual refresh + chat stream |

## First-Version Routes

| Route | Workspace | Development doc | Status |
|---|---|---|---|
| `/cockpit/dashboard/live` | `LiveDashboard` | [03-live-dashboard.md](./03-live-dashboard.md) | done (v5) |
| `/cockpit/signals` | `SignalsWorkspace` | [11-signals.md](./11-signals.md) | done |
| `/cockpit/chat` | `AgentConsoleWorkspace` | [04-agent-chat.md](./04-agent-chat.md) + [16-agent-console-dlite-v3.md](./16-agent-console-dlite-v3.md) | done (0D-1) |
| `/cockpit/inbox` | `AgentInbox` | [05-agent-inbox.md](./05-agent-inbox.md) | done |
| `/cockpit/playbook-theories` | `PlaybookTheoriesWorkspace` | [08-playbook-theories.md](./08-playbook-theories.md) | done |
| `/cockpit/learning` | `LearningWorkspace` | [14-learning-center.md](./14-learning-center.md) | done |
| `/cockpit/settings` | `SettingsWorkspace` | [15-settings-and-tool-sources.md](./15-settings-and-tool-sources.md) | done |

## Embedded Component Docs

| Component doc | Scope |
|---|---|
| [06-agent-action-timeline.md](./06-agent-action-timeline.md) | Embedded agent event and tool-source timeline used inside dashboard, signal detail, inbox, chat and learning views |
| [16-agent-console-dlite-v3.md](./16-agent-console-dlite-v3.md) | Phase 0D Agent Console split: breadth-first workspace skeleton, then read-only Activity DAG module |

## Cross-System Backlog

| Roadmap doc | Scope |
|---|---|
| [05-agent-workflow-orchestration-roadmap.md](../05-agent-workflow-orchestration-roadmap.md) | Future workflow and agent task orchestration across Agent Core, Shared Platform and Cockpit |

## Excluded From First Version

These concepts are not part of the current version and must not appear as required implementation work:

- trading execution surfaces
- account trading surfaces
- order-shaped objects
- standalone human approval console
- scheduler/task control console
- standalone tool permission console
- standalone rule editor
- standalone historical journal console
- standalone audit console

## Development Phases

| Phase | Scope | Why |
|---:|---|---|
| 0 | Real-readonly adapter + mock fallback + first-version routes | Gives a usable cockpit while Agent Core contracts are still incomplete |
| 1 | Contract gap closure | Adds missing signal list/detail, market snapshot, learning and theory APIs |
| 2 | Richer evidence and validation | Adds post-validation, more chart overlays, richer news/event evidence |
| Backlog | task scheduling, approval workflows, execution, standalone audit | Requires new backend capabilities and stronger product boundaries |

## Contract-Gated Features

| Feature | Required upstream contract |
|---|---|
| complete signal list/detail API | Agent Core or Layer 3 read model |
| market snapshot API | Market Snapshot Service read endpoint |
| learning summary API | Reflection Engine read endpoint |
| PlaybookTheory API | Rule Discovery / Playbook service read endpoint |
| post validation | outcome labeling and scheduled verification |
| real event bus | canonical event registry and producer contracts |

## Current Agent Core Integration Boundary

The current backend exposes useful read endpoints, but not the full Cockpit contract.

Available now:

- `GET /api/agent/status`
- `GET /api/agent/events`
- `GET /api/agent/runs`
- `GET /api/agent/runs/{run_id}`
- `GET /api/agent/signals/{signal_id}/explanation`
- `GET /api/knowledge/search`

Any first-version component depending on missing APIs must have mock fallback.

## Document Map

| Document | Purpose |
|---|---|
| [00-implementation-status.md](./00-implementation-status.md) | 代码进展快照（维护真值） |
| [../00-workflow-router.md](../00-workflow-router.md) | trader-agent 全局 workflow 入口、source-of-truth 顺序和 spec gate |
| [00e-workflow-and-skill-routing.md](./00e-workflow-and-skill-routing.md) | Cockpit 局部 workflow / skill 路由 |
| [00-development-workflow.md](./00-development-workflow.md) | Cockpit plan contract、worker prompt 和状态回写规则 |
| [plans/README.md](./plans/README.md) | 可执行计划索引 |
| [00-tech-stack-and-frontend-architecture.md](./00-tech-stack-and-frontend-architecture.md) | Tech stack, state boundaries, polling/stream strategy |
| [00a-frontend-foundation-phase.md](./00a-frontend-foundation-phase.md) | Real-readonly + mock fallback frontend foundation |
| [00b-visual-design-review-workflow.md](./00b-visual-design-review-workflow.md) | Required sketch-first workflow for page structure, visual hierarchy and interaction changes |
| [00c-review-agent-brief.md](./00c-review-agent-brief.md) | Standard read-only reviewer context for `02-web-agent-cockpit` review agents and review conversations |
| [00d-cockpit-frontend-quality-reset.md](./00d-cockpit-frontend-quality-reset.md) | Frontend quality reset: design system first, Dashboard reference page first, visual review as hard gate |
| [01-design-style-and-interaction-principles.md](./01-design-style-and-interaction-principles.md) | Market cockpit design language and interaction principles |
| [01-agent-core-to-cockpit-contract-gap-review.md](./01-agent-core-to-cockpit-contract-gap-review.md) | Current API gap review |
| [02-shared-cockpit-contracts.md](./02-shared-cockpit-contracts.md) | View models, tags, ScenarioPlan, PlaybookTheory, tool sources |
| [03-live-dashboard.md](./03-live-dashboard.md) to [15-settings-and-tool-sources.md](./15-settings-and-tool-sources.md) | First-version page/module docs |
| [16-agent-console-dlite-v3.md](./16-agent-console-dlite-v3.md) | D-lite v3 Agent Console development plan |
| [05-agent-workflow-orchestration-roadmap.md](../05-agent-workflow-orchestration-roadmap.md) | Cross-system workflow orchestration roadmap and ownership split |

## Shared Quality Gate

Run after document changes:

```powershell
rg "TB[D]|TO[D]O|待[定]" docs/research-agent/target-system/trader-agent/02-web-agent-cockpit-development docs/research-agent/target-system/trader-agent/02-web-agent-cockpit-prd.md docs/research-agent/target-system/trader-agent/05-agent-workflow-orchestration-roadmap.md
pnpm run docs:build
```

Expected:

- No current-version docs require execution, order, approval-console or task-control features.
- First-version route set is consistent across PRD, README and module docs.
- Missing backend contracts are explicitly called out as gaps.
