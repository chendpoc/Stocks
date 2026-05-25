# 06 Agent Action Timeline

## 目标与非目标

目标：

实现 Agent Action Timeline，作为 dashboard 嵌入面板和独立分析视图的共享模块。Timeline 负责把 `agent_events` 变成可过滤、可回放、可审计的动作序列。

非目标：

- 不替代 audit log 的不可变审计记录。
- 不把 timeline 当作聊天记录。
- 不在前端推断未记录的 Agent 动机。

## 对应 PRD 范围

对应 `02-web-agent-cockpit-prd.md` section 6：Agent Action Timeline。

展示动作：

- observe market
- detect setup
- rule hit
- score signal
- risk check
- generate ticket
- call tool
- request approval
- learn from outcome

## 页面/组件拆分

| Component | Responsibility |
|---|---|
| `AgentTimelinePanel` | reusable embedded panel |
| `AgentTimelinePage` | optional full-page route or tab composition |
| `TimelineFilterBar` | object, type, actor, severity, time range |
| `TimelineEventRow` | compact event rendering |
| `TimelineEventDetail` | payload, evidence, linked audit |
| `TimelineCorrelationGroup` | group by signal, task, approval or trace id |
| `TimelineLiveMarker` | live/reconnect/stale indicator |

## 数据输入输出

Inputs:

- `agent_events`
- linked `signals`
- linked `agent_tasks`
- linked `approval_requests`
- linked audit entries

Outputs:

- select event
- open linked object
- copy event id or trace id
- filter by correlation id
- open audit entry

## API、WebSocket、SSE 事件

REST:

- `GET /api/agent-events`
- `GET /api/agent-events/{event_id}`
- `GET /api/audit?object_id={object_id}`

Realtime:

- `/ws/events`: all `agent.*`, `rule.hit`, `capability.*`, `learning.*`
- `/ws/signals`: `signal.*`, `ticket.generated`
- `/ws/tasks`: `task.*`
- `/ws/approvals`: `approval.*`

SSE:

- Chat tool parts can link into timeline after persisted `agent_events` are available.

## TanStack Query key 与 Zustand UI state 边界

TanStack Query:

- `cockpitKeys.agentEvents(filters)`
- `["cockpit", "agent-event", eventId]`
- linked object query keys

Zustand UI state:

- selected event id
- grouped or flat display mode
- live follow enabled
- filter drawer open

## 用户交互流程

1. Timeline loads with latest events.
2. User filters by signal, task, approval, actor or event type.
3. User selects event row.
4. Detail panel shows payload summary, evidence, linked object and audit link.
5. When live follow is enabled, new events append and scroll follows.
6. When user manually scrolls up or selects detail, live append does not steal focus.

## 权限、审批、审计要求

Required permissions:

- `view_signal` for linked signal details.
- `view_audit` for audit link expansion.

Approval required:

- Timeline never approves directly.

Audit required:

- Timeline itself is read-only.
- Exporting event data requires `export_data` and audit entry.

## 空态、loading、error、reconnect、dedupe 行为

| State | Behavior |
|---|---|
| Empty | show active filters and last event time |
| Loading | fixed-height skeleton rows |
| Error | retry and request id |
| Reconnect | pause live follow, show catching-up state |
| Dedupe | `event_id` unique; if same object version appears twice, keep first event and latest detail |

## 可复用现有代码

- Existing `AgentTimeline` component concept.
- Existing run history components for compact event rows.
- Shared reconnect badge from cockpit shell.

## 实现任务

1. Extract timeline as reusable module under `components/cockpit/timeline`.
2. Implement event type icon and severity mapping.
3. Implement grouped and flat view modes.
4. Wire filters to query key.
5. Subscribe to realtime channels and append events with dedupe.
6. Link detail panel to signals, tasks, approvals, capabilities and audit.

## 功能验收标准

- User can see all PRD-required Agent action types.
- Timeline can filter by signal, task, approval and event type.
- Live updates append without stealing focus from selected detail.
- Every event row can reveal timestamp, actor, event id, object id and payload summary.
- Timeline links to audit when audit exists.

## 设计交互验收标准

- Timeline uses compact terminal-like rows.
- Severity and type are visible through icon, label and color.
- Grouping makes a signal lifecycle easy to scan.
- Detail panel is readable without expanding every raw JSON field by default.

## 测试场景

- Unit test event type mapping.
- Unit test realtime append dedupe.
- Component test live follow pause when user selects event.
- Playwright flow: filter timeline by selected signal and open linked audit.
