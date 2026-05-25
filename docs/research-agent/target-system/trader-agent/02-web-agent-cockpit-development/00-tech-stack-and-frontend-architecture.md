# 00 Tech Stack and Frontend Architecture

## Goal

定义 Web Agent Cockpit 的前端技术栈、目录结构、状态边界、实时连接方式和依赖约束。本文是所有页面实现文档的工程基线。

## Non-goals

- 不定义 Layer 1 Agent Core 的策略逻辑。
- 不定义 Layer 3 API 的数据库实现。
- 不改造现有 `apps/research-console` 代码；最终 cockpit 新建为独立 workspace：`apps/trader-cockpit/`。
- 不选择 MUI、Ant Design、Mantine、Chakra 作为主 UI 系统。

## Stack Decision

| Layer | Default |
|---|---|
| Runtime | Next.js App Router |
| Language | TypeScript |
| UI | shadcn/ui, Radix, Tailwind |
| Icons | lucide-react |
| Server state | TanStack Query |
| UI state | Zustand |
| AI streaming | Vercel AI SDK compatible UI protocol |
| Chat component references | AI Elements, assistant-ui |
| Table | TanStack Table |
| Financial chart | TradingView Lightweight Charts |
| Statistical chart | Recharts or Tremor |
| Forms | React Hook Form + Zod |
| Validation | Zod schemas shared with API client layer |
| Testing | unit tests for adapters, component tests for critical states, Playwright for cockpit flows |

## Architecture Principles

1. App Router owns routing, server boundaries, metadata and authenticated layouts.
2. TanStack Query owns all server data, cache invalidation, pagination and refetch.
3. Zustand owns only ephemeral UI state: selected tab, panel width, drawer open state, focused signal id, local filters before commit.
4. WebSocket and SSE events update TanStack Query caches or append stream parts; they do not become a separate hidden data store.
5. Frontend does not compute trading decisions. It renders `signal`, `rule_hit`, `risk`, `approval`, `tool_call`, `learning_summary` objects from backend contracts.
6. Every write mutation routes through API client functions with Zod validation and audit metadata.

## Recommended Directory Shape

```text
apps/trader-cockpit/
  package.json
  app/
    (cockpit)/
      dashboard/live/page.tsx
      chat/page.tsx
      inbox/page.tsx
      tasks/page.tsx
      rules/page.tsx
      capabilities/page.tsx
      approvals/page.tsx
      signals/page.tsx
      playbooks/page.tsx
      journal/page.tsx
      learning/page.tsx
      settings/page.tsx
      audit/page.tsx
    api/
      agent-chat/route.ts
  components/
    cockpit/
      shell/
      dashboard/
      chat/
      inbox/
      timeline/
      tasks/
      rules/
      capabilities/
      approvals/
      signals/
      playbooks/
      journal/
      learning/
      settings/
      audit/
    ui/
  lib/
    cockpit/
      api-client.ts
      query-keys.ts
      realtime-client.ts
      schemas.ts
      permissions.ts
      audit.ts
      errors.ts
      formatters.ts
      use-cockpit-ui-store.ts
```

## Dependency Boundaries

| Boundary | Rule |
|---|---|
| `app/(cockpit)` | route composition only; no business calculation |
| `components/cockpit/*` | UI composition, TanStack hooks, interaction state |
| `components/ui/*` | reusable shadcn primitives only |
| `lib/cockpit/api-client.ts` | all REST calls and mutation headers |
| `lib/cockpit/realtime-client.ts` | WebSocket connection, SSE helper, dedupe and reconnect |
| `lib/cockpit/schemas.ts` | Zod schemas for API DTOs and event payloads |
| `lib/cockpit/query-keys.ts` | canonical TanStack Query key factory |
| `lib/cockpit/use-cockpit-ui-store.ts` | UI-only Zustand slices |

## State Model

