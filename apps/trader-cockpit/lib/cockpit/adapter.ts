export type RiskLevel = "low" | "medium" | "high" | "critical";
export type SignalStatus =
  | "watching"
  | "waiting_trigger"
  | "near_trigger"
  | "triggered_for_attention"
  | "invalidated"
  | "needs_more_evidence";
export type InboxPriority = "info" | "watch" | "action_required" | "risk" | "critical";
export type AgentEventStatus = "running" | "succeeded" | "failed" | "blocked";
export type Confidence = "low" | "medium" | "high";
export type CockpitTag =
  | "opportunity_watch"
  | "market_intent"
  | "rule_learning"
  | "news_event"
  | "risk_or_invalidation"
  | "post_validation"
  | "external_unverified";

export type EvidenceRef = {
  id: string;
  title: string;
  source: string;
  timestamp: string;
  confidence: number;
};

export type RuleHit = {
  ruleId: string;
  label: string;
  severity: RiskLevel;
  summary: string;
};

export type ScenarioPlan = {
  planId: string;
  signalId: string;
  summary: string;
  watchConditions: string[];
  triggerConditions: string[];
  invalidationConditions: string[];
  expectedPaths: string[];
  evidenceRefs: string[];
  confidence: Confidence;
  tags: CockpitTag[];
  validationDue?: string;
};

export type SignalSummary = {
  id: string;
  symbol: string;
  timeframe: string;
  setup: string;
  score: number;
  status: SignalStatus;
  tags: CockpitTag[];
  marketIntent: string;
  marketGate: "pass" | "caution" | "block";
  traderMatch: number;
  riskLevel: RiskLevel;
  entryTrigger: string;
  invalidation: string;
  nextWatch: string;
  scenarioPlan: ScenarioPlan;
  updatedAt: string;
};

export type SignalDetail = SignalSummary & {
  thesis: string;
  missingConditions: string[];
  riskFlags: string[];
  ruleHits: RuleHit[];
  evidence: EvidenceRef[];
};

export type WatchlistItem = {
  symbol: string;
  price: number;
  changePct: number;
  score: number;
  setup: string;
  status: string;
  relativeVolume: number;
  riskLevel: RiskLevel;
  reason: string;
};

export type TodayFocusItem = {
  id: string;
  type: "opportunity" | "watchlist" | "news_event" | "rule_match" | "next_watch" | "outcome_review";
  status: "active" | "waiting" | "triggered" | "invalidated" | "reviewed";
  priority: number;
  symbol?: string;
  title: string;
  summary: string;
  reason: string;
  tags: string[];
  target: {
    route: string;
    queryKey: string;
    queryValue: string;
    label: string;
  };
  updatedAt: string;
};

export type MarketIntentExplanation = {
  marketGate: "pass" | "caution" | "block";
  summary: string;
  whyNow: string[];
  whyWait: string[];
  nextWatchCondition: string;
  evidenceCount: number;
  evidenceLabels: string[];
  updatedAt: string;
};

export type InboxMessage = {
  id: string;
  type: string;
  priority: InboxPriority;
  title: string;
  summary: string;
  objectLabel: string;
  createdAt: string;
  acknowledged: boolean;
};

export type AgentEvent = {
  id: string;
  runId: string;
  eventType: string;
  status: AgentEventStatus;
  summary: string;
  toolName?: string;
  durationMs?: number;
  createdAt: string;
  evidenceIds: string[];
};

export type PlaybookRule = {
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
  explainText: string;
};

export type TheoryMatch = {
  signalId: string;
  symbol: string;
  status: SignalStatus;
};

export type PlaybookTheory = {
  id: string;
  name: string;
  thesis: string;
  source: "zhao" | "manual" | "agent_discovered";
  sourceEvidence: EvidenceRef[];
  applicableSymbols: string[];
  applicableRegimes: string[];
  rules: PlaybookRule[];
  failureModes: string[];
  currentMatches: TheoryMatch[];
  validationSummary?: string;
  confidence: Confidence;
  status: "candidate" | "active" | "deprecated";
  tags: CockpitTag[];
};

export type LearningItem = {
  id: string;
  type: "new_theory_candidate" | "new_rule_candidate" | "low_confidence_candidate" | "reflection" | "post_validation";
  title: string;
  summary: string;
  confidence: Confidence;
  tags: CockpitTag[];
  evidence: EvidenceRef[];
  createdAt: string;
};

export type ToolSetting = {
  id: string;
  name: string;
  sourceType: "market" | "news" | "knowledge" | "web" | "model";
  mode: "readonly";
  enabled: boolean;
  summary: string;
};

