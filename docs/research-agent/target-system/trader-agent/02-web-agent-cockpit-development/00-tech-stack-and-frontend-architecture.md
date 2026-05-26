# 00 Tech Stack and Frontend Architecture

## Goal

Define the frontend stack, directory shape, state ownership, polling/stream strategy and boundary between Web Cockpit, Agent Core and model calls.

## Non-goals

- Do not define Agent Core strategy logic.
- Do not define backend persistence.
- Do not build a trading execution UI.
- Do not introduce LangGraph or LangChain for the first frontend version.
- Do not turn browser state into the source of truth for signals or learning.

## Stack Decision

| Layer | Default |
|---|---|
| Runtime | Next.js App Router |
| Language | TypeScript |
| UI | shadcn/ui, Radix, Tailwind |
| Icons | lucide-react |
| Server state | TanStack Query |
| UI state | Zustand |
| Chat/model call | Next.js API route calling DeepSeek direct |
| Table | TanStack Table |
| Financial chart | TradingView Lightweight Charts |
| Statistical chart | Recharts or Tremor |
| Forms | React Hook Form + Zod |
| Validation | Zod schemas in API/client adapter layer |
| Testing | adapter unit tests, component state tests, Playwright route smoke |

## Architecture Principles

1. App Router owns route composition and API route boundaries.
2. TanStack Query owns server data, polling, stale state and invalidation.
3. Zustand owns only UI preferences and selections.
4. Polling updates query caches; stream parts append to chat runtime state.
5. Frontend renders Agent Core outputs; it does not compute market decisions.
6. Next.js model route can aggregate read-only context; it cannot mutate Agent Core objects.
7. Missing backend contracts are represented as adapter fallback, not hidden component logic.

## Recommended Directory Shape

```text
apps/trader-cockpit/
  app/
    (cockpit)/
      dashboard/live/page.tsx
      signals/page.tsx
      chat/page.tsx
      inbox/page.tsx
      playbook-theories/page.tsx
      learning/page.tsx
      settings/page.tsx
    api/
      agent-chat/route.ts
  components/
    cockpit/
      shell/
      dashboard/
      signals/
      chat/
      inbox/
      timeline/
      playbook-theories/
      learning/
      settings/
    ui/
  lib/
    cockpit/
      adapter.ts
      real-readonly-adapter.ts
      mock-adapter.ts
      fixtures.ts
      query-keys.ts
      polling.ts
      schemas.ts
      tool-sources.ts
      tags.ts
      errors.ts
      use-cockpit-ui-store.ts
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
