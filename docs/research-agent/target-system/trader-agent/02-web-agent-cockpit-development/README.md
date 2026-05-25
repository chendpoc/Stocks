# 02 Web Agent Cockpit Development Index

本文档包是 `02-web-agent-cockpit-prd.md` 的实施拆解层。它服务 Layer 2 Web Agent Cockpit，目标是把 PRD 中的页面、组件、事件、权限和验收标准转成可执行的前端开发文档。

## First Principles

Web Agent Cockpit 的本质不是一个普通行情页，也不是聊天机器人外壳，而是一个金融交易工作台和 Agent 控制台的组合：

1. 金融侧必须高密度、低噪音、可追溯，优先展示 signal、risk、rule hit、watchlist、ticket、timeline。
2. Agent 侧必须可控、可中止、可审计，优先展示 tool call、evidence、source、approval、learning。
3. 前端只呈现 Layer 1 和 Layer 3 已产生的数据，不在浏览器中实现策略判断。
4. 高风险动作必须先解释 reason、scope、risk、evidence、失效条件和审计记录，再允许用户决策。
5. 所有实时状态必须可重连、可去重、可回放，不能依赖只存在于浏览器内存的交易关键状态。

## Source PRDs

- System overview: `../00-system-overview.md`
- Agent Core backend: `../01-agent-core-backend-prd.md`
- Web Agent Cockpit: `../02-web-agent-cockpit-prd.md`
- Shared Platform: `../03-shared-platform-roadmap-prd.md`

## Development Defaults

| Area | Decision |
|---|---|
| Product form | 金融交易工作台 + Agent 控制台 |
| App framework | Next.js App Router + React + TypeScript |
| UI system | shadcn/ui + Radix primitives + Tailwind tokens |
| AI runtime | Vercel AI SDK streaming model, AI Elements / assistant-ui as component references |
| Server state | TanStack Query |
| UI state | Zustand, only for local UI state |
| Data table | TanStack Table |
| Financial chart | TradingView Lightweight Charts |
| Statistical chart | Recharts or Tremor |
| Forms | React Hook Form + Zod |
| Rejected main UI stacks | MUI, Ant Design, Mantine, Chakra as primary UI system |

Reference links embedded in implementation docs:

