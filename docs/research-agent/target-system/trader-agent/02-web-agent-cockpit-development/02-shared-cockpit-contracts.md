# 02 Shared Cockpit Contracts

## Goal

Define shared view models, event-like objects, tags, tool-source display, ScenarioPlan, PlaybookTheory and frontend state boundaries for the first-version Agent Market Cockpit.

**Source of truth for implemented types:** `apps/trader-cockpit/lib/cockpit/adapter.ts`
**Progress snapshot:** [00-implementation-status.md](./00-implementation-status.md)

## Implemented CockpitDataAdapter (2026-05-27)

当前导出 `mockCockpitAdapter as cockpitAdapter`：

| Method | View model / return |
|---|---|
| `listSignals` | `SignalListViewModel` |
| `getMarketIntentExplanation` | `MarketIntentExplanationViewModel` |
| `listTodayFocus` | `TodayFocusListViewModel` |
| `getSignal` | `SignalDetail` |
| `listInboxMessages` | `InboxMessageListViewModel` |
| `listAgentEvents` | `AgentEventListViewModel` |
| `listPlaybookTheories` | `PlaybookTheoryListViewModel` |
| `listLearningItems` | `LearningItemListViewModel` |
| `getToolSettings` | `ToolSettingsViewModel` |
| `streamChat` | `AsyncIterable<ChatStreamPart>` |
| `getAgentConsole` | `AgentConsoleViewModel` |

Phase 1 待补充：`getAgentStatus`、`listAgentRuns`、`getSignalExplanation`、`searchKnowledge` 等（见 gap review）。

## Source Scope

- `02-web-agent-cockpit-prd.md`
- [01-agent-core-to-cockpit-contract-gap-review.md](./01-agent-core-to-cockpit-contract-gap-review.md)
- Existing read endpoints from `apps/trader-agent/backend/app/api/agent.py`

## Core View Models

| Object | Owner | Frontend use |
|---|---|---|
| `AgentStatusViewModel` | Agent Core read endpoint | status panels, dashboard freshness |
| `AgentEventViewModel` | Agent Core read endpoint | timeline, inbox source, trace context |
| `AgentRunViewModel` | Agent Core read endpoint | run history and drilldown |
| `SignalViewModel` | Cockpit adapter | opportunity list, status, tags, evidence |
| `SignalExplanationViewModel` | Agent Core read endpoint | detail explanation and chat context |
| `MarketSnapshotViewModel` | Cockpit adapter | dashboard market state and watchlist |
| `ScenarioPlan` | Cockpit adapter | attention plan, not an order |
| `PlaybookTheory` | Cockpit adapter | theory library and signal explanation |
| `PlaybookRule` | child of PlaybookTheory | executable condition display |
| `LearningItemViewModel` | Cockpit adapter | meaningful new learning only |
| `ToolSourceViewModel` | Chat/tool UI | visible source and provenance |

## Signal Status

```ts
type SignalStatus =
  | "watching"
  | "waiting_trigger"
  | "near_trigger"
  | "triggered_for_attention"
  | "invalidated"
  | "needs_more_evidence";
```

## Tags

```ts
type CockpitTag =
  | "opportunity_watch"
  | "market_intent"
  | "rule_learning"
  | "news_event"
  | "risk_or_invalidation"
  | "post_validation"
  | "external_unverified";
```

Tag color is resolved through semantic tokens, not hardcoded business logic.

## ScenarioPlan

```ts
type ScenarioPlan = {
  plan_id: string;
  signal_id: string;
  summary: string;
  watch_conditions: string[];
  trigger_conditions: string[];
  invalidation_conditions: string[];
  expected_paths: string[];
  evidence_refs: string[];
  confidence: "low" | "medium" | "high";
  tags: CockpitTag[];
  validation_due?: string;
};
```

Rules:

- It is an attention plan, not an order.
- It must not include trading execution fields.
- It can include natural-language context, but structured actions stay observation-oriented.

## PlaybookTheory

