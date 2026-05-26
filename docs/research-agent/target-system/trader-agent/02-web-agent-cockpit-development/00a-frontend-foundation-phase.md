# 00a Frontend Foundation Phase

## Decision

The first frontend phase uses a real-readonly-first adapter with mock fallback.

This is not an end-to-end trading MVP. It is the UI, routing, state, polling, chat stream and adapter foundation for Agent Market Cockpit.

## Why

`01-agent-core` now exposes useful read endpoints, but not the full Cockpit read model. A mock-only frontend would drift away from real backend constraints, while a full contract integration would overpromise missing APIs.

The correct first phase is:

1. Use real backend endpoints where they exist.
2. Use mock fallback for missing read models.
3. Keep view models stable so missing backend contracts can be filled later.
4. Avoid all write, execution and approval-center flows.

## Phase 0 Scope

| Area | Build now | Backend dependency |
|---|---|---|
| App shell | route group, left nav, top bar, dense cockpit grid | No |
| Adapter | real-readonly methods + mock fallback | Partial |
| Status | real `/api/agent/status` | Yes |
| Events/timeline | real `/api/agent/events` where useful | Yes |
| Runs | real `/api/agent/runs` and detail | Yes |
| Signal explanation | real `/api/agent/signals/{id}/explanation` when id exists | Yes |
| Knowledge evidence | real `/api/knowledge/search` | Yes |
| Signals list/detail | provisional view model | Mock fallback |
| Market snapshot/gate | provisional view model | Mock fallback |
| Playbook theories | provisional view model | Mock fallback |
| Learning items | provisional view model | Mock fallback |
| Chat | Next.js API route + read-only context + DeepSeek direct | Partial |
| Chart | Lightweight Charts wrapper with mock OHLC and signal markers | No |
| Settings | local display preferences and lightweight Tool Settings | No |

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

| Route | Phase 0 behavior |
|---|---|
| `/dashboard/live` | render market intent, watchlist, signals, chart/evidence, Agent status |
| `/signals` | render signals, scenario plans, status, tag, trigger and invalidation states |
| `/chat` | stream Agent explanation with tool-source and evidence parts |
| `/inbox` | render Agent notifications from signal, market gate, risk and learning categories |
| `/playbook-theories` | render theory list/detail, rule array and current matched signals |
| `/learning` | render only meaningful new theory/rule/low-confidence/reflection items |
| `/settings` | render local preferences and readonly Tool Settings |

## Adapter Boundary

Every data-backed page must depend on an adapter interface, not fixture imports inside components.

```ts
export interface CockpitDataAdapter {
  getAgentStatus(): Promise<AgentStatusViewModel>;
  listAgentEvents(input: AgentEventListInput): Promise<AgentEventListViewModel>;
  listAgentRuns(input: AgentRunListInput): Promise<AgentRunListViewModel>;
  getAgentRun(runId: string): Promise<AgentRunDetailViewModel>;
  getSignalExplanation(signalId: string): Promise<SignalExplanationViewModel>;
  searchKnowledge(input: KnowledgeSearchInput): Promise<KnowledgeSearchViewModel>;
  listSignals(input: SignalListInput): Promise<SignalListViewModel>;
  getMarketSnapshot(input: MarketSnapshotInput): Promise<MarketSnapshotViewModel>;
  listPlaybookTheories(input: TheoryListInput): Promise<PlaybookTheoryListViewModel>;
  listLearningItems(input: LearningInput): Promise<LearningItemListViewModel>;
}
```

Rules:

- Components consume view models, not raw backend DTOs.
- Real adapter methods are used only for existing read endpoints.
- Mock fallback is explicit when a contract is missing.
- Provisional fields stay inside adapter, schemas or fixture files.
- Route components do not import fixture files directly.

## Mock Fixture Rules

Required fixture scenarios:

- empty signal list
- active opportunity signal
- invalidated signal
- `needs_more_evidence` signal
- market gate caution
- market gate block
- news event evidence
- external unverified web source
- tool call running
- tool call failed
- chat stream with text, tool, source, evidence and warning parts
- PlaybookTheory with multiple rules
- new theory candidate
- low-confidence learning candidate
- no-new-learning state
- stale polling response
- display-only tool settings

## Implementation Order

1. Add or repair cockpit route group and shell.
2. Add shared shadcn primitives needed by current routes.
3. Add cockpit design tokens and tag semantic tokens.
4. Add `CockpitDataAdapter`, real-readonly adapter and mock fallback adapter.
5. Add shared loading, empty, error, stale and fallback-state components.
6. Add polling helper with manual refresh and adjustable interval.
7. Add chart wrapper with mock OHLC, volume and signal markers.
8. Add timeline/inbox primitives.
9. Add chat UI shell with DeepSeek route boundary and mock stream fallback.
10. Add first-version routes.
11. Add route smoke, component state tests and static fixture-import check.

## Acceptance Criteria

- First-version routes mount without requiring missing backend contracts.
- Existing read endpoints are used through adapter methods where available.
- Missing contracts show explicit fallback state.
- No component imports mock fixture data directly.
- Chat stream supports text, tool, source, evidence, warning and error parts.
- Signal UI shows status, tags, trigger conditions, invalidation conditions and evidence.
- Dashboard shows chart, watchlist, market intent, active signal list and Agent status in one viewport.
- Learning page shows no-new-learning state without manufacturing content.
- No Phase 0 code uses order-shaped objects, trading execution or standalone approval-console concepts.

## Test Plan

- Unit test query key factory stability.
- Unit test adapter fallback selection.
- Unit test polling stale state.
- Component tests for empty/loading/error/stale/fallback states.
- Component tests for tag rendering and signal status rendering.
- Component tests for chat part rendering.
- Playwright smoke test for all first-version routes.
- Static check that route components do not import fixtures directly.

## Exit Criteria

Phase 0 ends when the cockpit frontend can run with:

- real Agent Core status/events/runs/explanation/knowledge where available;
- mock fallback for missing signal list, market snapshot, theories and learning;
- no dependency on execution, approval, task or rule-editing contracts.
