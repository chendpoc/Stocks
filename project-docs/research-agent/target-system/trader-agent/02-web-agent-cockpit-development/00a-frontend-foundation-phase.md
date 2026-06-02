# 00a Frontend Foundation Phase

## Decision

The first frontend phase uses a **mock-first adapter** with a planned real-readonly layer for Phase 1.

This is not an end-to-end trading MVP. It is the UI, routing, state, polling, chat stream and adapter foundation for Agent Market Cockpit.

## Phase Status (2026-05-27)

| Item | Status |
|---|---|
| App shell + `/cockpit/*` routes | **done** |
| HeroUI v3 + Tailwind v4 tokens | **done** |
| `CockpitDataAdapter` + mock adapter | **done** |
| real-readonly adapter | **pending** (Phase 1) |
| Shared StateBlock loading/empty/error | **done** |
| Mock chart | **done** |
| Chat mock stream + floating dock | **done** |
| DeepSeek API route | **pending** |
| Playwright smoke | **pending** |

详细清单见 [00-implementation-status.md](./00-implementation-status.md)。

## Why

`01-agent-core` now exposes useful read endpoints, but not the full Cockpit read model. A mock-only frontend would drift away from real backend constraints, while a full contract integration would overpromise missing APIs.

The correct first phase is:

1. Use real backend endpoints where they exist (**Phase 1**).
2. Use mock fallback for missing read models (**Phase 0 — current**).
3. Keep view models stable so missing backend contracts can be filled later.
4. Avoid all write, execution and approval-center flows.

## Phase 0 Scope

| Area | Build now | Backend dependency | Status |
|---|---|---|---|
| App shell | route group, left nav, top bar, dense cockpit grid | No | done |
| Adapter | mock methods; real-readonly deferred | Partial | mock done |
| Status | runtime pills in shell (mock local) | No | done |
| Events/timeline | mock via adapter | Mock | done |
| Runs | not in current adapter surface | Gap | pending Phase 1 |
| Signal explanation | via signal detail mock | Mock | done |
| Knowledge evidence | not in current adapter surface | Gap | pending Phase 1 |
| Signals list/detail | view model + fixtures | Mock fallback | done |
| Market intent / gate | `getMarketIntentExplanation` | Mock fallback | done |
| Today Focus Queue | `listTodayFocus` (v5 extension) | Mock fallback | done |
| Playbook theories | mock | Mock fallback | done |
| Learning items | mock | Mock fallback | done |
| Chat | mock stream + dock; DeepSeek route pending | Partial | partial |
| Chart | MockMarketChart | No | done |
| Settings | local preferences + Tool Settings | No | done |
| Agent Console 0D-1 | `getAgentConsole` | Mock | done |

## Not in Phase 0

- order flow
- broker execution
- simulated account trading
- order-shaped objects
- standalone human approval console
- task creation or scheduler UI
- standalone capability management console
- standalone rule editor
- standalone historical规律浏览库
- journal entry creation
- standalone audit center
- WebSocket Event Bus requirement

## First-Version Pages

| Route | Phase 0 behavior | Status |
|---|---|---|
| `/cockpit/dashboard/live` | market intent strip, Today Focus Queue, chart, drawer detail | done |
| `/cockpit/signals` | signals, scenario plans, status, tag, trigger and invalidation | done |
| `/cockpit/chat` | Agent Console (0D-1); mock context | done |
| `/cockpit/inbox` | notifications from signal, gate, risk, learning | done |
| `/cockpit/playbook-theories` | theory list/detail, rules, matched signals | done |
| `/cockpit/learning` | meaningful new items only | done |
| `/cockpit/settings` | preferences + readonly Tool Settings | done |

## Adapter Boundary

当前 `CockpitDataAdapter`（见 `apps/trader-cockpit/lib/cockpit/adapter.ts`）：

```ts
export interface CockpitDataAdapter {
  listSignals(input?: SignalListInput): Promise<SignalListViewModel>;
  getMarketIntentExplanation(): Promise<MarketIntentExplanationViewModel>;
  listTodayFocus(input?: TodayFocusListInput): Promise<TodayFocusListViewModel>;
  getSignal(input: SignalDetailInput): Promise<SignalDetail>;
  listInboxMessages(input?: InboxInput): Promise<InboxMessageListViewModel>;
  listAgentEvents(input?: AgentEventInput): Promise<AgentEventListViewModel>;
  listPlaybookTheories(input?: TheoryListInput): Promise<PlaybookTheoryListViewModel>;
  listLearningItems(input?: LearningInput): Promise<LearningItemListViewModel>;
  getToolSettings(): Promise<ToolSettingsViewModel>;
  streamChat(input: ChatStreamInput): AsyncIterable<ChatStreamPart>;
  getAgentConsole(input?: AgentConsoleInput): Promise<AgentConsoleViewModel>;
}
```

Phase 1 将补充 Agent Core 只读方法（status、runs、explanation by id、knowledge search）及 `real-readonly-adapter.ts`。详见 [01-agent-core-to-cockpit-contract-gap-review.md](./01-agent-core-to-cockpit-contract-gap-review.md)。

Rules:

- Components consume view models, not raw backend DTOs.
- Real adapter methods are used only for existing read endpoints.
- Mock fallback is explicit when a contract is missing.
- Provisional fields stay inside adapter, schemas or fixture files.
- Route components do not import fixture files directly.

## Mock Fixture Rules

Required fixture scenarios — **implemented** in `fixtures.json`（由 phase0 tests 校验）。

## Implementation Order

Original order — annotated with current status:

1. Add or repair cockpit route group and shell. — **done**
2. Add shared UI primitives (HeroUI). — **done**
3. Add semantic tokens and tag colors. — **done**
4. Add `CockpitDataAdapter` + mock adapter. — **done**（real-readonly pending）
5. Add shared loading, empty, error states. — **done**
6. Add polling helper with manual refresh. — **partial**（各 page useQuery，无独立 polling.ts）
7. Add chart wrapper. — **done**（mock）
8. Add timeline/inbox primitives. — **done**
9. Add chat UI + DeepSeek route boundary. — **partial**（UI done，API route pending）
10. Add first-version routes. — **done**
11. Add route smoke, component state tests. — **partial**（node tests done，Playwright pending）

## Acceptance Criteria

Phase 0 **core UI criteria met**. Remaining gaps:

- Real-readonly adapter not wired.
- `POST /api/agent-chat` not implemented.
- Playwright smoke not added.
- Phase 0 static test assertions have been synchronized with the layout refactor（历史记录见 [plans/00-fix-phase0-test-drift.md](./plans/00-fix-phase0-test-drift.md)）.

## Exit Criteria

Phase 0 **UI foundation** 已达成：cockpit 可在 mock 数据下运行全部第一版路由。

Phase 0 **完整 exit**（含 real-readonly + chat API）移至 Phase 1，见 [00-implementation-status.md](./00-implementation-status.md) §10。

## Development Process

后续任务必须先写 [plans/](./plans/) 计划文档，见 [00-development-workflow.md](./00-development-workflow.md)。
