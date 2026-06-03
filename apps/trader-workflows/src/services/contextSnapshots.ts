import { createHash } from "node:crypto";

import { fetchIntel, fetchStage1, Stage1ApiError } from "../api/client.js";

export const WEIGHTING_POLICY_VERSION = "stage1-v0";
export const CONTEXT_VERSION = "stage1-context-v0";
export const MAX_COMPOSITE_WEIGHT = 1.0;
export const MAX_RERANK_DELTA = 0.15;

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

export function sourceTypeCounts(
  items: WeightedContextItem[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.source_type] = (counts[item.source_type] ?? 0) + 1;
  }
  return counts;
}

export function toContextSnapshotSummary(
  snapshot: ContextSnapshotPayload,
): ContextSnapshotSummary {
  return {
    snapshot_id: snapshot.snapshot_id,
    context_hash: snapshot.context_hash,
    context_version: snapshot.context_version,
    item_count: snapshot.items_json.length,
    evidence_ref_count: snapshot.evidence_refs_json.length,
    source_type_counts: sourceTypeCounts(snapshot.items_json),
  };
}

export function toTopWeightedItemSummaries(
  items: WeightedContextItem[],
  limit = 5,
): WeightedContextItemSummary[] {
  return [...items]
    .sort((a, b) => b.composite_weight - a.composite_weight)
    .slice(0, limit)
    .map((item) => ({
      item_id: item.item_id,
      source_type: item.source_type,
      summary: item.summary,
      composite_weight: item.composite_weight,
      evidence_ref: item.evidence_ref,
    }));
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

export const noopContextWeightReranker: ContextWeightReranker = {
  async suggestAdjustments() {
    return [];
  },
};

export class ContextSnapshotConflictError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
  }
}

const SOURCE_QUALITY: Record<ContextSourceType, number> = {
  signal: 0.9,
  event: 0.85,
  lesson: 0.8,
  pattern: 0.75,
  corpus: 0.65,
  market_bar: 0.7,
  hypothesis: 0.6,
};

