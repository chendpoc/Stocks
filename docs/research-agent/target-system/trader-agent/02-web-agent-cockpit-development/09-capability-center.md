# 09 Capability Center

## 目标与非目标

目标：

实现 `/capabilities`，用于查看、配置和申请 Agent 可用能力。Capability Center 是 Tool Gateway、权限、速率限制和审批策略的可视化控制面。

非目标：

- 不在前端保存 API key 或 secrets。
- 不直接调用外部工具。
- 不绕过 Tool Gateway 的 permission check、rate limit 和 approval check。

## 对应 PRD 范围

对应 `02-web-agent-cockpit-prd.md` section 9：Capability Center。

Capability 分类：

- market data
- news search
- semantic search
- chart analysis
- signal generation
- ticket generation
- learning

权限级别：

- disabled
- read-only
- low-risk auto
- approval-required
- admin-only

## 页面/组件拆分

| Component | Responsibility |
|---|---|
| `CapabilityCenterPage` | route composition |
| `CapabilityGrid` | category cards and status |
| `CapabilityTable` | dense permission and rate table |
| `CapabilityDetailDrawer` | scope, policies, limits, recent use |
| `CapabilityPolicyPanel` | allowed tasks, blocked tasks, approval rules |
| `CapabilityRequestDialog` | enable/disable/upgrade request |
| `CapabilityUsageTimeline` | recent tool use and blocked attempts |

## 数据输入输出

Inputs:

- `agent_capabilities`
- `tool_call_logs`
- `agent_tasks`
- `approval_requests`
- `audit_logs`

Outputs:

- request enable capability
- request disable capability
- request permission level upgrade
- edit policy draft when permitted
- open linked approval and audit entries

## API、WebSocket、SSE 事件

REST:

- `GET /api/capabilities`
- `GET /api/capabilities/{capability_id}`
- `POST /api/capabilities/{capability_id}/request-enable`
- `POST /api/capabilities/{capability_id}/request-disable`
- `POST /api/capabilities/{capability_id}/request-permission-level`
- `GET /api/capabilities/{capability_id}/usage`
- `GET /api/audit?object_type=capability`

Realtime:

- `/ws/events`: `capability.used`, `capability.blocked`, `agent.tool_call_started`, `agent.tool_call_finished`
- `/ws/approvals`: `approval.created`, `approval.updated`, `approval.decided`

SSE:

- Not required.

## TanStack Query key 与 Zustand UI state 边界

TanStack Query:

- `cockpitKeys.capabilities()`
- `["cockpit", "capability", capabilityId]`
- `["cockpit", "capability-usage", capabilityId, filters]`
- `cockpitKeys.approvals({ objectId: capabilityId })`

Zustand UI state:

- selected capability id
- detail drawer open
- request dialog open
- active category filter
- table density

## 用户交互流程

1. User opens `/capabilities`.
2. Capability grid shows status and permission level by category.
3. User selects a capability.
4. Drawer shows policy, allowed tasks, blocked tasks, rate limit and recent usage.
5. User requests enable/disable/upgrade.
6. Dialog shows reason, scope, risk and approval requirement.
7. Mutation creates approval request when required.
8. Capability state updates through approval event after decision.

## 权限、审批、审计要求

Required permissions:

- `enable_capability` for enable, disable and upgrade requests.
- `view_audit` for audit expansion.

Approval required:

- enabling external search, ticket generation, high-risk market tools.
- upgrading from read-only to auto mode.
- widening allowed task scope.

Audit required:

- permission change request.
- approval decision.
- tool usage.
- blocked tool attempt.
- rate limit policy change.

## 空态、loading、error、reconnect、dedupe 行为

| State | Behavior |
|---|---|
| Empty | show platform configuration missing and admin path |
| Loading | grid/table skeleton |
| Error | retry with request id |
| Reconnect | keep current permissions visible, disable mutation buttons |
| Dedupe | capability state updates by version |

## 可复用现有代码

- `AgentToolPolicy`: reuse as policy display base.
- `AgentRunHistory`: reuse recent usage pattern.
- Shared badge and drawer primitives.

## 实现任务

1. Create `/capabilities` route.
2. Build capability grid and table.
3. Build detail drawer with policy, rate and usage sections.
4. Build request dialog with approval preview.
5. Wire capability request mutations.
6. Subscribe to capability and approval events.
7. Add audit links for changes and blocked use.

## 功能验收标准

- User can see all PRD capability categories.
- User can identify permission level and approval requirement for each capability.
- User can request enable/disable/upgrade with visible reason and scope.
- Tool usage and blocked attempts are visible.
- Secrets are never displayed.

## 设计交互验收标准

- Capability status is legible in grid and table modes.
- High-risk capabilities are visually distinct without alarm fatigue.
- Request dialog explains impact before submission.
- Recent usage timeline makes tool behavior auditable.

## 测试场景

- Unit test permission level display mapping.
- Component test high-risk request creates approval handoff.
- Component test secrets are not rendered from capability payload.
- Playwright flow: open capability, request upgrade, see approval link.
