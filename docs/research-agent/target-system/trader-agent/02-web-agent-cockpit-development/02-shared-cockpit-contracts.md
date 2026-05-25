# 02 Shared Cockpit Contracts

## Goal

定义所有 Web Agent Cockpit 页面共享的数据、事件、权限、审批、审计、错误和状态约束。模块文档只能在本文基础上收窄，不能绕过这些契约。

## Source Scope

- `02-web-agent-cockpit-prd.md` section 15: Web Cockpit event handling.
- `03-shared-platform-roadmap-prd.md`: REST API Gateway, WebSocket Event Bus, SSE Streaming Layer, Auth, Audit, Error Handling.
- Shared database objects: `signals`, `trade_tickets`, `agent_messages`, `agent_events`, `agent_tasks`, `agent_rules`, `agent_capabilities`, `approval_requests`, `human_feedback`, `learning_summaries`.

## Core Object Contracts

| Object | Owner | Frontend use |
|---|---|---|
| `Signal` | Layer 1 / Layer 3 | display, filter, inspect, status transition request |
| `TradeTicket` | Layer 1 | read draft, request approval, show conditions |
| `AgentEvent` | Layer 1 / Layer 3 | timeline, audit context, live feed |
| `AgentTask` | Layer 3 Scheduler | create, pause, resume, cancel, inspect run history |
| `AgentRule` | Layer 1 / Layer 3 | edit draft, simulate, version, submit approval |
| `AgentCapability` | Layer 3 Tool Gateway | view and request permission changes |
| `ApprovalRequest` | Layer 3 Approval Service | approve, reject, request changes, expire |
| `AgentMessage` | Chat service | render stream, history and source references |
| `HumanFeedback` | Journal / Learning | feedback input and learning evidence |
| `LearningSummary` | Reflection Engine | daily summary, weekly proposal, rule improvements |

## REST API Groups

| Group | Required operations |
|---|---|
| Market API | get market gate, snapshots, watchlist setup board |
| Signals API | list, detail, status history, evidence, ticket draft |
| Tickets API | read ticket draft, submit approval request |
| Playbooks API | list, detail, case history, linked signals |
| Tasks API | list, detail, create, pause, resume, cancel, run history |
| Rules API | list, detail, draft, validate, simulate, submit version |
| Capabilities API | list, detail, request enable/disable, permission history |
| Approvals API | list, detail, approve, reject, request changes |
| Learning API | list summaries, detail, linked events, accept proposal |
| Chat API | stream message, get history, stop generation, retry |
| Audit API | list audit entries, filter by object and actor |
| Config API | read user cockpit preferences and workspace configuration |

All write APIs require:

- authenticated actor
- permission check
- object version or last known `updated_at`
- idempotency key
- audit context
- normalized error response

## WebSocket Event Envelope

Layer 3 event bus should expose a stable envelope:

```ts
type CockpitEvent = {
  event_id: string;
  event_type: string;
  created_at: string;
  actor_type: "agent" | "user" | "system";
  object_type: "signal" | "task" | "rule" | "capability" | "approval" | "ticket" | "learning" | "tool_call" | "audit";
  object_id: string;
  version?: number;
  correlation_id?: string;
  payload: unknown;
};
```

## Required Event Types

| Event type | Primary consumers |
|---|---|
| `signal.created` | dashboard, signals, inbox, timeline |
| `signal.updated` | dashboard, signals, timeline |
| `signal.invalidated` | dashboard, signals, inbox, timeline |
| `ticket.generated` | dashboard, signals, approvals |
| `task.created` | tasks, dashboard |
| `task.updated` | tasks, timeline |
| `task.failed` | tasks, inbox, timeline |
| `task.completed` | tasks, timeline, learning |
| `rule.hit` | dashboard, signals, timeline |
| `rule.proposal_created` | learning, rules, inbox |
| `capability.used` | capabilities, timeline, audit |
| `capability.blocked` | capabilities, inbox, timeline |
| `approval.created` | approvals, inbox, dashboard |
| `approval.updated` | approvals, inbox |
| `approval.expired` | approvals, inbox, timeline |
| `approval.decided` | approvals, audit, timeline |
| `agent.message` | inbox, chat, dashboard |
| `agent.tool_call_started` | chat, timeline |
| `agent.tool_call_finished` | chat, timeline |
| `learning.summary_created` | learning, inbox |

