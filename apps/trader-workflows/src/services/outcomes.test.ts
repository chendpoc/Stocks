import assert from "node:assert/strict";
import test from "node:test";

import { OUTCOME_HORIZONS } from "./decisions.js";
import {
  buildOutcomeLabelPayload,
  computeOutcomeLabelMetrics,
  finalizeDueOutcome,
  isSupportedOutcomeHorizon,
  resolveOutcomeBarQuery,
  resolveBenchmarkSymbol,
  selectHorizonPrices,
  type DecisionOutcomeRow,
  type MarketBar,
} from "./outcomes.js";

const SYMBOL_BARS: MarketBar[] = [
  { ts: "2026-06-01T09:30:00Z", close: 100 },
  { ts: "2026-06-01T10:00:00Z", close: 101 },
  { ts: "2026-06-01T11:00:00Z", close: 102 },
  { ts: "2026-06-01T12:00:00Z", close: 103 },
  { ts: "2026-06-01T13:00:00Z", close: 104 },
  { ts: "2026-06-02T09:30:00Z", close: 110 },
];

const BENCHMARK_BARS: MarketBar[] = [
  { ts: "2026-06-01T09:30:00Z", close: 400 },
  { ts: "2026-06-01T10:00:00Z", close: 401 },
  { ts: "2026-06-01T11:00:00Z", close: 401.5 },
  { ts: "2026-06-01T12:00:00Z", close: 402 },
  { ts: "2026-06-01T13:00:00Z", close: 402.5 },
  { ts: "2026-06-02T09:30:00Z", close: 405 },
];

test("resolveBenchmarkSymbol maps core symbols deterministically", () => {
  assert.equal(resolveBenchmarkSymbol("TSLA"), "QQQ");
  assert.equal(resolveBenchmarkSymbol("SPY"), "SPY");
  assert.equal(resolveBenchmarkSymbol("UNKNOWN"), "QQQ");
});

test("computeOutcomeLabelMetrics is deterministic for same inputs", () => {
  const first = computeOutcomeLabelMetrics({
    horizon: "1d",
    symbol: "TSLA",
    reference_price: 100,
    future_price: 110,
    benchmark_reference_price: 400,
    benchmark_future_price: 404,
    invalidation: "close below 105",
    target_plan: "scale out near 120",
  });
  const second = computeOutcomeLabelMetrics({
    horizon: "1d",
    symbol: "TSLA",
    reference_price: 100,
    future_price: 110,
    benchmark_reference_price: 400,
    benchmark_future_price: 404,
    invalidation: "close below 105",
    target_plan: "scale out near 120",
  });

  assert.deepEqual(first, second);
  assert.equal(first.absolute_return_pct, 10);
  assert.equal(first.benchmark_return_pct, 1);
  assert.equal(first.relative_return_pct, 9);
  assert.equal(first.hit_invalidation_proxy, false);
  assert.equal(first.hit_target_proxy, false);
  assert.equal(first.label, "positive");
});

test("computeOutcomeLabelMetrics detects invalidation and target proxies", () => {
  const invalidated = computeOutcomeLabelMetrics({
    horizon: "EOD",
    symbol: "TSLA",
    reference_price: 100,
    future_price: 104,
    benchmark_reference_price: 400,
    benchmark_future_price: 401,
    invalidation: "close below 105",
    target_plan: "scale out near 120",
  });
  assert.equal(invalidated.hit_invalidation_proxy, true);
  assert.equal(invalidated.label, "invalidated");

  const targetHit = computeOutcomeLabelMetrics({
    horizon: "3d",
    symbol: "TSLA",
    reference_price: 100,
    future_price: 121,
    benchmark_reference_price: 400,
    benchmark_future_price: 402,
    invalidation: "close below 95",
    target_plan: "scale out near 120",
  });
  assert.equal(targetHit.hit_target_proxy, true);
  assert.equal(targetHit.label, "target_hit");
});

test("selectHorizonPrices supports fixed horizons", () => {
  for (const horizon of OUTCOME_HORIZONS) {
    const prices = selectHorizonPrices({
      horizon,
      symbolBars: SYMBOL_BARS,
      benchmarkBars: BENCHMARK_BARS,
    });
    assert.ok(prices, `expected prices for ${horizon}`);
    assert.ok(prices!.future_price >= prices!.reference_price);
  }
  assert.ok(isSupportedOutcomeHorizon("1d"));
  assert.equal(isSupportedOutcomeHorizon("2d"), false);
});

test("selectHorizonPrices uses due_at to select the future bar", () => {
  const prices = selectHorizonPrices({
    horizon: "30m",
    symbolBars: SYMBOL_BARS,
    benchmarkBars: BENCHMARK_BARS,
    due_at: "2026-06-01T12:00:00Z",
  });

  assert.ok(prices);
  assert.equal(prices.reference_price, 100);
  assert.equal(prices.future_price, 103);
  assert.equal(prices.benchmark_reference_price, 400);
  assert.equal(prices.benchmark_future_price, 402);
});

