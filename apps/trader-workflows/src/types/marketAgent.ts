import type { DecisionOutcomeRow } from "./outcomes.js";
import type { InsightCandidateRecord } from "./insight.js";

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
