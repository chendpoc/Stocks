export type VerificationStatus =
  | "verified"
  | "pending"
  | "unverified"
  | "low_quality";

export type ContextSourceType =
  | "signal"
  | "event"
  | "lesson"
  | "corpus"
  | "pattern"
  | "market_bar"
  | "hypothesis";

export interface EvidenceRef {
  ref_type: string;
  ref_id: string;
  source_key?: string;
  symbol?: string;
  ts?: string;
  summary?: string;
}

export interface WeightedContextItem {
  item_id: string;
  source_type: ContextSourceType;
  evidence_ref: EvidenceRef;
  summary: string;
  confidence: number;
  relevance_weight: number;
  freshness_weight: number;
  source_quality_weight: number;
  verification_status: VerificationStatus;
  composite_weight: number;
}

export interface ContextSnapshotPayload {
  snapshot_id: string;
  symbol: string;
  asof_ts: string;
  context_version: string;
  items_json: WeightedContextItem[];
  evidence_refs_json: EvidenceRef[];
  weighting_policy_version: string;
  context_hash: string;
}

export interface ContextSnapshotRecord extends ContextSnapshotPayload {
  created_at?: string;
}

export interface ContextSnapshotSummary {
  snapshot_id: string;
  context_hash: string;
  context_version: string;
  item_count: number;
  evidence_ref_count: number;
  source_type_counts: Record<string, number>;
}

export interface WeightedContextItemSummary {
  item_id: string;
  source_type: ContextSourceType;
  summary: string;
  composite_weight: number;
  evidence_ref: EvidenceRef;
}

export interface IntelContextBuildResponse {
  market_data?: Record<string, { daily?: unknown[]; minute?: unknown[] }>;
  benchmark?: Record<string, unknown[]>;
  signals?: Record<string, unknown>[];
  events?: Record<string, unknown>[];
  lessons?: Record<string, unknown>[];
  corpus?: Record<string, unknown>[];
  patterns?: Record<string, unknown>[];
  related_hypotheses?: Record<string, unknown>[];
}

export interface LlmRerankAdjustment {
  item_id: string;
  relevance_delta: number;
}

export interface ContextWeightReranker {
  suggestAdjustments(items: WeightedContextItem[]): Promise<LlmRerankAdjustment[]>;
}
