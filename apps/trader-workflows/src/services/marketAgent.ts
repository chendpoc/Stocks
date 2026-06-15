import { fetchIntel, fetchStage1 } from "../api/client.js";
import { buildQuery } from "../api/queryBuilder.js";
import { MARKET_AGENT_PREFIX } from "../constants/apiPaths.js";
import type {
  ContextBootstrapInput,
  ContextBootstrapResponse,
  ContextLatestInput,
  ContextLatestResponse,
  FailureMemoryListInput,
  FailureMemoryListResponse,
  ListDecisionOutcomesInput,
  ListDecisionOutcomesResponse,
  ListInsightCandidatesInput,
  ListInsightCandidatesResponse,
  ListModelDecisionsInput,
  ListModelDecisionsResponse,
  MarketAgentMemoryInitResponse,
  MarketDataFetchInput,
  MarketDataFetchResponse,
  MarketDataHealthResponse,
  MarketDataQualityResponse,
  MarketMonitorRunInput,
  MarketMonitorRunResponse,
  PatternMemoryDegradeInput,
  PatternMemoryListInput,
  PatternMemoryListResponse,
  PatternMemoryPromoteInput,
  PatternMemoryTransitionResponse,
} from "../types/marketAgent.js";

export type {
  ContextBootstrapInput,
  ContextBootstrapResponse,
  ContextLatestInput,
  ContextLatestResponse,
  FailureMemoryListInput,
  FailureMemoryListResponse,
  FailureMemoryRecord,
  ListDecisionOutcomesInput,
  ListDecisionOutcomesResponse,
  ListInsightCandidatesInput,
  ListInsightCandidatesResponse,
  ListModelDecisionsInput,
  ListModelDecisionsResponse,
  MarketAgentMemoryInitResponse,
  MarketDataFetchInput,
  MarketDataFetchResponse,
  MarketDataHealthResponse,
  MarketDataQualityResponse,
  MarketMonitorRunInput,
  MarketMonitorRunResponse,
  ModelDecisionRecord,
  PatternMemoryDegradeInput,
  PatternMemoryListInput,
  PatternMemoryListResponse,
  PatternMemoryPromoteInput,
  PatternMemoryRecord,
  PatternMemoryTransitionResponse,
} from "../types/marketAgent.js";

function withQuery(path: string, params: Record<string, string | number | boolean | undefined | null>): string {
  const query = buildQuery(params);
  return query ? `${path}?${query}` : path;
}

export async function listDecisionOutcomes(
  input: ListDecisionOutcomesInput = {},
): Promise<ListDecisionOutcomesResponse> {
  return fetchStage1<ListDecisionOutcomesResponse>(
    withQuery("/decision-outcomes", {
      symbol: input.symbol ? input.symbol.toUpperCase() : undefined,
      status: input.status,
      limit: input.limit,
    }),
  );
}

export async function initMarketAgentMemory(): Promise<MarketAgentMemoryInitResponse> {
  return fetchIntel<MarketAgentMemoryInitResponse>(`${MARKET_AGENT_PREFIX}memory/init`, {
    method: "POST",
  });
}

export async function listModelDecisions(
  input: ListModelDecisionsInput = {},
): Promise<ListModelDecisionsResponse> {
  return fetchStage1<ListModelDecisionsResponse>(
    withQuery("/model-decisions", {
      symbol: input.symbol ? input.symbol.toUpperCase() : undefined,
      model_version: input.model_version,
      limit: input.limit,
    }),
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
  return fetchIntel<MarketMonitorRunResponse>(`${MARKET_AGENT_PREFIX}market-monitor/run`, {
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
  const query = buildQuery({
    symbol: input.symbol.toUpperCase(),
    timeframe: input.timeframe ?? "1d",
    limit: input.limit,
    min_required: input.min_required,
    allow_live_fallback: input.allow_live_fallback,
  });
  return fetchIntel<MarketDataFetchResponse>(
    `${MARKET_AGENT_PREFIX}market-data/fetch?${query}`,
  );
}

export async function getMarketDataHealth(
  input: { symbol?: string } = {},
): Promise<MarketDataHealthResponse> {
  return fetchIntel<MarketDataHealthResponse>(
    withQuery(`${MARKET_AGENT_PREFIX}market-data/health`, {
      symbol: input.symbol ? input.symbol.toUpperCase() : undefined,
    }),
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
  const query = buildQuery({
    symbol: input.symbol.toUpperCase(),
    timeframe: input.timeframe ?? "1d",
    limit: input.limit,
    min_required: input.min_required,
  });
  return fetchIntel<MarketDataQualityResponse>(
    `${MARKET_AGENT_PREFIX}market-data/quality?${query}`,
  );
}

export async function listInsightCandidates(
  input: ListInsightCandidatesInput = {},
): Promise<ListInsightCandidatesResponse> {
  return fetchStage1<ListInsightCandidatesResponse>(
    withQuery("/insight-candidates", {
      symbol: input.symbol ? input.symbol.toUpperCase() : undefined,
      verification_status: input.verification_status,
      limit: input.limit,
    }),
  );
}

export async function bootstrapContext(
  input: ContextBootstrapInput = {},
): Promise<ContextBootstrapResponse> {
  return fetchIntel<ContextBootstrapResponse>(`${MARKET_AGENT_PREFIX}context/bootstrap`, {
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
  return fetchIntel<ContextLatestResponse>(
    withQuery(`${MARKET_AGENT_PREFIX}context/latest`, {
      session_id: input.session_id,
      profile: input.profile,
      symbol: input.symbol ? input.symbol.toUpperCase() : undefined,
    }),
  );
}

export async function listPatternMemories(
  input: PatternMemoryListInput = {},
): Promise<PatternMemoryListResponse> {
  return fetchIntel<PatternMemoryListResponse>(
    withQuery(`${MARKET_AGENT_PREFIX}pattern-memory`, {
      symbol: input.symbol ? input.symbol.toUpperCase() : undefined,
      pattern_id: input.pattern_id,
      status: input.status,
      limit: input.limit,
    }),
  );
}

export async function promotePatternMemory(
  input: PatternMemoryPromoteInput,
): Promise<PatternMemoryTransitionResponse> {
  return fetchIntel<PatternMemoryTransitionResponse>(`${MARKET_AGENT_PREFIX}pattern-memory/promote`, {
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
  return fetchIntel<PatternMemoryTransitionResponse>(`${MARKET_AGENT_PREFIX}pattern-memory/degrade`, {
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
  return fetchIntel<FailureMemoryListResponse>(
    withQuery(`${MARKET_AGENT_PREFIX}failure-memory`, {
      symbol: input.symbol ? input.symbol.toUpperCase() : undefined,
      failure_type: input.failure_type,
      setup: input.setup,
      status: input.status,
      limit: input.limit,
    }),
  );
}
