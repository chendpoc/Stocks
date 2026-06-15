import assert from "node:assert/strict";
import test from "node:test";

import { captureFetchCall } from "../test/fetchTestUtils.js";
import { Stage1ApiError } from "../api/client.js";
import {
  applyRerankAdjustments,
  buildAndPersistContextSnapshot,
  buildContextSnapshotPayload,
  collectEvidenceRefs,
  computeContextHash,
  ContextSnapshotConflictError,
  fetchContextSnapshot,
  finalizeWeightedItems,
  listContextSnapshots,
  MAX_COMPOSITE_WEIGHT,
  MAX_RERANK_DELTA,
  persistContextSnapshot,
  type ContextWeightReranker,
  type IntelContextBuildResponse,
  weightedItemsFromIntelBuild,
  WEIGHTING_POLICY_VERSION,
} from "./contextSnapshots.js";
const SAMPLE_BUILD: IntelContextBuildResponse = {
  market_data: {
    TSLA: {
      daily: [
        { ts: "2026-05-30", close: 100 },
        { ts: "2026-05-31", close: 105 },
      ],
      minute: [{ ts: "2026-05-31T15:55:00", close: 104.5 }],
    },
  },
  signals: [
    {
      signal_id: "sig-1",
      symbol: "TSLA",
      ts: "2026-05-31T10:00:00Z",
      signal_type: "breakout",
      raw_description: "Price broke prior high",
      severity: 0.8,
    },
  ],
  events: [
    {
      event_id: "evt-1",
      title: "Delivery update",
      ts: "2026-05-31T08:00:00Z",
      severity: 0.6,
    },
  ],
  lessons: [
    {
      lesson_id: "les-1",
      summary: "Wait for confirmation",
      confidence: 0.7,
      source_type: "seed",
    },
  ],
  corpus: [
    {
      section_id: "sec-1",
      heading_path: "Risk / Position sizing",
      snippet: "Size down into events",
      source_path: "docs/summaries/example.md",
      source_date: "2026-05-20",
    },
  ],
  patterns: [
    {
      pattern_id: "pat-1",
      name: "Pullback continuation",
      description: "Higher low after breakout",
      reliability_score: 0.72,
    },
  ],
  related_hypotheses: [
    {
      claim: "Momentum persists into earnings",
      confidence: 0.55,
      date: "2026-05-29",
      symbol: "TSLA",
    },
  ],
};

test("weightedItemsFromIntelBuild uses evidence_ref instead of raw payloads", () => {
  const asof = "2026-06-01T12:00:00Z";
  const items = weightedItemsFromIntelBuild(SAMPLE_BUILD, "TSLA", asof);

  assert.ok(items.length >= 6);
  for (const item of items) {
    assert.ok(item.evidence_ref.ref_type);
    assert.ok(item.evidence_ref.ref_id);
    assert.equal(typeof item.summary, "string");
    assert.ok(item.summary.length > 0);
    assert.equal(typeof item.confidence, "number");
    assert.equal(typeof item.relevance_weight, "number");
    assert.equal(typeof item.freshness_weight, "number");
    assert.equal(typeof item.source_quality_weight, "number");
    assert.ok(item.verification_status);
    assert.ok(item.composite_weight <= MAX_COMPOSITE_WEIGHT);
    assert.equal("raw_description" in item, false);
    assert.equal("snippet" in item, false);
  }

  const signal = items.find((item) => item.source_type === "signal");
  assert.ok(signal);
  assert.equal(signal.evidence_ref.ref_type, "intel_signal");
  assert.equal(signal.evidence_ref.ref_id, "sig-1");
});

test("finalizeWeightedItems caps composite weight and rerank delta", () => {
  const asof = "2026-06-01T12:00:00Z";
  const items = weightedItemsFromIntelBuild(SAMPLE_BUILD, "TSLA", asof);
  const first = items[0];

  const reranked = finalizeWeightedItems(items, [
    { item_id: first.item_id, relevance_delta: 5 },
    { item_id: first.item_id, relevance_delta: -5 },
  ]);
  const updated = reranked.find((item) => item.item_id === first.item_id);
  assert.ok(updated);
  assert.ok(updated.relevance_weight <= first.relevance_weight + MAX_RERANK_DELTA + 1e-9);
  assert.ok(updated.composite_weight <= MAX_COMPOSITE_WEIGHT);
});

