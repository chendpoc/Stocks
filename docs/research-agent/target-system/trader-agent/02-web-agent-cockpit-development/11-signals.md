# 11 Signals

## 目标与非目标

目标：

实现 `/signals`，用于查询、过滤、解释和跟踪 signal 生命周期。Signals 页面是从 Agent 产物进入交易决策复核的主索引。

非目标：

- 不在前端生成 signal。
- 不直接下单。
- 不展示无 evidence 或无 rule lineage 的 signal 作为可行动对象。

## 对应 PRD 范围

对应 `02-web-agent-cockpit-prd.md` section 11：Signals。

字段：

- ticker
- setup
- direction
- confidence
- score
- risk
- status
- trigger
- invalidation
- playbook
- evidence
- created_at

操作：

- open signal
- open ticket
- ask agent
- mark reviewed
- provide feedback

## 页面/组件拆分

| Component | Responsibility |
|---|---|
| `SignalsPage` | route composition |
| `SignalFilterBar` | ticker, setup, status, risk, date filters |
| `SignalTable` | TanStack Table dense list |
| `SignalDetailDrawer` | setup, evidence, rule hit, risk, ticket |
| `SignalStatusTimeline` | status transitions |
| `SignalEvidencePanel` | source cards and semantic events |
| `SignalTicketPanel` | conditional ticket and approval status |
| `SignalFeedbackForm` | reviewed, useful, invalid reason |

## 数据输入输出

Inputs:

- `signals`
- `trade_tickets`
- `trader_semantic_events`
- `market_context_snapshots`
- `playbooks`
- `agent_events`
- `human_feedback`

Outputs:

- mark reviewed
- provide feedback
- open ticket drawer
- submit ticket approval request
- ask Agent with signal context
- open playbook or evidence source

## API、WebSocket、SSE 事件

REST:

- `GET /api/signals`
- `GET /api/signals/{signal_id}`
- `GET /api/signals/{signal_id}/evidence`
- `GET /api/signals/{signal_id}/events`
- `GET /api/signals/{signal_id}/ticket`
- `POST /api/signals/{signal_id}/reviewed`
- `POST /api/signals/{signal_id}/feedback`
- `POST /api/tickets/{ticket_id}/approval-request`

Realtime:

- `/ws/signals`: `signal.created`, `signal.updated`, `signal.invalidated`, `ticket.generated`
- `/ws/events`: `rule.hit`, `risk.checked`, `agent.tool_call_finished`
- `/ws/approvals`: `approval.created`, `approval.updated`, `approval.decided`

SSE:

- Ask Agent action opens `/chat` with signal context or embedded chat drawer using chat stream contract.

## TanStack Query key 与 Zustand UI state 边界

TanStack Query:

- `cockpitKeys.signals(filters)`
- `cockpitKeys.signal(signalId)`
- `["cockpit", "signal-evidence", signalId]`
- `["cockpit", "signal-events", signalId]`
- linked ticket and approval query keys

Zustand UI state:

- selected signal id
- detail drawer open
- filter drawer open
- table density
- local filter draft

## 用户交互流程

1. User opens `/signals`.
2. Table lists signal rows with status, score, risk and confidence.
3. User filters by ticker/setup/status/risk.
4. User opens detail drawer.
5. Drawer shows setup, evidence, rule hit, risk veto/pass, ticket draft and status timeline.
6. User marks reviewed or provides feedback.
7. User opens ticket or routes signal context to chat.

## 权限、审批、审计要求

Required permissions:

- `view_signal`
- `approve_action` only through Approval Center.

Approval required:

- ticket approval request.
- reactivation or override of invalidated signal.

Audit required:

- reviewed marker.
- feedback submission.
- ticket approval request.
- status transition request.

## 空态、loading、error、reconnect、dedupe 行为

| State | Behavior |
|---|---|
| Empty | show filters, last scan time and task creation path |
| Loading | table skeleton with stable columns |
| Error | retry, preserve filters |
| Reconnect | stale badge, disable ticket submission |
| Dedupe | upsert signal by id and version |

## 可复用现有代码

- `OpportunityBoard`: migrate to `SignalTable` and `SignalQueuePanel`.
- `OpportunityDetail` if still available conceptually, replaced by drawer.
- `ScoreRows`: reuse for score/risk display.
- `AgentEvidenceDetail`: reuse for evidence detail.

## 实现任务

1. Create `/signals` route.
2. Build TanStack Table with required fields.
3. Build signal detail drawer.
4. Implement evidence, status timeline and ticket panels.
5. Wire review and feedback mutations.
6. Wire realtime signal updates and approval changes.
7. Add chat handoff with signal context.

## 功能验收标准

- User can filter and inspect all PRD signal fields.
- Signal detail explains setup, evidence, score, risk and invalidation.
- User can mark reviewed and submit feedback.
- Ticket action routes to approval flow.
- Realtime updates keep table and selected detail consistent.

## 设计交互验收标准

- Signal table is optimized for scanning.
- Risk and status are visible through text, icon and color.
- Detail drawer keeps chart/evidence/ticket sections visually separated.
- Feedback form is compact and does not interrupt inspection.

## 测试场景

- Unit test signal event upsert.
- Component test empty and filtered-empty states.
- Component test invalidated signal disables ticket request.
- Playwright flow: filter signals, open detail, mark reviewed, ask Agent.