| State type | Owner | Examples |
|---|---|---|
| API data | TanStack Query | `signals`, `agent_tasks`, `approval_requests`, `agent_events`, `learning_summaries` |
| Streaming message parts | AI SDK compatible chat runtime plus query cache snapshots | assistant text, tool part, evidence card, source citation |
| Connection metadata | realtime client + UI store | connected, reconnecting, last event time |
| UI preferences | Zustand | sidebar collapsed, table density, selected symbol, drawer open |
| Form drafts | React Hook Form | task draft, rule draft, approval comment |
| Persisted preferences | Layer 3 Configuration API | watchlist, notification preference, default timeframe |

API response data must not be copied into Zustand. A selected id in Zustand is allowed; the selected object must be resolved from Query cache.

## Query Key Conventions

Use a factory so cache invalidation is predictable:

```ts
export const cockpitKeys = {
  dashboard: (scope: DashboardScope) => ["cockpit", "dashboard", scope],
  signals: (filters: SignalFilters) => ["cockpit", "signals", filters],
  signal: (id: string) => ["cockpit", "signal", id],
  agentEvents: (filters: EventFilters) => ["cockpit", "agent-events", filters],
  tasks: (filters: TaskFilters) => ["cockpit", "tasks", filters],
  approvals: (filters: ApprovalFilters) => ["cockpit", "approvals", filters],
  rules: (filters: RuleFilters) => ["cockpit", "rules", filters],
  capabilities: () => ["cockpit", "capabilities"],
  learning: (range: DateRange) => ["cockpit", "learning", range],
};
```

## Real-time Strategy

| Channel | Use |
|---|---|
| `/ws/events` | global `agent_event.*`, rule hit, tool call, risk block, learning event |
| `/ws/signals` | `signal.created`, `signal.updated`, `signal.invalidated`, `ticket.generated` |
| `/ws/tasks` | `task.created`, `task.updated`, `task.paused`, `task.failed`, `task.completed` |
| `/ws/approvals` | `approval.created`, `approval.updated`, `approval.expired`, `approval.decided` |
| `/api/chat/stream` or Layer 3 SSE chat endpoint | Agent chat token stream, tool part stream, evidence/source parts |

Reconnect behavior:

- Exponential backoff capped at 30 seconds.
- Heartbeat timeout after 45 seconds without event or pong.
- On reconnect, call REST delta endpoint using last acknowledged `event_id` or `created_at`.
- Dedupe by `event_id`; for objects use `version` or `updated_at` as secondary guard.
- Surface connection state in shell, not as modal noise.

## API Client Requirements

Every request wrapper must:

- Parse response with Zod.
- Normalize API errors to `CockpitError`.
- Attach request id and audit context for write actions.
- Preserve pagination, sort and filter parameters.
- Never expose secrets or raw tool credentials to client code.

## Security Boundaries

- Browser receives capability metadata, not secrets.
- Permission checks are server authoritative.
- UI permission gates are affordance gates only.
- Approval decision mutation must include explicit user intent, comment, visible object version and request id.
- Audit log is read-only from frontend perspective.

## Implementation Tasks

1. Create `app/(cockpit)` route group and authenticated cockpit layout.
2. Add `lib/cockpit` API, schema, query key and realtime modules.
3. Add missing shadcn primitives: table, tabs, sheet, dialog, popover, dropdown-menu, toast/sonner, skeleton, tooltip, scroll-area.
4. Add TanStack Query provider with devtools only in local development.
5. Add WebSocket provider and SSE chat helper.
6. Add cockpit UI store with only layout and selection state.
7. Add shared error, loading, empty and reconnect components.

## Acceptance

- Route shell can mount all PRD pages without mixing old research summary naming into trader cockpit.
- Server state and UI state have separate owners.
- WebSocket reconnect and event dedupe behavior is testable without each page reimplementing it.
- A page can be built by combining query hook, realtime subscription and shadcn primitives without custom one-off state architecture.

## Tests

- Unit test query key factory stability.
- Unit test event dedupe and reconnect delta request logic.
- Unit test API error normalization.
- Component test cockpit shell with connected, reconnecting and offline states.
- Playwright smoke test route navigation across all PRD routes.