test("applyRerankAdjustments never accepts pure LLM final weights", () => {
  const base = weightedItemsFromIntelBuild(
    SAMPLE_BUILD,
    "TSLA",
    "2026-06-01T12:00:00Z",
  )[0];
  const adjusted = applyRerankAdjustments([base], [
    { item_id: base.item_id, relevance_delta: MAX_RERANK_DELTA },
  ])[0];

  assert.notEqual(adjusted.composite_weight, 999);
  assert.ok(adjusted.composite_weight <= MAX_COMPOSITE_WEIGHT);
  assert.ok(adjusted.relevance_weight <= MAX_COMPOSITE_WEIGHT);
});

test("computeContextHash is stable for identical weighted items", () => {
  const asof = "2026-06-01T12:00:00Z";
  const items = weightedItemsFromIntelBuild(SAMPLE_BUILD, "TSLA", asof);
  const hashA = computeContextHash({
    symbol: "TSLA",
    asof_ts: asof,
    context_version: "stage1-context-v0",
    weighting_policy_version: WEIGHTING_POLICY_VERSION,
    items,
  });
  const hashB = computeContextHash({
    symbol: "TSLA",
    asof_ts: asof,
    context_version: "stage1-context-v0",
    weighting_policy_version: WEIGHTING_POLICY_VERSION,
    items,
  });
  assert.equal(hashA, hashB);
  assert.equal(hashA.length, 64);
});

test("buildContextSnapshotPayload includes evidence refs and deterministic hash", () => {
  const asof = "2026-06-01T12:00:00Z";
  const items = weightedItemsFromIntelBuild(SAMPLE_BUILD, "TSLA", asof);
  const payload = buildContextSnapshotPayload({
    symbol: "TSLA",
    items,
    asof_ts: asof,
    snapshot_id: "snap-test-1",
  });

  assert.equal(payload.snapshot_id, "snap-test-1");
  assert.equal(payload.symbol, "TSLA");
  assert.ok(payload.evidence_refs_json.length > 0);
  assert.equal(payload.weighting_policy_version, WEIGHTING_POLICY_VERSION);
  assert.equal(payload.context_hash, computeContextHash({
    symbol: "TSLA",
    asof_ts: asof,
    context_version: payload.context_version,
    weighting_policy_version: payload.weighting_policy_version,
    items,
  }));
});

test("empty source data produces a stable empty snapshot payload", () => {
  const asof = "2026-06-01T12:00:00Z";
  const items = weightedItemsFromIntelBuild({}, "TSLA", asof);
  const first = buildContextSnapshotPayload({ symbol: "tsla", items, asof_ts: asof });
  const second = buildContextSnapshotPayload({ symbol: "TSLA", items, asof_ts: asof });

  assert.deepEqual(items, []);
  assert.equal(first.symbol, "TSLA");
  assert.deepEqual(first.items_json, []);
  assert.deepEqual(first.evidence_refs_json, []);
  assert.equal(first.context_hash, second.context_hash);
  assert.equal(first.snapshot_id, second.snapshot_id);
});

test("buildContextSnapshotPayload dedupes evidence refs by ref_type and ref_id", () => {
  const asof = "2026-06-01T12:00:00Z";
  const [firstItem] = weightedItemsFromIntelBuild(SAMPLE_BUILD, "TSLA", asof);
  const duplicateItem = {
    ...firstItem,
    item_id: `${firstItem.item_id}-duplicate`,
    summary: "Duplicate summary for the same evidence ref",
  };
  const refs = collectEvidenceRefs([firstItem, duplicateItem]);
  const payload = buildContextSnapshotPayload({
    symbol: "TSLA",
    items: [firstItem, duplicateItem],
    asof_ts: asof,
  });

  assert.deepEqual(refs, [firstItem.evidence_ref]);
  assert.deepEqual(payload.evidence_refs_json, [firstItem.evidence_ref]);
});

test("buildAndPersistContextSnapshot is idempotent for same payload", async () => {
  const persisted: unknown[] = [];
  const fetchBuild = async () => SAMPLE_BUILD;
  const persist = async (payload: ReturnType<typeof buildContextSnapshotPayload>) => {
    const existing = persisted.find(
      (row) =>
        (row as { context_hash: string }).context_hash === payload.context_hash,
    );
    if (existing) {
      return existing as { snapshot_id: string; context_hash: string };
    }
    const record = { ...payload, created_at: "2026-06-01T12:00:01Z" };
    persisted.push(record);
    return record;
  };

  const first = await buildAndPersistContextSnapshot({
    symbol: "TSLA",
    asof_ts: "2026-06-01T12:00:00Z",
    snapshot_id: "snap-idem-1",
    fetchBuild,
    persist,
  });
  const second = await buildAndPersistContextSnapshot({
    symbol: "TSLA",
    asof_ts: "2026-06-01T12:00:00Z",
    snapshot_id: "snap-idem-1",
    fetchBuild,
    persist,
  });

  assert.equal(first.context_hash, second.context_hash);
  assert.equal(persisted.length, 1);
});

