# 00 Tech Stack and Frontend Architecture

## Goal

Define the frontend stack, directory shape, state ownership, polling/stream strategy and boundary between Web Cockpit, Agent Core and model calls.

**Implementation status:** see [00-implementation-status.md](./00-implementation-status.md).

## Non-goals

- Do not define Agent Core strategy logic.
- Do not define backend persistence.
- Do not build a trading execution UI.
- Do not introduce LangGraph or LangChain for the first frontend version.
- Do not turn browser state into the source of truth for signals or learning.

## Stack Decision

与 `apps/trader-cockpit` 当前实现一致：

| Layer | Default | Status |
|---|---|---|
| Runtime | Next.js 15 App Router | done |
| Language | TypeScript | done |
| UI | HeroUI v3 (`@heroui/react` + `@heroui/styles`) | done |
| Icons | lucide-react | done |
| Server state | TanStack Query | done |
| UI state | Zustand | done |
| i18n | react-i18next + `resources.json` | done |
| Chat/model call | Next.js API route calling DeepSeek direct | **pending** |
| Table | HeroUI Table | done |
| Financial chart | Mock chart (`MockMarketChart`) | done（TradingView 后续） |
| Statistical chart | inline mock / stateless | pending |
| Forms | local state + HeroUI inputs | done（Settings 轻量） |
| Validation | adapter types in `adapter.ts` | done |
| Testing | `test/trader-cockpit-phase0.test.mjs` static checks | done（Playwright pending） |

历史文档曾写 shadcn/ui、TanStack Table、React Hook Form + Zod、TradingView — 第一版实际选用 HeroUI v3，见上表。

## Architecture Principles

1. App Router owns route composition and API route boundaries.
2. TanStack Query owns server data, polling, stale state and invalidation.
3. Zustand owns only UI preferences and selections.
4. Polling updates query caches; stream parts append to chat runtime state.
5. Frontend renders Agent Core outputs; it does not compute market decisions.
6. Next.js model route can aggregate read-only context; it cannot mutate Agent Core objects.
7. Missing backend contracts are represented as adapter fallback, not hidden component logic.

## Recommended Directory Shape

当前代码结构（已实现部分标注 ✓）：

```text
apps/trader-cockpit/
  app/
    cockpit/                          ✓
      dashboard/live/page.tsx         ✓
      signals/page.tsx                  ✓
      chat/page.tsx                     ✓
      inbox/page.tsx                    ✓
      playbook-theories/page.tsx        ✓
      learning/page.tsx                 ✓
      settings/page.tsx                 ✓
    api/
      agent-chat/route.ts               pending
  components/
    cockpit/
      shell/                            ✓ CockpitShell
      dashboard/                        ✓ LiveDashboard
      signals/                          ✓ SignalsWorkspace
      chat/                             ✓ AgentConsoleWorkspace, AgentChatDock, …
      inbox/                            ✓ AgentInbox
      timeline/                         ✓ AgentActionTimeline
      playbook-theories/                ✓
      learning/                         ✓
      settings/                         ✓
      charts/                           ✓ MockMarketChart
      states/                           ✓ StateBlock
      ui/                               ✓ CockpitSelect
      activity-graph/                   pending (Phase 0D-2)
  lib/
    cockpit/
      adapter.ts                        ✓
      mock-adapter.ts                   ✓
      real-readonly-adapter.ts          pending
      fixtures.ts + fixtures.json       ✓
      query-keys.ts                     ✓
      use-cockpit-ui-store.ts           ✓
      providers.tsx                     ✓
      polling.ts                        pending
    i18n/                               ✓
```

## Dependency Boundaries

