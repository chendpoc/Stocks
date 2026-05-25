# 07 Task Center

## 目标与非目标

目标：

实现 `/tasks`，用于创建、查看、暂停、恢复、取消和复盘 Agent 任务。Task Center 是用户控制 Agent 主动行为的结构化入口。

非目标：

- 不在前端执行任务调度。
- 不绕过 Scheduler、Capability、Approval、Audit。
- 不把任务状态只保存在浏览器。

## 对应 PRD 范围

对应 `02-web-agent-cockpit-prd.md` section 7：Task Center。

任务类型：

- scan watchlist
- monitor signal
- run daily learning
- backtest rule
- refresh market context
- generate playbook insight

## 页面/组件拆分

| Component | Responsibility |
|---|---|
| `TaskCenterPage` | route composition |
| `TaskToolbar` | create, filters, status tabs |
| `TaskTable` | TanStack Table task list |
| `TaskDetailDrawer` | run detail, events, config, audit |
| `TaskCreateDialog` | React Hook Form + Zod task creation |
| `TaskRunHistory` | attempts, duration, failure reason |
| `TaskActionBar` | pause, resume, cancel, rerun |

## 数据输入输出

Inputs:

- `agent_tasks`
- `agent_events`
- `agent_capabilities`
- `agent_rules`
- `signals`
- `learning_summaries`

Outputs:

- create task
- pause task
- resume task
- cancel task
- rerun completed/failed task
- open linked signal/rule/learning result

## API、WebSocket、SSE 事件

REST:

- `GET /api/tasks`
- `GET /api/tasks/{task_id}`
- `POST /api/tasks`
- `POST /api/tasks/{task_id}/pause`
- `POST /api/tasks/{task_id}/resume`
- `POST /api/tasks/{task_id}/cancel`
- `POST /api/tasks/{task_id}/rerun`
- `GET /api/agent-events?task_id={task_id}`

Realtime:

- `/ws/tasks`: `task.created`, `task.updated`, `task.failed`, `task.completed`
- `/ws/events`: task-related `agent.*`, `capability.blocked`, `rule.hit`
- `/ws/approvals`: task-generated `approval.created`

SSE:

- Not required for task list; task logs are event-driven through WebSocket and REST.

## TanStack Query key 与 Zustand UI state 边界

TanStack Query:

- `cockpitKeys.tasks(filters)`
- `["cockpit", "task", taskId]`
- `cockpitKeys.agentEvents({ taskId })`
- `cockpitKeys.capabilities()`

Zustand UI state:

- selected task id
- create dialog open
- detail drawer open
- table column visibility
- local filter draft

Form state:

- `TaskCreateDialog` uses React Hook Form with Zod schema.

## 用户交互流程

1. User opens `/tasks`.
2. Task table shows status, type, schedule, scope, owner, last run and failure reason.
3. User creates a task through typed form.
4. UI validates form locally, server validates permission and capability.
5. Task appears as queued/running through WebSocket event.
6. User opens detail drawer to inspect events and run history.
7. User pauses/resumes/cancels task when permission and status allow.

## 权限、审批、审计要求

Required permissions:

- `create_task`
- task owner or admin permission for pause/resume/cancel
- `view_audit` for audit expansion

Approval required:

- task using high-risk capability.
- task scope wider than configured universe.
- task that can generate trade ticket.
- rule backtest that publishes a new version requires Rule Studio approval path.

Audit required:

- create, pause, resume, cancel, rerun.
- capability block or approval request created by task.
- failure state with retry metadata.

## 空态、loading、error、reconnect、dedupe 行为

| State | Behavior |
|---|---|
| Empty | show allowed task types and create CTA if user has permission |
| Loading | table skeleton with fixed columns |
| Error | table-level retry, preserve filter state |
| Reconnect | table remains visible, risky actions disabled |
| Dedupe | task update applies only if newer version or timestamp |

## 可复用现有代码

- `AgentRunHistory`: reuse run summary pattern.
- `AgentToolPolicy`: reuse capability and policy display ideas.
- Existing table/card/button primitives.

## 实现任务

1. Create `/tasks` route.
2. Build task schemas and create form.
3. Build TanStack Table task list with status filters.
4. Implement task detail drawer with timeline.
5. Wire create, pause, resume, cancel and rerun mutations.
6. Subscribe to task and agent event channels.
7. Add permission gates and approval handoff.

## 功能验收标准

- User can list all task types from PRD.
- User can create valid task and see it update through realtime events.
- User can pause/resume/cancel allowed task statuses.
- Task detail shows config, run history, linked events and audit.
- High-risk task creation routes to approval flow.

## 设计交互验收标准

- Table is dense and sortable without visual clutter.
- Status and failure reason are visible in list rows.
- Create form uses structured controls, not free-text-only prompt.
- Detail drawer keeps task lifecycle readable through timeline grouping.

## 测试场景

- Unit test task form schema.
- Unit test task event cache update.
- Component test permission-disabled actions.
- Playwright flow: create scan task, receive running event, pause task, inspect audit link.
