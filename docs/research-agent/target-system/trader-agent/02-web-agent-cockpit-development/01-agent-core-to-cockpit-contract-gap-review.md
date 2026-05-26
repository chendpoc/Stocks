# 01 Agent Core to Cockpit Contract Gap Review

## Goal

Map the current `01-agent-core` backend surface to the first-version Agent Market Cockpit requirements. This file is the handoff checkpoint before replacing mock data with real read-only data.

## Current Backend Surface

Observed in `apps/trader-agent/backend/app/api/agent.py`:

| Endpoint | Current use |
|---|---|
| `GET /health` | service health |
| `GET /api/agent/status` | runtime status |
| `POST /api/agent/run-scan` | run scan; write/action endpoint, not first-version UI default |
| `POST /api/agent/run-symbol/{symbol}` | run symbol; write/action endpoint, not first-version UI default |
| `GET /api/agent/runs` | list agent runs |
| `GET /api/agent/runs/{run_id}` | inspect run detail |
| `GET /api/agent/events` | list agent events with filters |
| `GET /api/agent/signals/{signal_id}/explanation` | read signal explanation |
| `POST /api/knowledge/reindex` | reindex local knowledge; not first-version UI default |
| `GET /api/knowledge/search` | read local knowledge search results |

## First-Version Cockpit Needs

| Cockpit need | Current support | First-version action |
|---|---|---|
| agent status | supported | real adapter |
| agent event timeline | supported | real adapter |
| run history | supported | real adapter |
| signal explanation | supported by id | real adapter when signal id exists |
| knowledge evidence search | supported | real adapter |
| signal list | gap | mock fallback or derive from runs/events only if stable |
| signal detail | partial | mock fallback plus explanation endpoint |
| market snapshot | gap | mock fallback |
| market gate | gap | mock fallback |
| learning summary | gap | mock fallback |
| PlaybookTheory list/detail | gap | mock fallback |
| ScenarioPlan persistence | gap | local/mock only; no backend write |
| chat stream | gap | Next.js API route with read-only context |
| post validation | gap | backlog |

## Integration Rules

- Web must not call run-scan/run-symbol automatically from dashboard refresh.
- Web must not create or mutate signals in first version.
- Web must not create rules or learning proposals directly.
- Web can use current backend endpoints to fetch read-only status, events, runs, explanations and knowledge evidence.
- Any first-version page that needs missing data must use the `CockpitDataAdapter` with mock fallback.
- DeepSeek chat route can aggregate read-only context, but cannot write Agent Core objects.

## Required Adapter Shape

```ts
interface CockpitDataAdapter {
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

The first six methods can use real backend endpoints now. The remaining methods need mock fallback until the backend contract exists.

## Missing Contracts For Phase 1

1. `GET /api/signals`
2. `GET /api/signals/{signal_id}`
3. `GET /api/market/snapshot`
4. `GET /api/market/gate`
5. `GET /api/playbook-theories`
6. `GET /api/playbook-theories/{theory_id}`
7. `GET /api/learning`
8. `GET /api/learning/{item_id}`
9. read-only chat context aggregation endpoint or stable adapter contract
10. polling delta endpoint for dashboard/inbox/signals

## Acceptance

- First-version frontend can run with real `status/events/runs/explanation/knowledge` and mock fallback for missing objects.
- No first-version route depends on an unimplemented backend write endpoint.
- Gap status is visible in code comments or adapter metadata, not hidden inside components.
- This document is updated before any Phase 1 contract integration work.