const SOURCE_RELEVANCE: Record<ContextSourceType, number> = {
  signal: 0.95,
  event: 0.85,
  lesson: 0.8,
  pattern: 0.75,
  corpus: 0.7,
  market_bar: 0.65,
  hypothesis: 0.55,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseTs(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function freshnessWeight(ts: unknown, asofTs: string): number {
  const asofMs = Date.parse(asofTs);
  const eventMs = parseTs(ts);
  if (!Number.isFinite(asofMs) || eventMs === null) {
    return 0.5;
  }
  const ageHours = Math.max(0, (asofMs - eventMs) / (1000 * 60 * 60));
  if (ageHours <= 24) {
    return 1.0;
  }
  if (ageHours <= 72) {
    return 0.85;
  }
  if (ageHours <= 168) {
    return 0.7;
  }
  return 0.5;
}

function computeCompositeWeight(item: {
  relevance_weight: number;
  freshness_weight: number;
  source_quality_weight: number;
  confidence: number;
}): number {
  const raw =
    item.relevance_weight *
    item.freshness_weight *
    item.source_quality_weight *
    (0.75 + item.confidence * 0.25);
  return clamp(raw, 0, MAX_COMPOSITE_WEIGHT);
}

function baseWeightedItem(args: {
  item_id: string;
  source_type: ContextSourceType;
  evidence_ref: EvidenceRef;
  summary: string;
  confidence: number;
  ts: unknown;
  asofTs: string;
  verification_status: VerificationStatus;
}): WeightedContextItem {
  const relevance_weight = SOURCE_RELEVANCE[args.source_type];
  const freshness_weight = freshnessWeight(args.ts, args.asofTs);
  const source_quality_weight = SOURCE_QUALITY[args.source_type];
  const partial = {
    relevance_weight,
    freshness_weight,
    source_quality_weight,
    confidence: clamp(args.confidence, 0, 1),
  };
  return {
    item_id: args.item_id,
    source_type: args.source_type,
    evidence_ref: args.evidence_ref,
    summary: args.summary,
    confidence: partial.confidence,
    relevance_weight,
    freshness_weight,
    source_quality_weight,
    verification_status: args.verification_status,
    composite_weight: computeCompositeWeight(partial),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function signalItems(
  signals: Record<string, unknown>[] | undefined,
  symbol: string,
  asofTs: string,
): WeightedContextItem[] {
  return (signals ?? []).slice(0, 20).map((signal, index) => {
    const id = String(signal.signal_id ?? signal.id ?? `signal-${index}`);
    return baseWeightedItem({
      item_id: `signal:${id}`,
      source_type: "signal",
      evidence_ref: {
        ref_type: "intel_signal",
        ref_id: id,
        symbol: String(signal.symbol ?? symbol),
        ts: String(signal.ts ?? ""),
        summary: String(signal.signal_type ?? "signal"),
      },
      summary: String(signal.raw_description ?? signal.signal_type ?? "signal"),
      confidence: Number(signal.severity ?? 0.5),
      ts: signal.ts,
      asofTs,
      verification_status: "verified",
    });
  });
}

function eventItems(
  events: Record<string, unknown>[] | undefined,
  symbol: string,
  asofTs: string,
): WeightedContextItem[] {
  return (events ?? []).slice(0, 20).map((event, index) => {
    const id = String(event.event_id ?? event.id ?? `event-${index}`);
    return baseWeightedItem({
      item_id: `event:${id}`,
      source_type: "event",
      evidence_ref: {
        ref_type: "intel_event",
        ref_id: id,
        symbol,
        ts: String(event.ts ?? event.created_at ?? ""),
        summary: String(event.title ?? event.event_type ?? "event"),
      },
      summary: String(event.title ?? event.summary ?? event.event_type ?? "event"),
      confidence: Number(event.severity ?? 0.5),
      ts: event.ts ?? event.created_at,
      asofTs,
      verification_status: "pending",
    });
  });
}

function lessonItems(
  lessons: Record<string, unknown>[] | undefined,
  symbol: string,
  asofTs: string,
): WeightedContextItem[] {
  return (lessons ?? []).slice(0, 10).map((lesson, index) => {
    const id = String(lesson.lesson_id ?? lesson.id ?? `lesson-${index}`);
    return baseWeightedItem({
      item_id: `lesson:${id}`,
      source_type: "lesson",
      evidence_ref: {
        ref_type: "intel_lesson",
        ref_id: id,
        symbol,
        summary: String(lesson.summary ?? lesson.rule_text ?? "lesson"),
      },
      summary: String(lesson.summary ?? lesson.rule_text ?? "lesson"),
      confidence: Number(lesson.confidence ?? 0.6),
      ts: lesson.created_at,
      asofTs,
      verification_status:
        String(lesson.source_type ?? "") === "seed" ? "verified" : "pending",
    });
  });
}

function corpusItems(
  corpus: Record<string, unknown>[] | undefined,
  symbol: string,
  asofTs: string,
): WeightedContextItem[] {
  return (corpus ?? []).slice(0, 5).map((section, index) => {
    const id = String(section.section_id ?? `corpus-${index}`);
    return baseWeightedItem({
      item_id: `corpus:${id}`,
      source_type: "corpus",
      evidence_ref: {
        ref_type: "document_section",
        ref_id: id,
        source_key: String(section.source_path ?? ""),
        symbol,
        ts: String(section.source_date ?? ""),
        summary: String(section.heading_path ?? "corpus section"),
      },
      summary: String(section.snippet ?? section.heading_path ?? "corpus section"),
      confidence: 0.55,
      ts: section.source_date,
      asofTs,
      verification_status: "unverified",
    });
  });
}

function patternItems(
  patterns: Record<string, unknown>[] | undefined,
  symbol: string,
  asofTs: string,
): WeightedContextItem[] {
  return (patterns ?? []).slice(0, 10).map((pattern, index) => {
    const id = String(pattern.pattern_id ?? `pattern-${index}`);
    return baseWeightedItem({
      item_id: `pattern:${id}`,
      source_type: "pattern",
      evidence_ref: {
        ref_type: "intel_pattern",
        ref_id: id,
        symbol,
        summary: String(pattern.name ?? "pattern"),
      },
      summary: String(pattern.description ?? pattern.name ?? "pattern"),
      confidence: Number(pattern.reliability_score ?? 0.5),
      ts: asofTs,
      asofTs,
      verification_status: "verified",
    });
  });
}

function hypothesisItems(
  hypotheses: Record<string, unknown>[] | undefined,
  symbol: string,
  asofTs: string,
): WeightedContextItem[] {
  return (hypotheses ?? []).slice(0, 5).map((hypothesis, index) => {
    const id = String(hypothesis.hypothesis_id ?? `hypothesis-${index}`);
    return baseWeightedItem({
      item_id: `hypothesis:${id}`,
      source_type: "hypothesis",
      evidence_ref: {
        ref_type: "intel_hypothesis",
        ref_id: id,
        symbol: String(hypothesis.symbol ?? symbol),
        ts: String(hypothesis.date ?? hypothesis.created_at ?? ""),
        summary: String(hypothesis.claim ?? "hypothesis"),
      },
      summary: String(hypothesis.claim ?? "hypothesis"),
      confidence: Number(hypothesis.confidence ?? 0.5),
      ts: hypothesis.date ?? hypothesis.created_at,
      asofTs,
      verification_status: "low_quality",
    });
  });
}

function marketBarItems(
  marketData: IntelContextBuildResponse["market_data"],
  symbol: string,
  asofTs: string,
): WeightedContextItem[] {
  const symData = asRecord(marketData?.[symbol.toUpperCase()]);
  const daily = Array.isArray(symData.daily) ? symData.daily : [];
  if (daily.length === 0) {
    return [];
  }
  const latest = asRecord(daily[daily.length - 1]);
  const prev = daily.length > 1 ? asRecord(daily[daily.length - 2]) : {};
  const close = Number(latest.close ?? latest.c ?? 0);
  const prevClose = Number(prev.close ?? prev.c ?? close);
  const changePct =
    prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : 0;
  const barTs = String(latest.ts ?? latest.date ?? asofTs);
  return [
    baseWeightedItem({
      item_id: `market_bar:${symbol.toUpperCase()}:daily:latest`,
      source_type: "market_bar",
      evidence_ref: {
        ref_type: "intel_market_bar",
        ref_id: `${symbol.toUpperCase()}:1d:latest`,
        symbol: symbol.toUpperCase(),
        ts: barTs,
        summary: `daily close ${close}`,
      },
      summary: `Latest daily close ${close.toFixed(2)} (${changePct.toFixed(2)}% vs prior)`,
      confidence: 0.9,
      ts: barTs,
      asofTs,
      verification_status: "verified",
    }),
  ];
}

export function weightedItemsFromIntelBuild(
  build: IntelContextBuildResponse,
  symbol: string,
  asofTs: string,
): WeightedContextItem[] {
  const normalized = symbol.toUpperCase();
  return [
    ...marketBarItems(build.market_data, normalized, asofTs),
    ...signalItems(build.signals, normalized, asofTs),
    ...eventItems(build.events, normalized, asofTs),
    ...lessonItems(build.lessons, normalized, asofTs),
    ...corpusItems(build.corpus, normalized, asofTs),
    ...patternItems(build.patterns, normalized, asofTs),
    ...hypothesisItems(build.related_hypotheses, normalized, asofTs),
  ];
}

export function applyRerankAdjustments(
  items: WeightedContextItem[],
  adjustments: LlmRerankAdjustment[],
): WeightedContextItem[] {
  const byId = new Map(adjustments.map((adj) => [adj.item_id, adj]));
  return items.map((item) => {
    const adjustment = byId.get(item.item_id);
    if (!adjustment) {
      return item;
    }
    const boundedDelta = clamp(
      adjustment.relevance_delta,
      -MAX_RERANK_DELTA,
      MAX_RERANK_DELTA,
    );
    const relevance_weight = clamp(
      item.relevance_weight + boundedDelta,
      0,
      MAX_COMPOSITE_WEIGHT,
    );
    const next = {
      ...item,
      relevance_weight,
    };
    return {
      ...next,
      composite_weight: computeCompositeWeight(next),
    };
  });
}

export function finalizeWeightedItems(
  items: WeightedContextItem[],
  adjustments: LlmRerankAdjustment[] = [],
): WeightedContextItem[] {
  return applyRerankAdjustments(items, adjustments).map((item) => ({
    ...item,
    composite_weight: clamp(item.composite_weight, 0, MAX_COMPOSITE_WEIGHT),
  }));
}

export function collectEvidenceRefs(items: WeightedContextItem[]): EvidenceRef[] {
  const seen = new Set<string>();
  const refs: EvidenceRef[] = [];
  for (const item of items) {
    const key = `${item.evidence_ref.ref_type}:${item.evidence_ref.ref_id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    refs.push(item.evidence_ref);
  }
  return refs;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function computeContextHash(input: {
  symbol: string;
  asof_ts: string;
  context_version: string;
  weighting_policy_version: string;
  items: WeightedContextItem[];
}): string {
  const canonical = stableStringify({
    symbol: input.symbol.toUpperCase(),
    asof_ts: input.asof_ts,
    context_version: input.context_version,
    weighting_policy_version: input.weighting_policy_version,
    items: input.items.map((item) => ({
      item_id: item.item_id,
      source_type: item.source_type,
      evidence_ref: item.evidence_ref,
      summary: item.summary,
      confidence: item.confidence,
      relevance_weight: item.relevance_weight,
      freshness_weight: item.freshness_weight,
      source_quality_weight: item.source_quality_weight,
      verification_status: item.verification_status,
      composite_weight: item.composite_weight,
    })),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function buildContextSnapshotPayload(input: {
  symbol: string;
  items: WeightedContextItem[];
  asof_ts?: string;
  snapshot_id?: string;
  context_version?: string;
  weighting_policy_version?: string;
}): ContextSnapshotPayload {
  const symbol = input.symbol.toUpperCase();
  const asof_ts = input.asof_ts ?? new Date().toISOString();
  const context_version = input.context_version ?? CONTEXT_VERSION;
  const weighting_policy_version =
    input.weighting_policy_version ?? WEIGHTING_POLICY_VERSION;
  const context_hash = computeContextHash({
    symbol,
    asof_ts,
    context_version,
    weighting_policy_version,
    items: input.items,
  });
  return {
    snapshot_id: input.snapshot_id ?? `snap-${context_hash.slice(0, 16)}`,
    symbol,
    asof_ts,
    context_version,
    items_json: input.items,
    evidence_refs_json: collectEvidenceRefs(input.items),
    weighting_policy_version,
    context_hash,
  };
}

export async function fetchIntelContextBuild(
  symbol: string,
  taskType = "decision",
): Promise<IntelContextBuildResponse> {
  return fetchIntel<IntelContextBuildResponse>("/context/build", {
    method: "POST",
    body: JSON.stringify({
      symbols: [symbol.toUpperCase()],
      taskType,
    }),
  });
}

export async function persistContextSnapshot(
  payload: ContextSnapshotPayload,
): Promise<ContextSnapshotRecord> {
  try {
    return await fetchStage1<ContextSnapshotRecord>("/context-snapshots", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (error instanceof Stage1ApiError && error.status === 409) {
      throw new ContextSnapshotConflictError(error.message);
    }
    throw error;
  }
}

export async function fetchContextSnapshot(
  snapshotId: string,
): Promise<ContextSnapshotRecord> {
  return fetchStage1<ContextSnapshotRecord>(
    `/context-snapshots/${encodeURIComponent(snapshotId)}`,
  );
}

export async function listContextSnapshots(input: {
  symbol?: string;
  limit?: number;
} = {}): Promise<{ items: ContextSnapshotRecord[]; count: number }> {
  const params = new URLSearchParams();
  if (input.symbol) {
    params.set("symbol", input.symbol.toUpperCase());
  }
  if (input.limit !== undefined) {
    params.set("limit", String(input.limit));
  }
  const query = params.toString();
  const path = query ? `/context-snapshots?${query}` : "/context-snapshots";
  return fetchStage1<{ items: ContextSnapshotRecord[]; count: number }>(path);
}

export async function buildAndPersistContextSnapshot(input: {
  symbol: string;
  taskType?: string;
  asof_ts?: string;
  snapshot_id?: string;
  reranker?: ContextWeightReranker;
  fetchBuild?: (symbol: string, taskType: string) => Promise<IntelContextBuildResponse>;
  persist?: (payload: ContextSnapshotPayload) => Promise<ContextSnapshotRecord>;
}): Promise<ContextSnapshotRecord> {
  const symbol = input.symbol.toUpperCase();
  const taskType = input.taskType ?? "decision";
  const asof_ts = input.asof_ts ?? new Date().toISOString();
  const fetchBuild = input.fetchBuild ?? fetchIntelContextBuild;
  const persist = input.persist ?? persistContextSnapshot;
  const reranker = input.reranker ?? noopContextWeightReranker;

  const build = await fetchBuild(symbol, taskType);
  const rawItems = weightedItemsFromIntelBuild(build, symbol, asof_ts);
  const adjustments = await reranker.suggestAdjustments(rawItems);
  const items = finalizeWeightedItems(rawItems, adjustments);
  const payload = buildContextSnapshotPayload({
    symbol,
    items,
    asof_ts,
    snapshot_id: input.snapshot_id,
  });
  return persist(payload);
}
