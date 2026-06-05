import { fetchIntel, fetchStage1 } from "../api/client.js";
import type { OutcomeHorizon, ScheduledDecisionOutcome } from "./decisions.js";
import { OUTCOME_HORIZONS } from "./decisions.js";

export const INSIGHT_CANDIDATE_OUTCOME_HORIZONS = [
  "1m", "2m", "5m", "30m", "1h", "2h", "4h",
] as const;
export type InsightCandidateOutcomeHorizon = (typeof INSIGHT_CANDIDATE_OUTCOME_HORIZONS)[number];

export type OutcomeFinalStatus = "labeled" | "skipped" | "failed";
export type OutcomeSourceType = "decision" | "insight_candidate";
export type NormalizedOutcomeLabel =
  | "hit"
  | "miss"
  | "neutral"
  | "invalid"
  | "insufficient_data";

export interface DecisionOutcomeRow {
  outcome_id: string;
  decision_id: string;
  symbol: string;
  horizon: string;
  path: string;
  status: string;
  due_at?: string | null;
  scheduled_at?: string | null;
  label?: string | null;
  created_at?: string;
}

export interface InsightCandidateOutcomeRow {
  outcome_id: string;
  insight_id: string;
  symbol: string;
  horizon: string;
  status: string;
  due_at?: string | null;
  scheduled_at?: string | null;
  normalized_label?: string | null;
  metrics_json?: Record<string, unknown> | null;
  reason_codes_json?: string[] | null;
  evidence_refs_json?: unknown[] | null;
  outcome_json?: Record<string, unknown> | null;
  created_at?: string;
  labeled_at?: string | null;
}

export type OutcomeRow = DecisionOutcomeRow | InsightCandidateOutcomeRow;

export function isDecisionOutcome(row: OutcomeRow): row is DecisionOutcomeRow {
  return "decision_id" in row;
}
export function isInsightCandidateOutcome(row: OutcomeRow): row is InsightCandidateOutcomeRow {
  return "insight_id" in row;
}

export interface MarketBar {
  ts: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
}

export interface OutcomeLabelMetrics {
  reference_price: number;
  future_price: number;
  absolute_return_pct: number;
  benchmark_symbol: string;
  benchmark_return_pct: number;
  relative_return_pct: number;
  hit_invalidation_proxy: boolean;
  hit_target_proxy: boolean;
  label: string;
}

export interface OutcomeLabelPayload extends OutcomeLabelMetrics {
  status: OutcomeFinalStatus;
  outcome_json: Record<string, unknown>;
}

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

export function mapToInsightCandidateOutcomeRow(
  raw: Record<string, unknown>,
): InsightCandidateOutcomeRow {
  return {
    outcome_id: String(raw.outcome_id ?? ""),
    insight_id: String(raw.insight_id ?? ""),
    symbol: String(raw.symbol ?? ""),
    horizon: String(raw.horizon ?? ""),
    status: String(raw.status ?? "pending"),
    due_at: raw.due_at as string | null | undefined,
    scheduled_at: raw.scheduled_at as string | null | undefined,
    normalized_label: raw.normalized_label as string | null | undefined,
    metrics_json: raw.metrics_json as Record<string, unknown> | null | undefined,
    reason_codes_json: raw.reason_codes_json as string[] | null | undefined,
    evidence_refs_json: raw.evidence_refs_json as unknown[] | null | undefined,
    outcome_json: raw.outcome_json as Record<string, unknown> | null | undefined,
    created_at: raw.created_at as string | undefined,
    labeled_at: raw.labeled_at as string | null | undefined,
  };
}

export const DEFAULT_INSIGHT_CANDIDATE_OUTCOME_HORIZON: InsightCandidateOutcomeHorizon = "2m";

export function isSupportedInsightCandidateOutcomeHorizon(
  horizon: string,
): horizon is InsightCandidateOutcomeHorizon {
  return (INSIGHT_CANDIDATE_OUTCOME_HORIZONS as readonly string[]).includes(horizon);
}

export interface ScheduleInsightCandidateOutcomePayload {
  insight_id: string;
  symbol: string;
  horizon: InsightCandidateOutcomeHorizon;
  evidence_refs?: unknown[];
  reason_codes?: string[];
  outcome_json?: Record<string, unknown>;
}

