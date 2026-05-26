# 02 Agent Market Cockpit Development Index

本文档包是 `02-web-agent-cockpit-prd.md` 的实施拆解层。当前版本服务 Layer 2 Agent Market Cockpit，目标是把 Agent Core 的只读市场判断、signal、证据、工具来源、学习结果和对话能力组织成可开发的前端工作台。

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

| Area | Decision |
|---|---|
| Product form | Agent Market Cockpit |
| App framework | Next.js App Router + React + TypeScript |
| UI system | HeroUI + Tailwind v4 semantic tokens |
| AI call boundary | Next.js API route for DeepSeek direct, read-only context only |
| Server state | TanStack Query |
| UI state | Zustand, only for local UI state |
| Data table | HeroUI Table for current version; dedicated table library only when sorting/filtering complexity requires it |
| Financial chart | Current mock chart first; TradingView Lightweight Charts remains a later enhancement |
| Statistical chart | Current mock/stateless chart first; Recharts/Tremor remains a later enhancement |
| Forms | React Hook Form + Zod |
| Realtime v1 | polling + manual refresh + chat stream |

## First-Version Routes

| Route | Development doc | Scope |
|---|---|---|
| `/dashboard/live` | [03-live-dashboard.md](./03-live-dashboard.md) | market intent, watchlist, active signals, evidence canvas, Agent state |
| `/signals` | [11-signals.md](./11-signals.md) | opportunity signals, scenario plans, tags, triggers, invalidation |
| `/chat` | [04-agent-chat.md](./04-agent-chat.md) | DeepSeek-backed explanation with read-only context and tool sources |
| `/inbox` | [05-agent-inbox.md](./05-agent-inbox.md) | signal, market gate, risk/invalidation and learning notifications |
| `/playbook-theories` | [08-playbook-theories.md](./08-playbook-theories.md) | PlaybookTheory, PlaybookRule array, current matched signals |
| `/learning` | [14-learning-center.md](./14-learning-center.md) | new theory/rule candidates, low-confidence items, reflection |
| `/settings` | [15-settings-and-tool-sources.md](./15-settings-and-tool-sources.md) | local preferences and lightweight Tool Settings |

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
| [00-tech-stack-and-frontend-architecture.md](./00-tech-stack-and-frontend-architecture.md) | Tech stack, state boundaries, polling/stream strategy |
| [00a-frontend-foundation-phase.md](./00a-frontend-foundation-phase.md) | Real-readonly + mock fallback frontend foundation |
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
