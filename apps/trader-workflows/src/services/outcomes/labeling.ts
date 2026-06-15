import type { OutcomeHorizon } from "../../types/decisions.js";
import type {
  BarrierResult,
  DecisionOutcomeRow,
  InsightCandidateOutcomeLabelPayload,
  InsightCandidateOutcomeRow,
  MarketBar,
  NormalizedOutcomeLabel,
  OutcomeLabelMetrics,
  OutcomeLabelPayload,
  OutcomeSourceType,
} from "../../types/outcomes.js";
import {
  INSIGHT_CANDIDATE_OUTCOME_HORIZONS,
  type InsightCandidateOutcomeHorizon,
} from "../../types/outcomes.js";
import { normalizeSymbol } from "../../utils/symbol.js";

const DEFAULT_BENCHMARK_BY_SYMBOL: Record<string, string> = {
  TSLA: "QQQ",
  AAPL: "QQQ",
  NVDA: "QQQ",
  GOOG: "QQQ",
  GOOGL: "QQQ",
  MSFT: "QQQ",
  META: "QQQ",
  SPY: "SPY",
  QQQ: "QQQ",
  COIN: "QQQ",
  BMNR: "QQQ",
};

export function normalizeOutcomeLabel(input: {
  source_label: string;
  source_type: OutcomeSourceType;
}): NormalizedOutcomeLabel {
  const { source_label } = input;
  switch (source_label) {
    case "hit":
    case "target_hit":
    case "positive":
    case "candidate_supported":
      return "hit";
    case "miss":
    case "invalidated":
    case "negative":
    case "candidate_contradicted":
      return "miss";
    case "neutral":
      return "neutral";
    case "invalid":
    case "failed":
      return "invalid";
    case "insufficient_data":
      return "insufficient_data";
    default:
      return "neutral";
  }
}

export function normalizeDecisionLabel(source_label: string): NormalizedOutcomeLabel {
  return normalizeOutcomeLabel({ source_label, source_type: "decision" });
}

export function normalizeInsightLabel(source_label: string): NormalizedOutcomeLabel {
  return normalizeOutcomeLabel({ source_label, source_type: "insight_candidate" });
}

export function resolveBenchmarkSymbol(symbol: string): string {
  const base = normalizeSymbol(symbol);
  return DEFAULT_BENCHMARK_BY_SYMBOL[base] ?? "QQQ";
}

function pctChange(from: number, to: number): number {
  if (from === 0) {
    return 0;
  }
  return ((to - from) / from) * 100;
}

