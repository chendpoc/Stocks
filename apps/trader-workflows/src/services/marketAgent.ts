import { fetchIntel, fetchStage1 } from "../api/client.js";
import type { DecisionOutcomeRow } from "./outcomes.js";
import type { InsightCandidateRecord } from "./insightCandidates.js";

export interface ListDecisionOutcomesInput {
  symbol?: string;
  status?: string;
  limit?: number;
}

export interface ListDecisionOutcomesResponse {
  items: DecisionOutcomeRow[];
  count: number;
}

export interface MarketAgentMemoryInitResponse {
  status: string;
  table_names: string[];
}

export interface ModelDecisionRecord {
  decision_id: string;
  symbol: string;
  model_version?: string | null;
  action?: string;
  status?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface ListModelDecisionsInput {
  symbol?: string;
  model_version?: string;
  limit?: number;
}

export interface ListModelDecisionsResponse {
  items: ModelDecisionRecord[];
  count: number;
}

export interface MarketMonitorRunInput {
  symbols: string[];
  timeframes: string[];
  limit?: number;
  min_required?: number;
  allow_live_fallback?: boolean;
}

export interface MarketMonitorRunResponse {
  results: Record<string, unknown>[];
  count: number;
}

export interface MarketDataFetchInput {
  symbol: string;
  timeframe?: string;
  limit?: number;
  min_required?: number;
  allow_live_fallback?: boolean;
}

export interface MarketDataFetchResponse {
  symbol: string;
  timeframe: string;
  bars: Array<Record<string, unknown>>;
  quality_status: string;
  quality_reason: string;
  bar_count: number;
  source?: string;
}

export interface MarketDataHealthResponse {
  status: string;
  [key: string]: unknown;
}

export interface MarketDataQualityResponse {
  status: string;
  reason: string;
  bar_count: number;
  min_required: number;
}

export interface ListInsightCandidatesInput {
  symbol?: string;
  verification_status?: string;
  limit?: number;
}

export interface ListInsightCandidatesResponse {
  items: InsightCandidateRecord[];
  count: number;
}

export interface ContextBootstrapInput {
  session_id?: string;
  profile?: string;
  symbol?: string;
  max_chars?: number;
}

export interface ContextBootstrapResponse {
  session_context_pack_id?: string;
  session_id: string;
  profile?: string | null;
  symbol?: string | null;
  markdown: string;
  metadata_json?: Record<string, unknown>;
  max_chars?: number;
  created_at?: string;
}

export interface ContextLatestInput {
  session_id?: string;
  profile?: string;
  symbol?: string;
}

export interface ContextLatestResponse extends ContextBootstrapResponse {
  latest?: boolean;
}

export interface PatternMemoryRecord {
  pattern_memory_id: string;
  symbol: string;
  pattern_id: string;
  memory_json: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PatternMemoryListInput {
  symbol?: string;
  pattern_id?: string;
  status?: string;
  limit?: number;
}

export interface PatternMemoryListResponse {
  items: PatternMemoryRecord[];
  count: number;
}

export interface PatternMemoryPromoteInput {
  pattern_memory_id?: string;
  candidate_id?: string;
  confirm?: boolean;
}

export interface PatternMemoryTransitionResponse {
  item: PatternMemoryRecord;
}

export interface PatternMemoryDegradeInput {
  pattern_memory_id?: string;
  pattern_id?: string;
  reason?: string;
}

export interface FailureMemoryRecord {
  failure_memory_id: string;
  symbol: string;
  failure_type: string;
  [key: string]: unknown;
}

export interface FailureMemoryListInput {
  symbol?: string;
  failure_type?: string;
  setup?: string;
  status?: string;
  limit?: number;
}

export interface FailureMemoryListResponse {
  items: FailureMemoryRecord[];
  count: number;
}

export async function listDecisionOutcomes(
  input: ListDecisionOutcomesInput = {},
): Promise<ListDecisionOutcomesResponse> {
  const params = new URLSearchParams();
  if (input.symbol) {
    params.set("symbol", input.symbol.toUpperCase());
  }
  if (input.status) {
    params.set("status", input.status);
  }
  if (input.limit !== undefined) {
    params.set("limit", String(input.limit));
  }
  const query = params.toString();
  return fetchStage1<ListDecisionOutcomesResponse>(
    `/decision-outcomes${query ? `?${query}` : ""}`,
  );
}

export async function initMarketAgentMemory(): Promise<MarketAgentMemoryInitResponse> {
  return fetchIntel<MarketAgentMemoryInitResponse>("/market-agent/memory/init", {
    method: "POST",
  });
}

export async function listModelDecisions(
  input: ListModelDecisionsInput = {},
): Promise<ListModelDecisionsResponse> {
  const params = new URLSearchParams();
  if (input.symbol) {
    params.set("symbol", input.symbol.toUpperCase());
  }
  if (input.model_version) {
    params.set("model_version", input.model_version);
  }
  if (input.limit !== undefined) {
    params.set("limit", String(input.limit));
  }
  const query = params.toString();
  return fetchStage1<ListModelDecisionsResponse>(
    `/model-decisions${query ? `?${query}` : ""}`,
  );
}

export async function listDecisions(
  input: ListModelDecisionsInput = {},
): Promise<ListModelDecisionsResponse> {
  return listModelDecisions(input);
}

export async function runMarketMonitor(
  input: MarketMonitorRunInput,
): Promise<MarketMonitorRunResponse> {
  return fetchIntel<MarketMonitorRunResponse>("/market-agent/market-monitor/run", {
    method: "POST",
    body: JSON.stringify({
      symbols: input.symbols,
      timeframes: input.timeframes,
      limit: input.limit,
      min_required: input.min_required,
      allow_live_fallback: input.allow_live_fallback,
    }),
  });
}

export async function fetchMarketData(
  input: MarketDataFetchInput,
): Promise<MarketDataFetchResponse> {
  const params = new URLSearchParams();
  params.set("symbol", input.symbol.toUpperCase());
  params.set("timeframe", input.timeframe ?? "1d");
  if (input.limit !== undefined) {
    params.set("limit", String(input.limit));
  }
  if (input.min_required !== undefined) {
    params.set("min_required", String(input.min_required));
  }
  if (input.allow_live_fallback !== undefined) {
    params.set("allow_live_fallback", String(input.allow_live_fallback));
  }
  const query = params.toString();
  return fetchIntel<MarketDataFetchResponse>(
    `/market-agent/market-data/fetch?${query}`,
  );
}

export async function getMarketDataHealth(
  input: { symbol?: string } = {},
): Promise<MarketDataHealthResponse> {
  const params = new URLSearchParams();
  if (input.symbol) {
    params.set("symbol", input.symbol.toUpperCase());
  }
  const query = params.toString();
  return fetchIntel<MarketDataHealthResponse>(
    `/market-agent/market-data/health${query ? `?${query}` : ""}`,
  );
}

export async function getMarketDataQuality(
  input: {
    symbol: string;
    timeframe?: string;
    limit?: number;
    min_required?: number;
  },
): Promise<MarketDataQualityResponse> {
  const params = new URLSearchParams();
  params.set("symbol", input.symbol.toUpperCase());
  params.set("timeframe", input.timeframe ?? "1d");
  if (input.limit !== undefined) {
    params.set("limit", String(input.limit));
  }
  if (input.min_required !== undefined) {
    params.set("min_required", String(input.min_required));
  }
  const query = params.toString();
  return fetchIntel<MarketDataQualityResponse>(
    `/market-agent/market-data/quality?${query}`,
  );
}

export async function listInsightCandidates(
  input: ListInsightCandidatesInput = {},
): Promise<ListInsightCandidatesResponse> {
  const params = new URLSearchParams();
  if (input.symbol) {
    params.set("symbol", input.symbol.toUpperCase());
  }
  if (input.verification_status) {
    params.set("verification_status", input.verification_status);
  }
  if (input.limit !== undefined) {
    params.set("limit", String(input.limit));
  }
  const query = params.toString();
  return fetchStage1<ListInsightCandidatesResponse>(
    `/insight-candidates${query ? `?${query}` : ""}`,
  );
}

export async function bootstrapContext(
  input: ContextBootstrapInput = {},
): Promise<ContextBootstrapResponse> {
  return fetchIntel<ContextBootstrapResponse>("/market-agent/context/bootstrap", {
    method: "POST",
    body: JSON.stringify({
      session_id: input.session_id,
      profile: input.profile,
      symbol: input.symbol ? input.symbol.toUpperCase() : undefined,
      max_chars: input.max_chars,
    }),
  });
}

export async function getLatestContext(
  input: ContextLatestInput = {},
): Promise<ContextLatestResponse> {
  const params = new URLSearchParams();
  if (input.session_id) {
    params.set("session_id", input.session_id);
  }
  if (input.profile) {
    params.set("profile", input.profile);
  }
  if (input.symbol) {
    params.set("symbol", input.symbol.toUpperCase());
  }
  const query = params.toString();
  return fetchIntel<ContextLatestResponse>(
    `/market-agent/context/latest${query ? `?${query}` : ""}`,
  );
}

export async function listPatternMemories(
  input: PatternMemoryListInput = {},
): Promise<PatternMemoryListResponse> {
  const params = new URLSearchParams();
  if (input.symbol) {
    params.set("symbol", input.symbol.toUpperCase());
  }
  if (input.pattern_id) {
    params.set("pattern_id", input.pattern_id);
  }
  if (input.status) {
    params.set("status", input.status);
  }
  if (input.limit !== undefined) {
    params.set("limit", String(input.limit));
  }
  const query = params.toString();
  return fetchIntel<PatternMemoryListResponse>(
    `/market-agent/pattern-memory${query ? `?${query}` : ""}`,
  );
}

export async function promotePatternMemory(
  input: PatternMemoryPromoteInput,
): Promise<PatternMemoryTransitionResponse> {
  return fetchIntel<PatternMemoryTransitionResponse>("/market-agent/pattern-memory/promote", {
    method: "POST",
    body: JSON.stringify({
      pattern_memory_id: input.pattern_memory_id,
      candidate_id: input.candidate_id,
      confirm: input.confirm ?? false,
    }),
  });
}

export async function degradePatternMemory(
  input: PatternMemoryDegradeInput,
): Promise<PatternMemoryTransitionResponse> {
  return fetchIntel<PatternMemoryTransitionResponse>("/market-agent/pattern-memory/degrade", {
    method: "POST",
    body: JSON.stringify({
      pattern_memory_id: input.pattern_memory_id,
      pattern_id: input.pattern_id,
      reason: input.reason,
    }),
  });
}

export async function listFailureMemories(
  input: FailureMemoryListInput = {},
): Promise<FailureMemoryListResponse> {
  const params = new URLSearchParams();
  if (input.symbol) {
    params.set("symbol", input.symbol.toUpperCase());
  }
  if (input.failure_type) {
    params.set("failure_type", input.failure_type);
  }
  if (input.setup) {
    params.set("setup", input.setup);
  }
  if (input.status) {
    params.set("status", input.status);
  }
  if (input.limit !== undefined) {
    params.set("limit", String(input.limit));
  }
  const query = params.toString();
  return fetchIntel<FailureMemoryListResponse>(
    `/market-agent/failure-memory${query ? `?${query}` : ""}`,
  );
}