| Boundary | Rule |
|---|---|
| `app/(cockpit)` | route composition only |
| `app/api/agent-chat` | read-only context aggregation and DeepSeek direct call |
| `components/cockpit/*` | UI composition, query hooks and local interactions |
| `components/ui/*` | reusable shadcn primitives |
| `lib/cockpit/adapter.ts` | stable view-model interface |
| `lib/cockpit/real-readonly-adapter.ts` | existing Agent Core read endpoints only |
| `lib/cockpit/mock-adapter.ts` | fallback for missing read contracts |
| `lib/cockpit/polling.ts` | interval defaults, manual refresh and stale handling |
| `lib/cockpit/schemas.ts` | Zod schemas for view models and API parts |
| `lib/cockpit/use-cockpit-ui-store.ts` | UI-only state |

## State Model

| State type | Owner | Examples |
|---|---|---|
| API/read model data | TanStack Query | signals, market snapshot, agent events, theories, learning |
| Streaming message parts | chat runtime + component state | assistant text, tool part, evidence card, source card |
| Polling metadata | TanStack Query + polling helper | interval, last refresh, stale |
| UI preferences | Zustand | sidebar collapsed, density, selected symbol, selected signal id |
| Form drafts | React Hook Form | settings preferences only |

API response data must not be copied into Zustand. Store ids and UI flags only.

## Query Key Conventions

```ts
export const cockpitKeys = {
  status: () => ["cockpit", "agent-status"],
  dashboard: (scope: DashboardScope) => ["cockpit", "dashboard", scope],
  marketSnapshot: (scope: MarketScope) => ["cockpit", "market-snapshot", scope],
  signals: (filters: SignalFilters) => ["cockpit", "signals", filters],
  signal: (id: string) => ["cockpit", "signal", id],
  signalExplanation: (id: string) => ["cockpit", "signal-explanation", id],
  agentEvents: (filters: EventFilters) => ["cockpit", "agent-events", filters],
  agentRuns: (filters: RunFilters) => ["cockpit", "agent-runs", filters],
  playbookTheories: (filters: TheoryFilters) => ["cockpit", "playbook-theories", filters],
  learning: (filters: LearningFilters) => ["cockpit", "learning", filters],
  knowledgeSearch: (input: KnowledgeSearchInput) => ["cockpit", "knowledge-search", input],
};
```

## Polling And Stream Strategy

| Surface | Strategy |
|---|---|
| dashboard | polling default 1 minute; user can switch to 5/15 minutes or manual |
| signals | polling default 1 minute; manual refresh |
| inbox | polling default 1 minute; unread state local |
| playbook theories | fetch on page entry and manual refresh |
| learning | fetch on page entry and manual refresh |
| chat | stream response from `/api/agent-chat` |

WebSocket can be introduced later through the same adapter/query boundaries.

## DeepSeek Route Boundary

`/api/agent-chat` may:

- fetch read-only context from Agent Core;
- call DeepSeek direct with an API key stored server-side;
- validate request and response shape with Zod;
- return stream parts with source/tool/evidence metadata.

It must not:

- create or mutate signals;
- create or mutate PlaybookTheory or PlaybookRule;
- write learning proposals;
- trigger order or execution actions.

## API Client Requirements

- Parse responses with Zod when schemas exist.
- Normalize errors to `CockpitError`.
- Surface fallback state when contracts are missing.
- Preserve request id or trace id when backend provides it.
- Never expose secrets or raw tool credentials to client code.

## Implementation Tasks

1. Create or repair first-version route group.
2. Add adapter interfaces and real-readonly/mock implementations.
3. Add query key factory and polling helper.
4. Add tag and status schema.
5. Add DeepSeek chat API route boundary.
6. Add shared state components.
7. Add route smoke and adapter tests.

## Acceptance

- Route shell mounts only first-version routes.
- Read-only backend calls stay inside adapter or chat API route.
- Polling and fallback behavior are testable without page-specific custom logic.
- No order, execution, approval-center or task-center dependency exists in first-version architecture.

## Tests

- Unit test query key factory.
- Unit test adapter fallback behavior.
- Unit test normalized errors.
- Component test cockpit shell with fresh/stale/fallback states.
- Playwright smoke test route navigation across first-version routes.
