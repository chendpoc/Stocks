# 10 Approval Center

## 目标与非目标

目标：

实现 `/approvals`，集中处理高风险或需要人工确认的 Agent 请求。Approval Center 是 human-in-the-loop 控制层，必须让用户在决策前看清 reason、scope、risk、evidence、expiry、失效条件和 audit trail。

非目标：

- 不提供只有一个 Approve 按钮的浅层审批。
- 不允许过期或版本不匹配的请求继续决策。
- 不把审批变成聊天里的隐式同意。

## 对应 PRD 范围

对应 `02-web-agent-cockpit-prd.md` section 10：Approval Center。

审批类型：

- enable high-risk tool
- generate ticket
- publish rule
- run broad scan
- apply learning proposal

审批动作：

- approve
- reject
- request changes

## 页面/组件拆分

| Component | Responsibility |
|---|---|
| `ApprovalCenterPage` | route composition |
| `ApprovalQueueTable` | pending/decided/expired approval list |
| `ApprovalDetailPanel` | reason, scope, risk, evidence, expiry, audit |
| `ApprovalDecisionBar` | approve, reject, request changes |
| `ApprovalEvidenceSection` | linked signal/rule/task/capability evidence |
| `ApprovalRiskSection` | risk summary and veto conditions |
| `ApprovalAuditTrail` | immutable linked audit entries |
| `ApprovalCommentForm` | required comment for reject/request changes |

## 数据输入输出

Inputs:

- `approval_requests`
- linked `signals`
- linked `trade_tickets`
- linked `agent_rules`
- linked `agent_capabilities`
- linked `agent_tasks`
- `audit_logs`

Outputs:

- approve request
- reject request
- request changes
- open linked object
- mark stale after version mismatch refresh

## API、WebSocket、SSE 事件

REST:

- `GET /api/approvals`
- `GET /api/approvals/{approval_id}`
- `POST /api/approvals/{approval_id}/approve`
- `POST /api/approvals/{approval_id}/reject`
- `POST /api/approvals/{approval_id}/request-changes`
- `GET /api/audit?object_id={approval_id}`

Realtime:

- `/ws/approvals`: `approval.created`, `approval.updated`, `approval.expired`, `approval.decided`
- `/ws/events`: object events that can stale an approval, including `signal.updated`, `rule.hit`, `capability.blocked`

SSE:

- Not required.

## TanStack Query key 与 Zustand UI state 边界

TanStack Query:

- `cockpitKeys.approvals(filters)`
- `["cockpit", "approval", approvalId]`
- linked object query keys
- `["cockpit", "audit", { objectId: approvalId }]`

Zustand UI state:

- selected approval id
- queue tab
- detail panel open
- decision dialog open
- local filter draft

Form state:

- decision comment form uses React Hook Form + Zod.

## 用户交互流程

1. User opens `/approvals`.
2. Queue shows priority, type, object, requester, expiry and stale state.
3. User selects approval.
4. Detail shows reason, scope, risk, evidence, expiry, invalidation conditions and audit history.
5. UI checks latest object version before enabling decision.
6. User chooses approve, reject or request changes.
7. Confirmation dialog shows final action summary and comment field where required.
8. Decision mutation writes audit log and updates queue through event.

## 权限、审批、审计要求

Required permissions:

- `approve_action`
- linked object view permissions
- `view_audit` for audit expansion

Approval required:

- This module handles approval; nested approval is not allowed.

Audit required:

- every decision.
- every stale/version mismatch block.
- every request changes comment.

Decision safety:

- Disable decision if request expired.
- Disable decision if affected object version differs.
- Disable decision if evidence failed to load.
- Require explicit comment for reject and request changes.

## 空态、loading、error、reconnect、dedupe 行为

| State | Behavior |
|---|---|
| Empty pending | show decided/expired tabs and source routes that create approvals |
| Loading | queue and detail skeleton |
| Error | retry; decision buttons disabled |
| Reconnect | decision buttons disabled until detail refetch succeeds |
| Dedupe | apply approval version only if newer |

## 可复用现有代码

- `AgentEvidenceDetail`: evidence section base.
- `AgentToolPolicy`: capability risk display.
- Shared dialog, sheet, badge and form primitives.

## 实现任务

1. Create `/approvals` route.
2. Build approval queue with filters and priority ordering.
3. Build detail panel with mandatory reason/scope/risk/evidence/expiry/audit sections.
4. Build decision form and mutation hooks.
5. Implement stale/version guard.
6. Subscribe to approval and linked object events.
7. Add tests for expired, stale and evidence-load failure states.

## 功能验收标准

- User can view all approval types from PRD.
- User cannot approve expired, stale or evidence-missing request.
- Approve, reject and request changes write audit entries.
- Approval detail includes reason, scope, risk, evidence, expiry and audit trail.
- Queue updates in realtime.

## 设计交互验收标准

- Approval page communicates risk before action.
- Decision buttons are visually secondary until detail is complete.
- Evidence and risk are above audit but all are visible without deep navigation.
- Expired and stale requests are unmistakable.

## 测试场景

- Unit test decision payload includes object version and idempotency key.
- Component test expired approval disables actions.
- Component test reject requires comment.
- Playwright flow: open pending approval, inspect evidence, approve, see decided state.