export type ChatStreamPart =
  | { id: string; type: "text-delta"; text: string }
  | { id: string; type: "tool"; status: AgentEventStatus; toolName: string; summary: string; durationMs?: number }
  | { id: string; type: "source"; title: string; source: string; timestamp: string }
  | { id: string; type: "evidence"; evidence: EvidenceRef }
  | { id: string; type: "warning"; message: string }
  | { id: string; type: "error"; message: string; retryable: boolean }
  | { id: string; type: "done"; traceId: string; usage: string };

export type AgentWorkstream = {
  id: string;
  title: string;
  symbols: string[];
  status: "active" | "updated" | "quiet";
  unreadCount: number;
  summary: string;
  updatedAt: string;
};

export type AgentConsoleMessage = {
  id: string;
  workstreamId: string;
  role: "user" | "agent" | "agent_push";
  createdAt: string;
  text: string;
  tags: CockpitTag[];
  relatedNodeIds: string[];
};

export type AgentActivityNode = {
  id: string;
  workstreamId: string;
  kind:
  | "user_question"
  | "market_snapshot"
  | "news_scan"
  | "rule_match"
  | "risk_check"
  | "learning_candidate";
  status: "pending" | "running" | "completed" | "warning" | "failed";
  title: string;
  summary: string;
  evidenceBullets: string[];
  relatedLearningRefs: {
    id: string;
    title: string;
    href: string;
  }[];
  askPrompts: string[];
  createdAt: string;
};

export type AgentActivityEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

export type AgentActivityTrace = {
  workstreamId: string;
  nodes: AgentActivityNode[];
  edges: AgentActivityEdge[];
  selectedNodeId?: string;
};

export type ContextUsedSummary = {
  workstreamId: string;
  marketFacts: string[];
  activeLearnings: string[];
  preferences: string[];
};

export type SignalListInput = {
  status?: string;
  symbol?: string;
  query?: string;
  page?: number;
  pageSize?: number;
};

export type SignalDetailInput = {
  id: string;
};

export type InboxInput = {
  priority?: string;
};

export type AgentEventInput = {
  scope?: string;
};

export type TheoryListInput = {
  status?: string;
  tag?: CockpitTag | "all";
};

export type LearningInput = {
  type?: string;
};

export type TodayFocusListInput = {
  query?: string;
  type?: TodayFocusItem["type"];
  status?: TodayFocusItem["status"];
  page?: number;
  pageSize?: number;
};

export type ChatStreamInput = {
  conversationId: string;
  message: string;
  context?: {
    symbol?: string;
    signalId?: string;
  };
  signal?: AbortSignal;
};

export type AgentConsoleInput = {
  workstreamId?: string;
};

export type SignalListViewModel = {
  signals: SignalSummary[];
  watchlist: WatchlistItem[];
  total?: number;
  page?: number;
  pageSize?: number;
};

export type MarketSnapshotViewModel = {
  totalSignals: number;
  openSignalCount: number;
  invalidatedSignalCount: number;
  latestSignalAt: string | null;
};

export type MarketIntentExplanationViewModel = {
  explanation: MarketIntentExplanation;
};

export type TodayFocusListViewModel = {
  items: TodayFocusItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type AgentEventListViewModel = {
  events: AgentEvent[];
};

export type InboxMessageListViewModel = {
  messages: InboxMessage[];
};

export type PlaybookTheoryListViewModel = {
  theories: PlaybookTheory[];
};

export type LearningItemListViewModel = {
  items: LearningItem[];
  hasMeaningfulNewLearning: boolean;
};

export type ToolSettingsViewModel = {
  tools: ToolSetting[];
  localPreferences: {
    pollingIntervalSeconds: number;
    density: "compact" | "comfortable";
    chartTimeframe: "5m" | "15m" | "1h";
  };
};

export type AgentConsoleViewModel = {
  workstreams: AgentWorkstream[];
  selectedWorkstreamId: string;
  priorityPushes: AgentConsoleMessage[];
  messages: AgentConsoleMessage[];
  trace: AgentActivityTrace;
  contextUsed: ContextUsedSummary;
};

export interface CockpitDataAdapter {
  listSignals(input?: SignalListInput): Promise<SignalListViewModel>;
  getMarketSnapshot(): Promise<MarketSnapshotViewModel>;
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

import { readStoredDataSource } from "./data-source";
import { mockCockpitAdapter } from "./mock-adapter";
import { realReadonlyAdapter } from "./real-readonly-adapter";

function resolveAdapter(): CockpitDataAdapter {
  return readStoredDataSource() === "real" ? realReadonlyAdapter : mockCockpitAdapter;
}

export const cockpitAdapter = new Proxy({} as CockpitDataAdapter, {
  get(_target, prop) {
    const adapter = resolveAdapter();
    const value = adapter[prop as keyof CockpitDataAdapter];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(adapter);
    }
    return value;
  },
});

export { mockCockpitAdapter };
