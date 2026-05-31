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
  KnowledgeCandidate,
  KnowledgeContextMemory,
  KnowledgeExtractPreviewResult,
  KnowledgeMemoryItem,
  KnowledgeMemoryItemInput,
  KnowledgeMemoryItemUpdate,
  KnowledgeSearchResult,
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

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(message: string, status: number, detail: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function formatFastApiDetail(detail: unknown): string {
  if (typeof detail === "string") {
    return detail;
  }
  if (detail && typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    if (typeof record.message === "string") {
      return record.message;
    }
    if (typeof record.detail === "string") {
      return record.detail;
    }
  }
  return "Request failed";
}

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
    let detail: unknown;
    try {
      const body = (await res.json()) as { detail?: unknown };
      detail = body.detail ?? body;
    } catch {
      detail = undefined;
    }
    const message =
      detail !== undefined
        ? formatFastApiDetail(detail)
        : `API ${path} returned ${res.status}`;
    throw new ApiError(message, res.status, detail);
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

  async searchKnowledge(
    query: string,
    options?: { symbol?: string; sourceType?: string; limit?: number },
  ): Promise<KnowledgeSearchResult[]> {
    const params = new URLSearchParams({ q: query });
    if (options?.symbol) params.set("symbol", options.symbol);
    if (options?.sourceType) params.set("source_type", options.sourceType);
    if (options?.limit) params.set("limit", String(options.limit));
    const data = await fetchJson<{ results: KnowledgeSearchResult[] }>(`/api/knowledge/search?${params}`);
    return data.results;
  },

  async listCandidates(options?: {
    status?: string;
    candidateType?: string;
    symbol?: string;
    limit?: number;
    offset?: number;
  }): Promise<KnowledgeCandidate[]> {
    const params = new URLSearchParams();
    if (options?.status) params.set("status", options.status);
    if (options?.candidateType) params.set("candidate_type", options.candidateType);
    if (options?.symbol) params.set("symbol", options.symbol);
    if (options?.limit) params.set("limit", String(options.limit ?? 20));
    if (options?.offset) params.set("offset", String(options.offset ?? 0));
    const data = await fetchJson<{ results: KnowledgeCandidate[] }>(`/api/knowledge/candidates?${params}`);
    return data.results;
  },

  async getCandidate(id: string): Promise<KnowledgeCandidate> {
    return fetchJson<KnowledgeCandidate>(`/api/knowledge/candidates/${id}`);
  },

  async createCandidatesFromSections(sectionIds: string[]) {
    return fetchJson<{ created: string[]; flagged: string[] }>("/api/knowledge/candidates", {
      method: "POST",
      body: JSON.stringify({ section_ids: sectionIds, extraction_mode: "rule_based" }),
    });
  },

  async activateCandidate(id: string) {
    return fetchJson<{ memory_item_id: string }>(`/api/knowledge/candidates/${id}/activate`, { method: "POST" });
  },

  async rejectCandidate(id: string) {
    return fetchJson<{ candidate_id: string; candidate_status: string }>(
      `/api/knowledge/candidates/${id}/reject`,
      { method: "POST" },
    );
  },

  async mergeCandidate(id: string, targetMemoryItemId: string) {
    return fetchJson<{ candidate_id: string; memory_item_id: string }>(
      `/api/knowledge/candidates/${id}/merge`,
      {
        method: "POST",
        body: JSON.stringify({ target_memory_item_id: targetMemoryItemId }),
      },
    );
  },

  async batchCandidates(ids: string[], action: "activate" | "reject") {
    return fetchJson<{ activated: string[]; rejected: string[]; skipped: string[] }>(
      "/api/knowledge/candidates/batch",
      {
        method: "POST",
        body: JSON.stringify({ candidate_ids: ids, action }),
      },
    );
  },

  async extractPreview(text: string, contextNote?: string): Promise<KnowledgeExtractPreviewResult> {
    return fetchJson<KnowledgeExtractPreviewResult>("/api/knowledge/extract-preview", {
      method: "POST",
      body: JSON.stringify({ text, context_note: contextNote ?? null }),
    });
  },

  async createMemoryItem(item: KnowledgeMemoryItemInput): Promise<KnowledgeMemoryItem> {
    return fetchJson<KnowledgeMemoryItem>("/api/knowledge/memory-items", {
      method: "POST",
      body: JSON.stringify(item),
    });
  },

  async listMemoryItems(options?: {
    status?: string;
    memoryType?: string;
    symbol?: string;
    limit?: number;
    offset?: number;
  }): Promise<KnowledgeMemoryItem[]> {
    const params = new URLSearchParams();
    if (options?.status) params.set("status", options.status);
    if (options?.memoryType) params.set("memory_type", options.memoryType);
    if (options?.symbol) params.set("symbol", options.symbol);
    if (options?.limit) params.set("limit", String(options.limit ?? 20));
    if (options?.offset) params.set("offset", String(options.offset ?? 0));
    const data = await fetchJson<{ results: KnowledgeMemoryItem[] }>(`/api/knowledge/memory-items?${params}`);
    return data.results;
  },

  async getMemoryItem(id: string): Promise<KnowledgeMemoryItem> {
    return fetchJson<KnowledgeMemoryItem>(`/api/knowledge/memory-items/${id}`);
  },

  async updateMemoryItem(id: string, updates: KnowledgeMemoryItemUpdate): Promise<KnowledgeMemoryItem> {
    return fetchJson<KnowledgeMemoryItem>(`/api/knowledge/memory-items/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  },

  async deprecateMemoryItem(id: string) {
    return fetchJson<{ memory_item_id: string; status: string }>(
      `/api/knowledge/memory-items/${id}/deprecate`,
      { method: "POST" },
    );
  },

  async selectContext(
    taskType: string,
    options?: { symbols?: string[]; tags?: string[]; marketScope?: string },
  ): Promise<{ memories: KnowledgeContextMemory[]; total_chars: number }> {
    return fetchJson<{ memories: KnowledgeContextMemory[]; total_chars: number }>(
      "/api/knowledge/select-context",
      {
        method: "POST",
        body: JSON.stringify({
          task_type: taskType,
          symbols: options?.symbols ?? null,
          tags: options?.tags ?? null,
          market_scope: options?.marketScope ?? null,
        }),
      },
    );
  },

  async backup() {
    return fetchJson<{ sqlite_path: string; jsonl_path: string | null; timestamp: string }>(
      "/api/knowledge/backup",
      { method: "POST" },
    );
  },

  async incrementalRebuild() {
    return fetchJson<Record<string, unknown>>("/api/knowledge/incremental-rebuild", { method: "POST" });
  },

  async evidenceHealth() {
    return fetchJson<Record<string, unknown>>("/api/knowledge/evidence-health");
  },
};