## SSE / Streaming Contract

Agent chat stream must support:

- assistant text delta
- tool call start
- tool call args summary
- tool call result summary
- source/evidence card
- warning or low confidence part
- approval request part
- final usage and trace id
- error part
- stop acknowledgement

The UI renders each part independently. A failed tool part does not erase preceding assistant text or source cards.

## TanStack Query Boundaries

Canonical cache owners:

| Data | Query key |
|---|---|
| dashboard aggregate | `cockpitKeys.dashboard(scope)` |
| signal list | `cockpitKeys.signals(filters)` |
| signal detail | `cockpitKeys.signal(id)` |
| agent event list | `cockpitKeys.agentEvents(filters)` |
| task list | `cockpitKeys.tasks(filters)` |
| approval list | `cockpitKeys.approvals(filters)` |
| rules | `cockpitKeys.rules(filters)` |
| capabilities | `cockpitKeys.capabilities()` |
| learning | `cockpitKeys.learning(range)` |

Realtime updates should use `queryClient.setQueryData` for known objects and `invalidateQueries` when the event payload is partial.

## Zustand UI Store Boundary

Allowed:

- navigation rail collapsed
- active workspace tab
- selected symbol id
- selected signal id
- open drawer ids
- chart timeframe
- local table density
- command palette open state
- connection status summary

Forbidden:

- storing full `signals`
- storing full `approval_requests`
- storing full `agent_tasks`
- storing chat history as canonical data
- storing permission decisions
- storing secrets or API tokens

## Permission Model

Frontend checks permissions only to show or disable controls. Server remains authoritative.

| Permission | UI use |
|---|---|
| `view_signal` | signals, dashboard detail |
| `create_task` | task create form |
| `modify_rule` | rule editor and submit version |
| `enable_capability` | capability enable or permission upgrade |
| `approve_action` | approval decision buttons |
| `view_audit` | audit route and audit panels |
| `export_data` | export buttons on table pages |

## Approval Contract

Every approval detail requires:

- `approval_id`
- request type
- requested action
- actor that requested it
- affected object ids
- current object version
- reason
- scope
- risk summary
- evidence references
- expiry time and invalidation conditions
- decision history
- linked audit entries

Approval actions:

- approve
- reject
- request changes
- mark stale when version mismatch is detected

## Audit Contract

Audit log is append-only from UI perspective. It must be linked from:

- rule changes
- task changes
- capability changes
- approval decisions
- tool calls
- ticket generation
- signal status transitions
- user feedback edits

Audit entries displayed in UI need actor, action, object, before/after summary, request id, timestamp and source route.

## Error Model

Normalize errors:

```ts
type CockpitError = {
  code: string;
  message: string;
  severity: "info" | "warning" | "error" | "critical";
  retryable: boolean;
  request_id?: string;
  object_id?: string;
  remediation?: string;
};
```

UI rules:

- retryable errors show retry.
- permission errors show missing permission and request-access path if available.
- stale object errors force refresh before allowing action.
- approval expired errors disable decision buttons and show expiry reason.
- streaming errors keep prior stream parts and show retry from failed point when supported.

## Empty, Loading, Reconnect and Dedupe

| State | Required behavior |
|---|---|
| Empty | explain missing upstream object and next action |
| Loading | skeleton layout matching final density |
| Error | error panel with retry or operator path |
| Reconnecting | keep last data visible, show stale badge and disable risky writes |
| Offline | read-only mode for cached data |
| Dedupe | ignore duplicate `event_id`; apply newer object version only |

## Implementation Tasks

1. Define shared Zod schemas for objects and events.
2. Implement API client with normalized errors.
3. Implement WebSocket client with heartbeat, reconnect and delta catch-up.
4. Implement SSE chat adapter with part rendering contract.
5. Implement query key factory.
6. Implement permission and approval helpers.
7. Implement shared empty/loading/error/reconnect components.

## Acceptance

- All module docs reference these contracts rather than inventing local variants.
- Any page can state its API data, realtime events, query keys and UI state boundary.
- High-risk action display requirements are enforceable from a shared approval component.
- Failure and reconnect behavior is consistent across dashboard, chat, inbox, tasks, rules and approvals.