test("persistContextSnapshot surfaces backend 409 conflicts", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: false,
      status: 409,
      statusText: "Conflict",
      text: async () => "immutable context_hash conflict for existing record",
      headers: new Headers(),
    }) as Response) as typeof fetch;

  try {
    await assert.rejects(
      () =>
        persistContextSnapshot(
          buildContextSnapshotPayload({
            symbol: "TSLA",
            items: weightedItemsFromIntelBuild(
              SAMPLE_BUILD,
              "TSLA",
              "2026-06-01T12:00:00Z",
            ),
            asof_ts: "2026-06-01T12:00:00Z",
            snapshot_id: "snap-conflict",
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof ContextSnapshotConflictError);
        assert.equal(error.status, 409);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("context snapshot read APIs use bounded read-only Stage1 paths", async () => {
  const payload = buildContextSnapshotPayload({
    symbol: "TSLA",
    items: weightedItemsFromIntelBuild(SAMPLE_BUILD, "TSLA", "2026-06-01T12:00:00Z"),
    asof_ts: "2026-06-01T12:00:00Z",
    snapshot_id: "snap-readonly-1",
  });
  const record = { ...payload, created_at: "2026-06-01T12:00:01Z" };
  const calls: Array<{ url: string; method: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, options = {}) => {
    const call = await captureFetchCall(input, options);
    calls.push({ url: call.url, method: call.method });
    const url = call.url;
    if (url.endsWith("/stage1/context-snapshots?symbol=TSLA&limit=2")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [record], count: 1 }),
      } as Response;
    }
    if (url.endsWith("/stage1/context-snapshots/snap-readonly-1")) {
      return {
        ok: true,
        status: 200,
        json: async () => record,
      } as Response;
    }
    return {
      ok: false,
      status: 404,
      text: async () => `unexpected ${url}`,
    } as Response;
  }) as typeof fetch;

  try {
    const listed = await listContextSnapshots({ symbol: "tsla", limit: 2 });
    const shown = await fetchContextSnapshot("snap-readonly-1");

    assert.equal(listed.count, 1);
    assert.equal(listed.items[0]?.snapshot_id, "snap-readonly-1");
    assert.equal(shown.snapshot_id, "snap-readonly-1");
    assert.deepEqual(
      calls.map((call) => call.method),
      ["GET", "GET"],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reranker interface only adjusts bounded relevance deltas", async () => {
  const aggressiveReranker: ContextWeightReranker = {
    async suggestAdjustments(items) {
      return items.map((item) => ({
        item_id: item.item_id,
        relevance_delta: 1.0,
      }));
    },
  };

  const record = await buildAndPersistContextSnapshot({
    symbol: "TSLA",
    asof_ts: "2026-06-01T12:00:00Z",
    snapshot_id: "snap-rerank",
    reranker: aggressiveReranker,
    fetchBuild: async () => SAMPLE_BUILD,
    persist: async (payload) => ({ ...payload, created_at: "2026-06-01T12:00:01Z" }),
  });

  for (const item of record.items_json) {
    assert.ok(item.composite_weight <= MAX_COMPOSITE_WEIGHT);
    assert.ok(item.relevance_weight <= MAX_COMPOSITE_WEIGHT);
  }
});

test("Stage1ApiError preserves HTTP status for callers", () => {
  const error = new Stage1ApiError(409, "conflict");
  assert.equal(error.status, 409);
  assert.match(error.message, /conflict/);
});

test("persistContextSnapshot expects Stage1 API to return parsed JSON arrays", async () => {
  const payload = buildContextSnapshotPayload({
    symbol: "TSLA",
    items: weightedItemsFromIntelBuild(SAMPLE_BUILD, "TSLA", "2026-06-01T12:00:00Z"),
    asof_ts: "2026-06-01T12:00:00Z",
    snapshot_id: "snap-api-parsed",
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        ...payload,
        created_at: "2026-06-01T12:00:01Z",
      }),
    }) as Response) as typeof fetch;

  try {
    const record = await persistContextSnapshot(payload);
    assert.equal(Array.isArray(record.items_json), true);
    assert.ok(record.items_json.length > 0);
    assert.equal(typeof record.items_json[0]?.item_id, "string");
    const refs = record.items_json.map((item) => item.evidence_ref);
    assert.ok(refs.every((ref) => ref.ref_type && ref.ref_id));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
