# 03 Live Dashboard

## 目标与非目标

目标：

实现 `/dashboard/live`，作为 Web Agent Cockpit 的第一屏。它必须同时呈现市场状态、watchlist setup、active signals、Agent 状态、action timeline、pending approval 和 ticket draft。

非目标：

- 不在前端计算交易信号。
- 不执行实盘下单。
- 不把 chat 作为唯一操作入口。
- 不展示无法追溯 evidence 的 signal。

## 对应 PRD 范围

对应 `02-web-agent-cockpit-prd.md` section 3：Live Dashboard。

PRD 组件：

- `MarketGateBar`
- `WatchlistSetupBoard`
- `MainChartPanel`
- `SignalEvidencePanel`
- `TraderBrainPanel`
- `AgentPanel`
- `AgentTimeline`
- `TradeTicketDrawer`

## 页面/组件拆分

| Component | Responsibility |
|---|---|
| `LiveDashboardPage` | route composition and data boundary |
| `MarketGateBar` | market open/close, session, data freshness, risk mode |
| `WatchlistSetupBoard` | watchlist symbols, setup state, latest rule hit |
| `MainChartPanel` | TradingView Lightweight Charts candlestick/volume/markers |
| `SignalQueuePanel` | active signal list, status, score, trigger state |
| `SignalEvidencePanel` | evidence, source messages, rule hits, risk flags |
| `TraderBrainPanel` | Agent explanation summary from Layer 1 |
| `AgentControlRail` | agent status, run task shortcut, pending approval summary |
| `AgentTimelinePanel` | embedded timeline using `agent_events` |
| `TradeTicketDrawer` | conditional ticket draft and approval handoff |

## 数据输入输出

Inputs:

- `market_gate`
- `watchlist`
- `market_context_snapshots`
- `signals`
- `signal evidence`
- `trade_tickets`
- `agent_events`
- `agent_tasks`
- `approval_requests`

Outputs:

- select symbol
- select signal
- open evidence detail
- open ticket drawer
- submit ticket approval request
- create scan task
- pause or resume visible task
- hand off selected context to chat

## API、WebSocket、SSE 事件

REST:

- `GET /api/market/gate`
- `GET /api/market/watchlist-setups`
- `GET /api/signals?status=active,watch,waiting_trigger,triggered`
- `GET /api/signals/{signal_id}`
- `GET /api/signals/{signal_id}/evidence`
- `GET /api/signals/{signal_id}/ticket`
- `GET /api/agent-events?scope=dashboard`
- `GET /api/approvals?status=pending&scope=dashboard`
- `POST /api/tasks`
- `POST /api/tickets/{ticket_id}/approval-request`

Realtime:

- `/ws/signals`: `signal.created`, `signal.updated`, `signal.invalidated`, `ticket.generated`
- `/ws/events`: `rule.hit`, `agent.tool_call_started`, `agent.tool_call_finished`, `capability.blocked`
- `/ws/tasks`: `task.updated`, `task.failed`, `task.completed`
- `/ws/approvals`: `approval.created`, `approval.updated`, `approval.expired`

SSE:

- Dashboard does not own chat stream, but can open chat with selected signal context.

## TanStack Query key 与 Zustand UI state 边界

TanStack Query:

- `cockpitKeys.dashboard(scope)`
- `cockpitKeys.signals(filters)`
- `cockpitKeys.signal(signalId)`
- `cockpitKeys.agentEvents({ scope: "dashboard" })`
- `cockpitKeys.approvals({ status: "pending", scope: "dashboard" })`

Zustand UI state:

- selected symbol id
- selected signal id
- chart timeframe
- right rail collapsed
- ticket drawer open
- evidence drawer open
- table density

Forbidden in Zustand:

- full signal rows
- approval details
- chart series data
- agent events

## 用户交互流程

1. User opens `/dashboard/live`.
2. Shell shows market gate, connection state and last refresh time.
3. User selects a watchlist symbol or active signal.
4. Chart, evidence panel and timeline synchronize to selected context.
5. If ticket draft exists, user opens `TradeTicketDrawer`.
6. Drawer shows reason, scope, risk, evidence, expiry and audit link.
7. User submits approval request, not direct trade execution.
8. Dashboard receives approval event and updates pending decision panel.

## 权限、审批、审计要求

Required permissions:

- `view_signal`
- `create_task` for scan/monitor task shortcuts
- `approve_action` only when decision controls are embedded

Approval required:

- trade ticket approval request
- enabling high-risk scan from dashboard shortcut
- reactivating invalidated signal

Audit required:

- ticket approval request
- signal status transition request
- task create/pause/resume
- context sent to chat when it triggers a write action

## 空态、loading、error、reconnect、dedupe 行为

| State | Behavior |
|---|---|
| Empty watchlist | show config CTA linking to settings, no fake symbols |
| Empty signals | show last scan time and task shortcut |
| Loading | render stable cockpit skeleton: gate, board, chart, rail |
| Error | page-level error only for auth/config failure; panel-level errors otherwise |
| Reconnect | keep last data, show stale badge, disable approval and ticket submit |
| Dedupe | apply newest signal version; ignore duplicated event id |

## 可复用现有代码

- `ResearchWorkspace`: reuse shell composition ideas, not old research semantics.
- `AgentPanel`: reuse right rail agent state pattern.
- `AgentTimeline`: migrate to `agent_events`.
- `OpportunityBoard`: migrate to `SignalQueuePanel`.
- `ScoreRows`: reuse score row visual treatment with evidence links.
- `components/ui/*`: continue shadcn-style primitives.

## 实现任务

1. Create `/dashboard/live` route under cockpit layout.
2. Build dashboard aggregate query hook and individual detail query hooks.
3. Add TradingView Lightweight Charts wrapper with signal markers.
4. Implement signal queue and watchlist setup board with dense table layout.
5. Implement evidence panel and ticket drawer.
6. Subscribe to signal, event, task and approval channels.
7. Wire dashboard shortcuts to task and approval mutations.
8. Add stale-data and reconnect affordances.

## 功能验收标准

- User can see market gate, active watchlist setup, selected chart, signal evidence, Agent status and timeline in one screen.
- New signal appears without full page refresh.
- Signal status updates do not destroy user-selected detail.
- Ticket draft cannot be submitted without showing risk, evidence, expiry and audit context.
- Reconnect restores missed updates through REST delta or query invalidation.

## 设计交互验收标准

- First viewport reads as a professional financial terminal.
- Chart remains the visual anchor; side panels do not overwhelm it.
- Dense tables have sticky headers, aligned numeric columns and status color plus text.
- Pending approvals are visible but not modal unless user initiates decision.
- Connection and stale states are visible in the shell.

## 测试场景

- Component test dashboard skeleton, empty, error and reconnect states.
- Unit test signal event cache update and dedupe.
- Component test ticket drawer disables submit when approval payload is stale.
- Playwright flow: open dashboard, select signal, open evidence, open ticket drawer, submit approval request.
- Visual regression for desktop dashboard layout.