export async function scheduleInsightCandidateOutcome(
  payload: ScheduleInsightCandidateOutcomePayload,
): Promise<InsightCandidateOutcomeRow> {
  if (!isSupportedInsightCandidateOutcomeHorizon(payload.horizon)) {
    throw new Error(`Unsupported insight candidate outcome horizon: ${payload.horizon}`);
  }
  const response = await fetchStage1<{ items: Record<string, unknown>[]; count: number }>(
    "/insight-candidate-outcomes/schedule",
    {
      method: "POST",
      body: JSON.stringify({
        outcomes: [{
          insight_id: payload.insight_id,
          symbol: payload.symbol,
          horizon: payload.horizon,
          evidence_refs_json: payload.evidence_refs ?? [],
          reason_codes_json: payload.reason_codes ?? [],
          outcome_json: payload.outcome_json ?? {},
        }],
      }),
    },
  );
  if (!response.items.length) {
    throw new Error(`schedule returned empty items for insight_id=${payload.insight_id}`);
  }
  return mapToInsightCandidateOutcomeRow(response.items[0]);
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

function normalizeSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/\.(US|HK|SH|SZ|SG)$/i, "");
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

function parseThreshold(text: string | null | undefined, keyword: "below" | "above"): number | null {
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

export function computeOutcomeLabelMetrics(input: {
  horizon: string;
  reference_price: number;
  future_price: number;
  benchmark_reference_price: number;
  benchmark_future_price: number;
  invalidation?: string | null;
  target_plan?: string | null;
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

  const dueAtMs = input.due_at ? Date.parse(input.due_at) : Number.NaN;
  const horizonIndex = (() => {
    if (Number.isFinite(dueAtMs)) {
      const dueIndex = symbolBars.findIndex((bar) => Date.parse(bar.ts) >= dueAtMs);
      if (dueIndex <= 0) {
        return null;
      }
      return dueIndex;
    }
    switch (input.horizon as OutcomeHorizon) {
      case "30m":
        return Math.min(1, symbolBars.length - 1);
      case "1h":
        return Math.min(2, symbolBars.length - 1);
      case "EOD":
        return Math.min(3, symbolBars.length - 1);
      case "1d":
        return Math.min(4, symbolBars.length - 1);
      case "3d":
        return symbolBars.length - 1;
      default:
        return symbolBars.length - 1;
    }
  })();
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

export async function fetchDueDecisionOutcomes(input: {
  now?: string;
  limit?: number;
  symbol?: string;
}): Promise<DecisionOutcomeRow[]> {
  const params = new URLSearchParams();
  if (input.now) {
    params.set("now", input.now);
  }
  if (input.limit !== undefined) {
    params.set("limit", String(input.limit));
  }
  if (input.symbol) {
    params.set("symbol", input.symbol.toUpperCase());
  }
  const query = params.toString();
  const response = await fetchStage1<{ items: DecisionOutcomeRow[]; count: number }>(
    `/decision-outcomes/due${query ? `?${query}` : ""}`,
  );
  return response.items;
}

export async function fetchModelDecisionById(decision_id: string): Promise<{
  decision_id: string;
  symbol: string;
  action: string;
  decision_json: Record<string, unknown>;
}> {
  const row = await fetchStage1<{
    decision_id: string;
    symbol: string;
    action: string;
    decision_json: Record<string, unknown>;
  }>(`/model-decisions/${decision_id}`);
  return row;
}

export async function fetchMarketBars(
  symbol: string,
  timeframe = "1d",
  limit = 10,
): Promise<MarketBar[]> {
  const params = new URLSearchParams({
    symbol: symbol.toUpperCase(),
    timeframe,
    limit: String(limit),
  });
  const response = await fetchIntel<{ bars: MarketBar[] }>(`/market/bars?${params.toString()}`);
  return response.bars ?? [];
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
  const fetchBars = input.fetchBars ?? fetchMarketBars;
  const fetchDecision = input.fetchDecision ?? fetchModelDecisionById;

  try {
    const decision = await fetchDecision(input.outcome.decision_id);
    const decisionJson = decision.decision_json;
    const benchmark = resolveBenchmarkSymbol(input.outcome.symbol);
    const barQuery = resolveOutcomeBarQuery(input.outcome.horizon);

    const symbolBars =
      input.symbolBars ??
      (await fetchBars(input.outcome.symbol, barQuery.timeframe, barQuery.limit));
    const benchmarkBars =
      input.benchmarkBars ??
      (await fetchBars(benchmark, barQuery.timeframe, barQuery.limit));

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
      label: "failed",
      outcome_json: {
        reason: error instanceof Error ? error.message : "unknown_error",
        horizon: input.outcome.horizon,
      },
    };
  }
}

export async function labelDecisionOutcome(
  outcome_id: string,
  payload: OutcomeLabelPayload,
): Promise<DecisionOutcomeRow> {
  return fetchStage1<DecisionOutcomeRow>(`/decision-outcomes/${outcome_id}/label`, {
    method: "POST",
    body: JSON.stringify({
      status: payload.status,
      reference_price: payload.reference_price,
      future_price: payload.future_price,
      absolute_return_pct: payload.absolute_return_pct,
      benchmark_symbol: payload.benchmark_symbol,
      benchmark_return_pct: payload.benchmark_return_pct,
      relative_return_pct: payload.relative_return_pct,
      hit_invalidation_proxy: payload.hit_invalidation_proxy,
      hit_target_proxy: payload.hit_target_proxy,
      label: payload.label,
      outcome_json: payload.outcome_json,
    }),
  });
}

export interface InsightCandidateOutcomeLabelPayload {
  status: OutcomeFinalStatus;
  normalized_label: NormalizedOutcomeLabel;
  reason_codes_json?: string[];
  outcome_json?: Record<string, unknown>;
}

export async function finalizeDueOutcome(input: {
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
  label?: (outcome_id: string, payload: OutcomeLabelPayload) => Promise<DecisionOutcomeRow>;
}): Promise<DecisionOutcomeRow> {
  if (input.outcome.status !== "pending") {
    throw new Error(`outcome ${input.outcome.outcome_id} is not pending`);
  }
  const payload = await buildOutcomeLabelPayload(input);
  const label = input.label ?? labelDecisionOutcome;
  return label(input.outcome.outcome_id, payload);
}

export async function fetchDueInsightCandidateOutcomes(input: {
  now?: string;
  limit?: number;
  symbol?: string;
}): Promise<InsightCandidateOutcomeRow[]> {
  const params = new URLSearchParams();
  if (input.now) {
    params.set("now", input.now);
  }
  if (input.limit !== undefined) {
    params.set("limit", String(input.limit));
  }
  if (input.symbol) {
    params.set("symbol", input.symbol.toUpperCase());
  }
  const query = params.toString();
  const response = await fetchStage1<{ items: Record<string, unknown>[]; count: number }>(
    `/insight-candidate-outcomes/due${query ? `?${query}` : ""}`,
  );
  return response.items.map(mapToInsightCandidateOutcomeRow);
}

export async function labelInsightCandidateOutcome(
  outcome_id: string,
  payload: InsightCandidateOutcomeLabelPayload,
): Promise<InsightCandidateOutcomeRow> {
  const raw = await fetchStage1<Record<string, unknown>>(
    `/insight-candidate-outcomes/${outcome_id}/label`,
    {
      method: "POST",
      body: JSON.stringify({
        status: payload.status,
        normalized_label: payload.normalized_label,
        reason_codes_json: payload.reason_codes_json,
        outcome_json: payload.outcome_json,
      }),
    },
  );
  return mapToInsightCandidateOutcomeRow(raw);
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

export async function buildInsightCandidateOutcomeLabelPayload(input: {
  outcome: InsightCandidateOutcomeRow;
  symbolBars?: MarketBar[];
  benchmarkBars?: MarketBar[];
  fetchBars?: (symbol: string, timeframe: string, limit: number) => Promise<MarketBar[]>;
}): Promise<InsightCandidateOutcomeLabelPayload> {
  const fetchBars = input.fetchBars ?? fetchMarketBars;

  try {
    const benchmark = resolveBenchmarkSymbol(input.outcome.symbol);
    const barQuery = resolveInsightCandidateOutcomeBarQuery(input.outcome.horizon);

    const symbolBars =
      input.symbolBars ??
      (await fetchBars(input.outcome.symbol, barQuery.timeframe, barQuery.limit));
    const benchmarkBars =
      input.benchmarkBars ??
      (await fetchBars(benchmark, barQuery.timeframe, barQuery.limit));

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

export async function finalizeDueInsightCandidateOutcome(input: {
  outcome: InsightCandidateOutcomeRow;
  symbolBars?: MarketBar[];
  benchmarkBars?: MarketBar[];
  fetchBars?: (symbol: string, timeframe: string, limit: number) => Promise<MarketBar[]>;
  label?: (
    outcome_id: string,
    payload: InsightCandidateOutcomeLabelPayload,
  ) => Promise<InsightCandidateOutcomeRow>;
}): Promise<InsightCandidateOutcomeRow> {
  if (input.outcome.status !== "pending") {
    throw new Error(`outcome ${input.outcome.outcome_id} is not pending`);
  }
  const payload = await buildInsightCandidateOutcomeLabelPayload(input);
  const label = input.label ?? labelInsightCandidateOutcome;
  return label(input.outcome.outcome_id, payload);
}

export function isSupportedOutcomeHorizon(horizon: string): horizon is OutcomeHorizon {
  return (OUTCOME_HORIZONS as readonly string[]).includes(horizon);
}