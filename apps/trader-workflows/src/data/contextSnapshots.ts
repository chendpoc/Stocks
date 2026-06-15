import { fetchIntel, fetchStage1, Stage1ApiError } from "../api/client.js";
import {
  buildContextSnapshotPayload,
  ContextSnapshotConflictError,
} from "../services/context/snapshots.js";
import type {
  ContextSnapshotPayload,
  ContextSnapshotRecord,
  ContextWeightReranker,
  IntelContextBuildResponse,
} from "../services/context/types.js";
import {
  finalizeWeightedItems,
  noopContextWeightReranker,
  weightedItemsFromIntelBuild,
} from "../services/context/weighting.js";

export async function fetchIntelContextBuild(
  symbol: string,
  taskType = "decision",
): Promise<IntelContextBuildResponse> {
  return fetchIntel<IntelContextBuildResponse>("/context/build", {
    method: "POST",
    json: {
      symbols: [symbol.toUpperCase()],
      taskType,
    },
  });
}

export async function persistContextSnapshot(
  payload: ContextSnapshotPayload,
): Promise<ContextSnapshotRecord> {
  try {
    return await fetchStage1<ContextSnapshotRecord>("/context-snapshots", {
      method: "POST",
      json: payload,
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
  return fetchStage1<{ items: ContextSnapshotRecord[]; count: number }>(
    "/context-snapshots",
    {
      searchParams: {
        symbol: input.symbol?.toUpperCase(),
        limit: input.limit,
      },
    },
  );
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
