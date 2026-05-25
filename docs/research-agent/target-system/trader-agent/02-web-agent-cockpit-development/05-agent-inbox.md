# 05 Agent Inbox

## 目标与非目标

目标：

实现 `/inbox`，作为 Agent 主动消息和需要用户关注事项的集中入口。Inbox 负责把 signal、risk、approval、task failure、learning summary、rule proposal 等事件转成可处理的消息队列。

非目标：

- 不替代 timeline 的完整事件审计。
- 不把所有低价值事件都推给用户。
- 不在 inbox 里执行高风险 approve without detail。
- 不把通知状态作为业务状态来源。

## 对应 PRD 范围

对应 `02-web-agent-cockpit-prd.md` section 5：Agent Inbox。

消息类型：

- new signal
- signal invalidated
- risk warning
- approval required
- task failed
- learning summary
- rule proposal
- capability blocked

## 页面/组件拆分

| Component | Responsibility |
|---|---|
| `AgentInboxPage` | route and query composition |
| `InboxFilterBar` | priority, type, status, date filters |
| `InboxMessageList` | virtualized dense list |
| `InboxMessageRow` | icon, priority, title, object link, time, read state |
| `InboxDetailPanel` | selected message details and actions |
| `InboxActionBar` | mark read, snooze, open object, request review |
| `PriorityBadge` | critical/high/medium/low with text and color |

## 数据输入输出

Inputs:

- `agent_messages`
- `agent_events`
- `approval_requests`
- `signals`
- `agent_tasks`
- `learning_summaries`
- `rule_proposals`

Outputs:

- mark message read/unread
- archive or snooze message
- open linked signal/task/rule/approval/learning route
- create follow-up task when allowed
- request changes for approval from full detail route

## API、WebSocket、SSE 事件

REST:

- `GET /api/inbox/messages`
- `GET /api/inbox/messages/{message_id}`
- `POST /api/inbox/messages/{message_id}/read`
- `POST /api/inbox/messages/{message_id}/unread`
- `POST /api/inbox/messages/{message_id}/snooze`
- `POST /api/tasks` for allowed follow-up task

Realtime:

- `/ws/events`: `agent.message`, `task.failed`, `rule.proposal_created`, `capability.blocked`, `learning.summary_created`
- `/ws/signals`: `signal.created`, `signal.invalidated`
- `/ws/approvals`: `approval.created`, `approval.expired`, `approval.updated`

SSE:

- Inbox does not own chat streaming.

## TanStack Query key 与 Zustand UI state 边界

TanStack Query:

- `["cockpit", "inbox", filters]`
- `["cockpit", "inbox-message", messageId]`
- linked object query keys as needed

Zustand UI state:

- selected inbox message id
- filter panel open
- split pane width
- local filter draft before apply

## 用户交互流程

1. User opens `/inbox`.
2. Critical and unread messages appear first.
3. User selects a message.
4. Detail panel shows reason, linked object, evidence summary and next action.
5. For approval-required message, primary action opens `/approvals/{id}`.
6. For signal message, action opens `/signals/{id}` or dashboard with selected signal.
7. User marks resolved/read or snoozes non-critical message.

## 权限、审批、审计要求

Required permissions:

- object-specific view permission for linked object.
- `create_task` for follow-up task.
- `approve_action` only in full approval route.

Approval required:

- Inbox itself does not finalize high-risk approvals.
- It can route to Approval Center with selected id.

Audit required:

- read/unread is user activity, lower audit severity.
- snooze and follow-up task creation are audit entries.
- approval decisions must be audited in Approval Center.

## 空态、loading、error、reconnect、dedupe 行为

| State | Behavior |
|---|---|
| Empty | show last sync time and active filters |
| Loading | skeleton rows preserve list width |
| Error | retry list, keep selected cached detail if present |
| Reconnect | show stale badge; new message insert pauses if user is reading |
| Dedupe | same `event_id` maps to one inbox message |

## 可复用现有代码

- `AgentPanel` notification patterns.
- `AgentRunHistory` event summary styling.
- Existing badge/button/card primitives.

## 实现任务

1. Create inbox route and message list/detail split.
2. Define message type mapping from agent events.
3. Implement filters and priority sorting.
4. Wire realtime message insertion with read-position protection.
5. Implement read, unread and snooze mutations.
6. Add route handoffs to signals, approvals, tasks, rules and learning.

## 功能验收标准

- User can see new signal, risk warning, approval required, task failed and learning summary messages.
- Critical messages are visually prioritized.
- Approval message opens full approval detail instead of inline shallow approval.
- Duplicate realtime event does not create duplicate inbox item.
- User can mark read/unread and snooze allowed message types.

## 设计交互验收标准

- Inbox is dense and operational, not email-like clutter.
- Priority is visible through icon, text and color.
- Detail panel keeps linked evidence and next action above fold.
- Filters do not take over the first viewport.

## 测试场景

- Unit test event-to-message mapping.
- Component test critical sorting and filter behavior.
- Component test approval message action route.
- Playwright flow: receive message event, open detail, mark read, open linked signal.