function parseThreshold(text: string | null | undefined, keyword: string): number | null {
  if (!text) {
    return null;
  }
  const lower = text.toLowerCase();
  if (!lower.includes(keyword)) {
    return null;
  }
  const match = lower.match(/(\d+(?:\.\d+)?)/);
  return match ? Number.parseFloat(match[1]) : null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function resolvePositivePctFromPrice(entryPrice: number, targetPrice: number | null): number | null {
  if (entryPrice <= 0 || targetPrice === null || targetPrice <= entryPrice) {
    return null;
  }
  return ((targetPrice - entryPrice) / entryPrice) * 100;
}

function resolveStopPctFromPrice(entryPrice: number, stopPrice: number | null): number | null {
  if (entryPrice <= 0 || stopPrice === null || stopPrice >= entryPrice) {
    return null;
  }
  return ((entryPrice - stopPrice) / entryPrice) * 100;
}

export function computeTripleBarrierResult(input: {
  bars: MarketBar[];
  entry_price: number;
  profit_barrier_pct?: number | null;
  stop_barrier_pct?: number | null;
  time_barrier_bars?: number | null;
}): BarrierResult {
  const entry = input.entry_price;
  const profitPct = input.profit_barrier_pct ?? 2;
  const stopPct = input.stop_barrier_pct ?? 1.5;
  if (entry <= 0 || profitPct <= 0 || stopPct <= 0) {
    return "none";
  }

  const horizon = input.time_barrier_bars && input.time_barrier_bars > 0
    ? Math.min(input.bars.length, input.time_barrier_bars)
    : input.bars.length;
  const path = input.bars.slice(0, horizon);
  if (path.length === 0) {
    return "none";
  }

  const profitPrice = entry * (1 + profitPct / 100);
  const stopPrice = entry * (1 - stopPct / 100);
  for (const bar of path) {
    const high = toFiniteNumber(bar.high ?? bar.close);
    const low = toFiniteNumber(bar.low ?? bar.close);
    if (high === null || low === null) {
      continue;
    }
    const hitProfit = high >= profitPrice;
    const hitStop = low <= stopPrice;
    if (hitProfit && hitStop) {
      return "hit_stop_first";
    }
    if (hitProfit) {
      return "hit_profit_first";
    }
    if (hitStop) {
      return "hit_stop_first";
    }
  }
  return "hit_time_first";
}

export function resolveTripleBarrierTimeBars(input: {
  horizon: string;
  bars: MarketBar[];
  due_at?: string | null;
  explicit_time_barrier_bars?: number | null;
}): number {
  if (
    input.explicit_time_barrier_bars !== null &&
    input.explicit_time_barrier_bars !== undefined &&
    input.explicit_time_barrier_bars > 0
  ) {
    return Math.floor(input.explicit_time_barrier_bars);
  }

  if (input.due_at) {
    const dueAtMs = Date.parse(input.due_at);
    if (Number.isFinite(dueAtMs)) {
      const dueIndex = input.bars.findIndex((bar) => Date.parse(bar.ts) >= dueAtMs);
      if (dueIndex >= 0) {
        return Math.max(1, dueIndex);
      }
    }
  }

  switch (input.horizon as OutcomeHorizon) {
    case "30m":
      return 1;
    case "1h":
      return 2;
    case "EOD":
      return 3;
    case "1d":
      return Math.min(4, Math.max(1, input.bars.length - 1));
    case "3d":
      return Math.max(1, input.bars.length - 1);
    default:
      return Math.max(1, input.bars.length - 1);
  }
}

export function computeOutcomeLabelMetrics(input: {
  horizon: string;
  reference_price: number;
  future_price: number;
  benchmark_reference_price: number;
  benchmark_future_price: number;
  invalidation?: string | null;
  target_plan?: string | null;
  barrier_result?: BarrierResult;
  symbol: string;
}): OutcomeLabelMetrics {
  const absolute_return_pct = pctChange(input.reference_price, input.future_price);
  const benchmark_return_pct = pctChange(
    input.benchmark_reference_price,
    input.benchmark_future_price,
  );
  const relative_return_pct = absolute_return_pct - benchmark_return_pct;

  const invalidationBelow = parseThreshold(input.invalidation, "below");
  const invalidationAbove = parseThreshold(input.invalidation, "above");
  let hit_invalidation_proxy = false;
  if (invalidationBelow !== null) {
    hit_invalidation_proxy = input.future_price < invalidationBelow;
  } else if (invalidationAbove !== null) {
    hit_invalidation_proxy = input.future_price > invalidationAbove;
  }

  const targetAbove = parseThreshold(input.target_plan, "near") ??
    parseThreshold(input.target_plan, "above") ??
    parseThreshold(input.target_plan, "target");
  let hit_target_proxy = false;
  if (targetAbove !== null) {
    hit_target_proxy = input.future_price >= targetAbove;
  }

  let label = "neutral";
  if (hit_invalidation_proxy) {
    label = "invalidated";
  } else if (hit_target_proxy) {
    label = "target_hit";
  } else if (relative_return_pct > 0.5) {
    label = "positive";
  } else if (relative_return_pct < -0.5) {
    label = "negative";
  }

  return {
    reference_price: input.reference_price,
    future_price: input.future_price,
    absolute_return_pct,
    benchmark_symbol: resolveBenchmarkSymbol(input.symbol),
    benchmark_return_pct,
    relative_return_pct,
    hit_invalidation_proxy,
    hit_target_proxy,
    barrier_result: input.barrier_result ?? "none",
    label,
  };
}

export function selectHorizonPrices(input: {
  horizon: string;
  symbolBars: MarketBar[];
  benchmarkBars: MarketBar[];
  due_at?: string | null;
}): {
  reference_price: number;
  future_price: number;
  benchmark_reference_price: number;
  benchmark_future_price: number;
} | null {
  const symbolBars = [...input.symbolBars].sort((a, b) => a.ts.localeCompare(b.ts));
  const benchmarkBars = [...input.benchmarkBars].sort((a, b) => a.ts.localeCompare(b.ts));
  if (symbolBars.length < 2 || benchmarkBars.length < 2) {
    return null;
  }

  const horizonIndex = resolveOutcomeHorizonIndex({
    symbolBars,
    due_at: input.due_at,
    horizon: input.horizon,
  });
  if (horizonIndex === null) {
    return null;
  }

  const ref = symbolBars[0];
  const future = symbolBars[horizonIndex];
  const benchRef = benchmarkBars[0];
  const benchFuture = benchmarkBars[Math.min(horizonIndex, benchmarkBars.length - 1)];

  if (
    ref.close === undefined ||
    future.close === undefined ||
    benchRef.close === undefined ||
    benchFuture.close === undefined
  ) {
    return null;
  }

  return {
    reference_price: ref.close,
    future_price: future.close,
    benchmark_reference_price: benchRef.close,
    benchmark_future_price: benchFuture.close,
  };
}

export function resolveOutcomeBarQuery(horizon: string): {
  timeframe: string;
  limit: number;
} {
  switch (horizon as OutcomeHorizon) {
    case "30m":
      return { timeframe: "5m", limit: 24 };
    case "1h":
      return { timeframe: "5m", limit: 36 };
    case "EOD":
      return { timeframe: "5m", limit: 120 };
    case "1d":
      return { timeframe: "1d", limit: 5 };
    case "3d":
      return { timeframe: "1d", limit: 10 };
    default:
      return { timeframe: "1d", limit: 10 };
  }
}

export function isSupportedInsightCandidateOutcomeHorizon(
  horizon: string,
): horizon is InsightCandidateOutcomeHorizon {
  return (INSIGHT_CANDIDATE_OUTCOME_HORIZONS as readonly string[]).includes(horizon);
}

export function resolveInsightCandidateOutcomeBarQuery(horizon: string): {
  timeframe: string;
  limit: number;
} {
  if (!isSupportedInsightCandidateOutcomeHorizon(horizon)) {
    return { timeframe: "1d", limit: 10 };
  }
  const limit = horizon === "4h" ? 200 : 50;
  return { timeframe: "1m", limit };
}

function resolveOutcomeHorizonIndex(input: {
  symbolBars: MarketBar[];
  due_at?: string | null;
  horizon: string;
}): number | null {
  const maxIndex = input.symbolBars.length - 1;
  const dueAtMs = input.due_at ? Date.parse(input.due_at) : Number.NaN;
  if (Number.isFinite(dueAtMs)) {
    const dueIndex = input.symbolBars.findIndex((bar) => Date.parse(bar.ts) >= dueAtMs);
    if (dueIndex <= 0) {
      return null;
    }
    return Math.min(dueIndex, maxIndex);
  }
  switch (input.horizon as OutcomeHorizon) {
    case "30m":
      return Math.min(1, maxIndex);
    case "1h":
      return Math.min(2, maxIndex);
    case "EOD":
      return Math.min(3, maxIndex);
    case "1d":
      return Math.min(4, maxIndex);
    case "3d":
    default:
      return maxIndex;
  }
}

export function buildCompactEvidenceSummary(input: {
  symbol: string;
  horizon: string;
  reference_price: number;
  future_price: number;
  benchmark_symbol: string;
  benchmark_return_pct: number;
  absolute_return_pct: number;
  relative_return_pct: number;
}): string {
  const lines = [
    `symbol: ${input.symbol}  horizon: ${input.horizon}`,
    `ref: ${input.reference_price.toFixed(2)}  now: ${input.future_price.toFixed(2)}`,
    `return: ${input.absolute_return_pct.toFixed(2)}%  vs ${input.benchmark_symbol}: ${input.relative_return_pct.toFixed(2)}%`,
    `benchmark_return: ${input.benchmark_return_pct.toFixed(2)}%`,
  ];
  return lines.join("\n");
}

export async function buildOutcomeLabelPayload(input: {
  outcome: DecisionOutcomeRow;
  symbolBars?: MarketBar[];
  benchmarkBars?: MarketBar[];
  fetchBars?: (symbol: string, timeframe: string, limit: number) => Promise<MarketBar[]>;
  fetchDecision?: (decision_id: string) => Promise<{
    decision_id: string;
    symbol: string;
    action: string;
    decision_json: Record<string, unknown>;
  }>;
}): Promise<OutcomeLabelPayload> {
  if (!input.fetchDecision) {
    throw new Error("buildOutcomeLabelPayload requires fetchDecision");
  }
  const fetchBars = input.fetchBars;
  const fetchDecision = input.fetchDecision;
  const needsFetchedBars = !input.symbolBars || !input.benchmarkBars;
  if (needsFetchedBars && !fetchBars) {
    throw new Error("buildOutcomeLabelPayload requires fetchBars when bars are not provided");
  }

  try {
    const decision = await fetchDecision(input.outcome.decision_id);
    const decisionJson = decision.decision_json;
    const benchmark = resolveBenchmarkSymbol(input.outcome.symbol);
    const barQuery = resolveOutcomeBarQuery(input.outcome.horizon);

    const symbolBars =
      input.symbolBars ??
      (await fetchBars!(input.outcome.symbol, barQuery.timeframe, barQuery.limit));
    const benchmarkBars =
      input.benchmarkBars ??
      (await fetchBars!(benchmark, barQuery.timeframe, barQuery.limit));

    const prices = selectHorizonPrices({
      horizon: input.outcome.horizon,
      symbolBars,
      benchmarkBars,
      due_at: input.outcome.due_at,
    });

    if (!prices) {
      return {
        status: "skipped",
        reference_price: 0,
        future_price: 0,
        absolute_return_pct: 0,
        benchmark_symbol: benchmark,
        benchmark_return_pct: 0,
        relative_return_pct: 0,
        hit_invalidation_proxy: false,
        hit_target_proxy: false,
        barrier_result: "none",
        label: "insufficient_data",
        outcome_json: {
          reason: "insufficient_market_bars",
          horizon: input.outcome.horizon,
        },
      };
    }

    const metrics = computeOutcomeLabelMetrics({
      horizon: input.outcome.horizon,
      symbol: input.outcome.symbol,
      invalidation:
        typeof decisionJson.invalidation === "string" ? decisionJson.invalidation : null,
      target_plan:
        typeof decisionJson.target_plan === "string" ? decisionJson.target_plan : null,
      barrier_result: computeTripleBarrierResult({
        bars: symbolBars.slice(1),
        entry_price: prices.reference_price,
        profit_barrier_pct:
          toFiniteNumber(decisionJson.profit_barrier_pct) ??
          resolvePositivePctFromPrice(
            prices.reference_price,
            typeof decisionJson.target_plan === "string"
              ? parseThreshold(decisionJson.target_plan, "near") ??
              parseThreshold(decisionJson.target_plan, "above") ??
              parseThreshold(decisionJson.target_plan, "target")
              : null,
          ),
        stop_barrier_pct:
          toFiniteNumber(decisionJson.stop_barrier_pct) ??
          resolveStopPctFromPrice(
            prices.reference_price,
            typeof decisionJson.invalidation === "string"
              ? parseThreshold(decisionJson.invalidation, "below")
              : null,
          ),
        time_barrier_bars: resolveTripleBarrierTimeBars({
          horizon: input.outcome.horizon,
          bars: symbolBars,
          due_at: input.outcome.due_at,
          explicit_time_barrier_bars: toFiniteNumber(decisionJson.time_barrier_bars),
        }),
      }),
      ...prices,
    });

    return {
      status: "labeled",
      ...metrics,
      outcome_json: {
        horizon: input.outcome.horizon,
        path: input.outcome.path,
        action: decision.action,
        metrics,
      },
    };
  } catch (error) {
    return {
      status: "failed",
      reference_price: 0,
      future_price: 0,
      absolute_return_pct: 0,
      benchmark_symbol: resolveBenchmarkSymbol(input.outcome.symbol),
      benchmark_return_pct: 0,
      relative_return_pct: 0,
      hit_invalidation_proxy: false,
      hit_target_proxy: false,
      barrier_result: "none",
      label: "failed",
      outcome_json: {
        reason: error instanceof Error ? error.message : "unknown_error",
        horizon: input.outcome.horizon,
      },
    };
  }
}

export async function buildInsightCandidateOutcomeLabelPayload(input: {
  outcome: InsightCandidateOutcomeRow;
  symbolBars?: MarketBar[];
  benchmarkBars?: MarketBar[];
  fetchBars?: (symbol: string, timeframe: string, limit: number) => Promise<MarketBar[]>;
}): Promise<InsightCandidateOutcomeLabelPayload> {
  const fetchBars = input.fetchBars;
  const needsFetchedBars = !input.symbolBars || !input.benchmarkBars;
  if (needsFetchedBars && !fetchBars) {
    throw new Error("buildInsightCandidateOutcomeLabelPayload requires fetchBars when bars are not provided");
  }

  try {
    const benchmark = resolveBenchmarkSymbol(input.outcome.symbol);
    const barQuery = resolveInsightCandidateOutcomeBarQuery(input.outcome.horizon);

    const symbolBars =
      input.symbolBars ??
      (await fetchBars!(input.outcome.symbol, barQuery.timeframe, barQuery.limit));
    const benchmarkBars =
      input.benchmarkBars ??
      (await fetchBars!(benchmark, barQuery.timeframe, barQuery.limit));

    if (symbolBars.length < 2 || benchmarkBars.length < 2) {
      return {
        status: "skipped",
        normalized_label: "insufficient_data",
        reason_codes_json: ["insufficient_market_bars"],
        outcome_json: {
          reason: "insufficient_market_bars",
          horizon: input.outcome.horizon,
        },
      };
    }

    const reference_price = symbolBars[0].close;
    const future_price = symbolBars[symbolBars.length - 1].close;
    const absolute_return_pct = ((future_price - reference_price) / reference_price) * 100;
    const benchmark_return_pct =
      ((benchmarkBars[benchmarkBars.length - 1].close - benchmarkBars[0].close) /
        benchmarkBars[0].close) * 100;
    const relative_return_pct = absolute_return_pct - benchmark_return_pct;

    return {
      status: "labeled",
      normalized_label: relative_return_pct > 0.5 ? "hit" : relative_return_pct < -0.5 ? "miss" : "neutral",
      reason_codes_json: [],
      outcome_json: {
        horizon: input.outcome.horizon,
        reference_price,
        future_price,
        absolute_return_pct,
        benchmark_symbol: benchmark,
        benchmark_return_pct,
        relative_return_pct,
        evidence_summary: buildCompactEvidenceSummary({
          symbol: input.outcome.symbol,
          horizon: input.outcome.horizon,
          reference_price,
          future_price,
          benchmark_symbol: benchmark,
          benchmark_return_pct,
          absolute_return_pct,
          relative_return_pct,
        }),
      },
    };
  } catch (error) {
    return {
      status: "failed",
      normalized_label: "invalid",
      reason_codes_json: [],
      outcome_json: {
        reason: error instanceof Error ? error.message : "unknown_error",
        horizon: input.outcome.horizon,
      },
    };
  }
}