- [Fortress Dashboard](https://fortress-dashboard.pages.dev/)
- [Vercel AI SDK](https://ai-sdk.dev/docs/introduction)
- [AI Elements](https://elements.ai-sdk.dev/)
- [assistant-ui](https://www.assistant-ui.com/docs)
- [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview)
- [TanStack Table](https://tanstack.com/table/latest/docs/introduction)
- [TradingView Lightweight Charts](https://tradingview.github.io/lightweight-charts/)
- [Recharts](https://recharts.org/)
- [Tremor](https://tremor.so/)
- [React Hook Form](https://react-hook-form.com/)
- [Zod](https://zod.dev/)

## Development Phases

`02-web-agent-cockpit` 与 `01-agent-core` 并行开发。Web 端第一阶段不实现业务判断，也不提前固化 Agent Core DTO。先做可运行的前端基础层，再等 01 / 03 契约稳定后接入真实数据。

| Phase | Scope | Development doc | Why |
|---:|---|---|---|
| 0 | Cockpit frontend foundation | [00a-frontend-foundation-phase.md](./00a-frontend-foundation-phase.md) | 不依赖 Agent Core，先完成 shell、设计系统、mock adapter、状态组件、chart/table/chat/timeline/inbox 基础能力 |
| 1 | Contract integration boundary | [02-shared-cockpit-contracts.md](./02-shared-cockpit-contracts.md) | 等 01 / 03 锁定 DTO、event registry、approval/permission/audit enum 后替换 adapter |
| 2 | Business page implementation | [03-live-dashboard.md](./03-live-dashboard.md) to [15-settings-and-audit.md](./15-settings-and-audit.md) | 基于真实契约完成页面业务流 |

## Phase 0 Route Priority

Phase 0 可以创建这些 route shell 和 mock-backed UI，但不能声明最终业务契约：

| Priority | Route | Development doc | Phase 0 behavior |
|---:|---|---|---|
| P0 | `/dashboard/live` | [03-live-dashboard.md](./03-live-dashboard.md) | cockpit shell, mock market gate, mock chart, mock signal queue, mock timeline, right rail |
| P0 | `/chat` | [04-agent-chat.md](./04-agent-chat.md) | streaming chat UI shell, mock stream parts, stop/retry/tool/source/evidence rendering |
| P0 | `/inbox` | [05-agent-inbox.md](./05-agent-inbox.md) | mock notification list, priority states, detail panel |
| P0 | embedded | [06-agent-action-timeline.md](./06-agent-action-timeline.md) | generic event list, grouping, live-follow and detail drawer |
| P0 | `/signals` | [11-signals.md](./11-signals.md) | mock signal table and detail drawer with provisional view model |
| P0 | `/approvals` | [10-approval-center.md](./10-approval-center.md) | mock approval detail layout; real decision mutation disabled until contracts arrive |
| P1 | `/settings` | [15-settings-and-audit.md](./15-settings-and-audit.md) | local display/layout preferences where possible |
| P2 | `/tasks`, `/rules`, `/capabilities`, `/playbooks`, `/journal`, `/learning`, `/audit` | module docs | route placeholders or shell only; real behavior waits for contracts |

## Contract-Gated Features

These are explicitly outside Phase 0:

| Feature | Required upstream contract |
|---|---|
| real signal lifecycle | `SignalDTO`, status enum, evidence model |
| ticket generation and approval request | `TradeTicketDTO`, `ApprovalRequestDTO`, ticket to approval state machine |
| approval decision mutation | permission enum, audit enum, idempotency contract |
| real WebSocket updates | canonical event registry |
| rule editing and simulation | RulePack schema, validation API, simulation API |
| capability enable/disable | Tool Gateway permission and rate limit model |
| task mutation | Scheduler / Worker task state model |
| learning proposal apply | Reflection Engine proposal DTO |
| full audit center | `AuditEntryDTO`, persistence, export permission |

## Document Map

| # | Document | Purpose |
|---:|---|---|
| 00 | [00-tech-stack-and-frontend-architecture.md](./00-tech-stack-and-frontend-architecture.md) | 技术栈、依赖边界、目录结构、状态分层、实时连接策略 |
| 00a | [00a-frontend-foundation-phase.md](./00a-frontend-foundation-phase.md) | 不依赖 Agent Core 的前端基础层、mock adapter、fixture 和 Phase 0 验收 |
| 01 | [01-design-style-and-interaction-principles.md](./01-design-style-and-interaction-principles.md) | 金融 + Agent 混合设计语言、布局、信息密度、交互原则 |
| 02 | [02-shared-cockpit-contracts.md](./02-shared-cockpit-contracts.md) | API、WebSocket/SSE、store、权限、审批、审计、错误态 |
| 03-15 | Module docs | 每个页面或跨页面模块的实现文档 |

## Current `apps/research-console` Migration Map

现有 `apps/research-console` 不是最终 cockpit，但可迁移为 Phase 0 前端基础层的基础壳：

| Existing surface | Migration target | Reuse decision |
|---|---|---|
| `ResearchWorkspace` | `/dashboard/live` shell | 保留三栏工作台思想，重构为 market / signal / agent control layout |
| `AgentPanel` | dashboard right rail and `/chat` side context | 保留 agent 状态、run summary、evidence 入口，改为 streaming-first |
| `AgentTimeline` | [06-agent-action-timeline.md](./06-agent-action-timeline.md) | 保留时间线概念，改为 `agent_events` 驱动 |
| `OpportunityBoard` | `/signals` and dashboard signal board | 改名为 signal board，不再用机会板承载策略判断 |
| `ScoreRows` | signal detail scoring panel | 保留评分展示，必须增加 evidence、rule hit、risk veto 来源 |
| shadcn-like `components/ui/*` | shared UI primitives | 继续使用，按 shadcn/ui 规范补齐 dialog、tabs、popover、toast、table、sheet |
| Tailwind tokens | design system foundation | 继续保留深色金融工作台方向，按本文档收敛色板与密度 |

迁移原则：

- 不把旧 research summary 概念直接搬进 trader cockpit；旧代码只能作为布局和组件资产。
- 先搭 route shell、design system、mock adapter，再迁移旧组件。
- Phase 0 可以使用 mock adapter 驱动 UI；业务页面组件不能直接 import fixture 文件。
- Phase 1 之后所有真实数据依赖必须从 Layer 3 API / WS / SSE 读取，不直接读取本地 mock 作为产品逻辑。

## Shared Quality Gate

开发前和文档变更后运行：

```powershell
rg "TB[D]|TO[D]O|待[定]" docs/research-agent/target-system/trader-agent/02-web-agent-cockpit-development
npm run docs:build
```

期望结果：

- 本目录包含 1 个索引、4 个共享或阶段文档、13 个模块文档。
- 每个模块文档都能回答：依赖哪些后端对象、接收哪些实时事件、用户能做哪些动作、哪些动作需要审批、失败时如何展示。
- 文档站构建通过。
