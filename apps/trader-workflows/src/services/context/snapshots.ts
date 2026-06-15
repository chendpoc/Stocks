import { createHash } from "node:crypto";

import { fetchIntel, fetchStage1, Stage1ApiError } from "../../api/client.js";
import type {
  ContextSnapshotPayload,
  ContextSnapshotRecord,
  ContextSnapshotSummary,
  ContextWeightReranker,
  IntelContextBuildResponse,
  WeightedContextItem,
} from "./types.js";
import {
  collectEvidenceRefs,
  finalizeWeightedItems,
  noopContextWeightReranker,
  sourceTypeCounts,
  WEIGHTING_POLICY_VERSION,
  weightedItemsFromIntelBuild,
} from "./weighting.js";

export const CONTEXT_VERSION = "stage1-context-v0";

export class ContextSnapshotConflictError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
  }
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
