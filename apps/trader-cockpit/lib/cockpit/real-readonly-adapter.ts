import type {
  AgentConsoleInput,
  AgentConsoleViewModel,
  AgentEventInput,
  AgentEventListViewModel,
  ChatStreamInput,
  ChatStreamPart,
  CockpitDataAdapter,
  InboxInput,
  InboxMessageListViewModel,
  LearningInput,
  LearningItemListViewModel,
  MarketIntentExplanation,
  MarketIntentExplanationViewModel,
  PlaybookTheoryListViewModel,
  SignalDetail,
  SignalDetailInput,
  SignalListInput,
  SignalListViewModel,
  SignalSummary,
  TheoryListInput,
  TodayFocusListInput,
  TodayFocusListViewModel,
  ToolSettingsViewModel,
} from "@/lib/cockpit/adapter";
import { mockCockpitAdapter } from "@/lib/cockpit/mock-adapter";

// Default: same-origin proxy via next.config.ts rewrites (avoids browser CORS).
const API_BASE = process.env.NEXT_PUBLIC_AGENT_API_BASE ?? "";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const hasBody = init?.body != null;
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    throw new Error(`API ${path} returned ${res.status}`);
  }
  return res.json() as Promise<T>;
}

type BackendSignal = {
  id: string;
  symbol: string;
  timeframe: string;
  setup_type: string;
  score: number | null;
  status: string;
  market_gate: string;
  trader_playbook_match: number | null;
  entry_trigger: string;
  invalidation: string;
  evidence: Record<string, unknown>;
  risk_flags: string[];
  tool_outputs: Record<string, unknown>;
  rule_version: string;
  agent_version: string;
  created_at: string;
  updated_at: string;
};

type BackendGateResponse = {
  gate: string;
  summary: string;
  signal_count: number;
};

type BackendSignalsListResponse = {
  signals: BackendSignal[];
  total?: number;
  page?: number;
  page_size?: number;
};

type BackendMarketSnapshotResponse = {
  total_signals: number;
  open_signal_count: number;
  invalidated_signal_count: number;
  latest_signal_at: string | null;
};

const STATUS_MAP: Record<string, SignalSummary["status"]> = {
  watching: "watching",
  waiting_trigger: "waiting_trigger",
  near_trigger: "near_trigger",
  triggered_for_attention: "triggered_for_attention",
  invalidated: "invalidated",
  needs_more_evidence: "needs_more_evidence",
};

function mapStatus(status: string): SignalSummary["status"] {
  return STATUS_MAP[status] ?? "watching";
}

function mapMarketGate(gate: string): SignalSummary["marketGate"] {
  if (gate === "pass" || gate === "caution" || gate === "block") {
    return gate;
  }
  return "caution";
}

function mapSignalToSummary(row: BackendSignal): SignalSummary {
  const score = row.score ?? 0;
  const traderMatch = row.trader_playbook_match ?? 0;

  return {
    id: row.id,
    symbol: row.symbol,
    timeframe: row.timeframe,
    setup: row.setup_type,
    score,
    status: mapStatus(row.status),
    tags: [],
    marketIntent: "",
    marketGate: mapMarketGate(row.market_gate),
    traderMatch,
    riskLevel: score >= 70 ? "medium" : "low",
    entryTrigger: row.entry_trigger,
    invalidation: row.invalidation,
    nextWatch: "",
    scenarioPlan: {
      planId: `plan-${row.id}`,
      signalId: row.id,
      summary: row.entry_trigger,
      watchConditions: [],
      triggerConditions: row.entry_trigger ? [row.entry_trigger] : [],
      invalidationConditions: row.invalidation ? [row.invalidation] : [],
      expectedPaths: [],
      evidenceRefs: [],
      confidence: score >= 70 ? "medium" : "low",
      tags: [],
    },
    updatedAt: row.updated_at,
  };
}

function mapSignalToDetail(row: BackendSignal): SignalDetail {
  return {
    ...mapSignalToSummary(row),
    thesis: row.entry_trigger,
    missingConditions: [],
    riskFlags: row.risk_flags ?? [],
    ruleHits: [],
    evidence: [],
  };
}

function buildMarketIntentExplanation(gate: BackendGateResponse): MarketIntentExplanation {
  const marketGate = mapMarketGate(gate.gate);

  return {
    marketGate,
    summary: gate.summary,
    whyNow: marketGate !== "block" ? ["Agent signals detected"] : [],
    whyWait: marketGate === "block" ? ["Market gate blocked"] : [],
    nextWatchCondition: "",
    evidenceCount: gate.signal_count,
    evidenceLabels: [],
    updatedAt: new Date().toISOString(),
  };
}

export const realReadonlyAdapter: CockpitDataAdapter = {
  async listSignals(input?: SignalListInput): Promise<SignalListViewModel> {
    const params = new URLSearchParams();
    if (input?.symbol) params.set("symbol", input.symbol);
    if (input?.status) params.set("status", input.status);
    if (input?.query) params.set("q", input.query);
    if (input?.page !== undefined) {
      params.set("page", String(input.page));
      params.set("page_size", String(input.pageSize ?? 5));
    }
    const qs = params.toString();
    const data = await fetchJson<BackendSignalsListResponse>(
      `/api/agent/signals${qs ? `?${qs}` : ""}`,
    );

    return {
      signals: data.signals.map(mapSignalToSummary),
      watchlist: [],
      total: data.total,
      page: data.page,
      pageSize: data.page_size,
    };
  },

  async getMarketSnapshot() {
    const snapshot = await fetchJson<BackendMarketSnapshotResponse>("/api/agent/market/snapshot");
    return {
      totalSignals: snapshot.total_signals,
      openSignalCount: snapshot.open_signal_count,
      invalidatedSignalCount: snapshot.invalidated_signal_count,
      latestSignalAt: snapshot.latest_signal_at,
    };
  },

  async getMarketIntentExplanation(): Promise<MarketIntentExplanationViewModel> {
    const gate = await fetchJson<BackendGateResponse>("/api/agent/market/gate");
    return { explanation: buildMarketIntentExplanation(gate) };
  },

  async getSignal(input: SignalDetailInput): Promise<SignalDetail> {
    const row = await fetchJson<BackendSignal>(`/api/agent/signals/${input.id}`);
    return mapSignalToDetail(row);
  },

  async listTodayFocus(input?: TodayFocusListInput): Promise<TodayFocusListViewModel> {
    return mockCockpitAdapter.listTodayFocus(input);
  },

  async listInboxMessages(input?: InboxInput): Promise<InboxMessageListViewModel> {
    return mockCockpitAdapter.listInboxMessages(input);
  },

  async listAgentEvents(input?: AgentEventInput): Promise<AgentEventListViewModel> {
    return mockCockpitAdapter.listAgentEvents(input);
  },

  async listPlaybookTheories(input?: TheoryListInput): Promise<PlaybookTheoryListViewModel> {
    return mockCockpitAdapter.listPlaybookTheories(input);
  },

  async listLearningItems(input?: LearningInput): Promise<LearningItemListViewModel> {
    return mockCockpitAdapter.listLearningItems(input);
  },

  async getToolSettings(): Promise<ToolSettingsViewModel> {
    return mockCockpitAdapter.getToolSettings();
  },

  async *streamChat(input: ChatStreamInput): AsyncIterable<ChatStreamPart> {
    yield* mockCockpitAdapter.streamChat(input);
  },

  async getAgentConsole(input?: AgentConsoleInput): Promise<AgentConsoleViewModel> {
    return mockCockpitAdapter.getAgentConsole(input);
  },
};