```ts
type PlaybookTheory = {
  id: string;
  name: string;
  thesis: string;
  source: "zhao" | "manual" | "agent_discovered";
  source_evidence: EvidenceRef[];
  applicable_symbols: string[];
  applicable_regimes: string[];
  rules: PlaybookRule[];
  failure_modes: string[];
  current_matches: TheoryMatch[];
  validation_summary?: TheoryValidationSummary;
  confidence: "low" | "medium" | "high";
  status: "candidate" | "active" | "deprecated";
};
```

```ts
type PlaybookRule = {
  id: string;
  parentTheoryId: string;
  name: string;
  condition: string;
  effect:
    | "create_signal"
    | "update_status"
    | "increase_confidence"
    | "decrease_confidence"
    | "invalidate_signal"
    | "add_explanation";
  explain_text: string;
};
```

Rules:

- Every `PlaybookRule` must have a `parentTheoryId`.
- The UI presents theory first, rules second.
- First version is read-only.

## Tool Sources

```ts
type ToolSourceViewModel = {
  tool_name:
    | "market_snapshot"
    | "news_search"
    | "web_search"
    | "knowledge_search"
    | "rulepack_search"
    | "deepseek_chat";
  label: string;
  source_url?: string;
  retrieved_at?: string;
  confidence?: "low" | "medium" | "high";
  tags: CockpitTag[];
  summary: string;
};
```

External web/news sources must show URL when available and use `external_unverified` until verified by backend data or user review.

## Chat Stream Parts

```ts
type ChatStreamPart =
  | { type: "text_delta"; text: string }
  | { type: "tool_call_started"; tool: ToolSourceViewModel["tool_name"]; summary: string }
  | { type: "tool_call_finished"; tool: ToolSourceViewModel["tool_name"]; summary: string; sources?: ToolSourceViewModel[] }
  | { type: "evidence_card"; evidence: EvidenceRef }
  | { type: "source_card"; source: ToolSourceViewModel }
  | { type: "warning"; message: string; tags: CockpitTag[] }
  | { type: "final"; trace_id?: string; usage?: unknown }
  | { type: "error"; message: string; retryable: boolean };
```

## Agent Answer Contract

Structured answers should contain:

- conclusion
- market intent
- evidence
- trigger conditions
- invalidation conditions
- next watch
- risk or uncertainty
- tool sources

## TanStack Query Boundaries

Implemented in `apps/trader-cockpit/lib/cockpit/query-keys.ts`:

| Data | Query key |
|---|---|
| dashboard scope | `cockpitKeys.dashboard(scope)` |
| market intent | `cockpitKeys.marketIntentExplanation()` |
| today focus | `cockpitKeys.todayFocus(filters)` |
| signal list | `cockpitKeys.signals(filters)` |
| signal detail | `cockpitKeys.signal(id)` |
| inbox | `cockpitKeys.inbox(filters)` |
| agent events | `cockpitKeys.agentEvents(filters)` |
| theories | `cockpitKeys.playbookTheories(filters)` |
| learning | `cockpitKeys.learning(filters)` |
| settings | `cockpitKeys.settings()` |
| chat | `cockpitKeys.chat(conversationId)` |
| agent console | `cockpitKeys.agentConsole(filters)` |

Phase 1 pending：`status`、`marketSnapshot`、`signalExplanation`、`agentRuns`、`knowledgeSearch`。

## Zustand UI Store Boundary

Implemented in `use-cockpit-ui-store.ts`. Allowed (current):

- `navCollapsed`
- `connectionState`
- `selectedMarketContextId`
- `selectedSymbol` / `selectedSignalId`
- `chatDockMode`
- `selectedAgentWorkstreamId` / `selectedActivityNodeId` / `selectedAgentMessageId`
- polling / density preferences（settings 相关）

Forbidden:

- storing full signals as canonical data
- storing full theories as canonical data
- storing chat history as canonical data
- storing tool secrets
- storing model API keys

## Error Model

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
- missing-contract errors show mock/fallback label.
- stale polling data shows stale badge but keeps last data visible.
- streaming errors keep prior stream parts and show retry from failed point when possible.

## Acceptance

- All first-version module docs use these names instead of local variants.
- No first-version contract requires order, execution, approval-center, task-center or rule-editing flows.
- Tool sources are visible whenever model or tool output informs a conclusion.
- ScenarioPlan remains an observation plan and cannot be treated as an order.
- PlaybookTheory is the parent of PlaybookRule.