test("selectHorizonPrices returns null when no bar reaches due_at", () => {
  const prices = selectHorizonPrices({
    horizon: "3d",
    symbolBars: SYMBOL_BARS,
    benchmarkBars: BENCHMARK_BARS,
    due_at: "2026-06-10T09:30:00Z",
  });

  assert.equal(prices, null);
});

test("resolveOutcomeBarQuery uses intraday bars for short horizons", () => {
  assert.deepEqual(resolveOutcomeBarQuery("30m"), { timeframe: "5m", limit: 24 });
  assert.deepEqual(resolveOutcomeBarQuery("1h"), { timeframe: "5m", limit: 36 });
  assert.deepEqual(resolveOutcomeBarQuery("EOD"), { timeframe: "5m", limit: 120 });
  assert.deepEqual(resolveOutcomeBarQuery("1d"), { timeframe: "1d", limit: 5 });
  assert.deepEqual(resolveOutcomeBarQuery("3d"), { timeframe: "1d", limit: 10 });
});

test("buildOutcomeLabelPayload returns skipped when market data is insufficient", async () => {
  const outcome: DecisionOutcomeRow = {
    outcome_id: "out-1",
    decision_id: "dec-1",
    symbol: "TSLA",
    horizon: "1d",
    path: "model_path",
    status: "pending",
  };

  const payload = await buildOutcomeLabelPayload({
    outcome,
    symbolBars: [{ ts: "2026-06-01", close: 100 }],
    benchmarkBars: [{ ts: "2026-06-01", close: 400 }],
    fetchDecision: async () => ({
      decision_id: "dec-1",
      symbol: "TSLA",
      action: "watch",
      decision_json: { invalidation: "below 90" },
    }),
  });

  assert.equal(payload.status, "skipped");
  assert.equal(payload.label, "insufficient_data");
});

test("buildOutcomeLabelPayload fetches bars by horizon timeframe", async () => {
  const calls: Array<{ symbol: string; timeframe: string; limit: number }> = [];
  const payload = await buildOutcomeLabelPayload({
    outcome: {
      outcome_id: "out-1h",
      decision_id: "dec-1h",
      symbol: "TSLA",
      horizon: "1h",
      path: "model_path",
      status: "pending",
      due_at: "2026-06-01T11:00:00Z",
    },
    fetchBars: async (symbol, timeframe, limit) => {
      calls.push({ symbol, timeframe, limit });
      return symbol === "TSLA" ? SYMBOL_BARS : BENCHMARK_BARS;
    },
    fetchDecision: async () => ({
      decision_id: "dec-1h",
      symbol: "TSLA",
      action: "watch",
      decision_json: { invalidation: "below 90" },
    }),
  });

  assert.equal(payload.status, "labeled");
  assert.deepEqual(calls, [
    { symbol: "TSLA", timeframe: "5m", limit: 36 },
    { symbol: "QQQ", timeframe: "5m", limit: 36 },
  ]);
  assert.equal(payload.future_price, 102);
});

test("finalizeDueOutcome labels pending row exactly once", async () => {
  const outcome: DecisionOutcomeRow = {
    outcome_id: "out-2",
    decision_id: "dec-2",
    symbol: "TSLA",
    horizon: "3d",
    path: "model_path",
    status: "pending",
  };

  let labelCalls = 0;
  const finalized = await finalizeDueOutcome({
    outcome,
    symbolBars: SYMBOL_BARS,
    benchmarkBars: BENCHMARK_BARS,
    fetchDecision: async () => ({
      decision_id: "dec-2",
      symbol: "TSLA",
      action: "paper_enter_candidate",
      decision_json: {
        invalidation: "close below 105",
        target_plan: "scale out near 120",
      },
    }),
    label: async (outcome_id, payload) => {
      labelCalls += 1;
      assert.equal(outcome_id, "out-2");
      assert.equal(payload.status, "labeled");
      assert.equal(typeof payload.absolute_return_pct, "number");
      assert.equal(typeof payload.relative_return_pct, "number");
      return {
        ...outcome,
        status: payload.status,
        label: payload.label,
      };
    },
  });

  assert.equal(labelCalls, 1);
  assert.equal(finalized.status, "labeled");
});

test("finalizeDueOutcome rejects non-pending rows", async () => {
  await assert.rejects(
    () =>
      finalizeDueOutcome({
        outcome: {
          outcome_id: "out-3",
          decision_id: "dec-3",
          symbol: "TSLA",
          horizon: "1h",
          path: "model_path",
          status: "labeled",
        },
      }),
    /not pending/,
  );
});
