import { randomUUID } from "node:crypto";

import { fetchStage1 } from "../api/client.js";
import type {
  BuildEvaluationReportInput,
  DecisionOutcomeSummary,
  DeltaHumanValue,
  EvaluationMetrics,
  EvaluationOutcomeRow,
  EvaluationPath,
  EvaluationRecommendation,
  EvaluationReportPayload,
  EvaluationReportRecord,
  EvaluationReportSections,
  InsightCandidateOutcomeSummary,
  ModelDecisionSummary,
  PathMetrics,
  TripleBarrierMetrics,
} from "../types/evaluation.js";
import type { BarrierResult, InsightCandidateOutcomeRow, NormalizedOutcomeLabel } from "../types/outcomes.js";
import { normalizeDecisionLabel, normalizeInsightLabel, mapToInsightCandidateOutcomeRow } from "./outcomes.js";

export type {
  EvaluationRecommendation,
  EvaluationPath,
  EvaluationOutcomeRow,
  ModelDecisionSummary,
  PathMetrics,
  DeltaHumanValue,
  TripleBarrierMetrics,
  EvaluationMetrics,
  EvaluationReportRecord,
  DecisionOutcomeSummary,
  InsightCandidateOutcomeSummary,
  EvaluationReportSections,
  BuildEvaluationReportInput,
  EvaluationReportPayload,
} from "../types/evaluation.js";

export const MIN_LABELED_MODEL_PATH = 3;

function mean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isEvaluationPath(path: string): path is EvaluationPath {
  return path === "model_path" || path === "override_path";
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function roundScore(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function normalizeBarrierResult(value: unknown): BarrierResult {
  switch (value) {
    case "hit_profit_first":
    case "hit_stop_first":
    case "hit_time_first":
      return value;
    default:
      return "none";
  }
}

function outcomeTimestamp(row: EvaluationOutcomeRow): string | null {
  return row.labeled_at ?? row.created_at ?? null;
}

export function aggregatePathMetrics(
  outcomes: EvaluationOutcomeRow[],
  path: EvaluationPath,
): PathMetrics {
  const rows = outcomes.filter((row) => row.path === path);
  const labeled = rows.filter((row) => row.status === "labeled");
  const relativeReturns = labeled
    .map((row) => parseNumber(row.relative_return_pct))
    .filter((value): value is number => value !== null);
  const absoluteReturns = labeled
    .map((row) => parseNumber(row.absolute_return_pct))
    .filter((value): value is number => value !== null);

  return {
    path,
    total_count: rows.length,
    labeled_count: labeled.length,
    skipped_count: rows.filter((row) => row.status === "skipped").length,
    failed_count: rows.filter((row) => row.status === "failed").length,
    mean_relative_return_pct: mean(relativeReturns),
    mean_absolute_return_pct: mean(absoluteReturns),
    positive_label_count: labeled.filter((row) => row.label === "positive" || row.label === "target_hit")
      .length,
    negative_label_count: labeled.filter((row) => row.label === "negative" || row.label === "invalidated")
      .length,
  };
}

export function computeDeltaHumanValue(outcomes: EvaluationOutcomeRow[]): DeltaHumanValue {
  const labeled = outcomes.filter((row) => row.status === "labeled");
  const byKey = new Map<string, Partial<Record<EvaluationPath, EvaluationOutcomeRow>>>();

  for (const row of labeled) {
    if (!isEvaluationPath(row.path)) {
      continue;
    }
    const key = `${row.decision_id}:${row.horizon}`;
    const bucket = byKey.get(key) ?? {};
    bucket[row.path] = row;
    byKey.set(key, bucket);
  }

  const deltas: number[] = [];
  let override_better_count = 0;
  let model_better_count = 0;

  for (const pair of byKey.values()) {
    const model = pair.model_path;
    const override = pair.override_path;
    if (!model || !override) {
      continue;
    }
    const modelRelative = parseNumber(model.relative_return_pct);
    const overrideRelative = parseNumber(override.relative_return_pct);
    if (modelRelative === null || overrideRelative === null) {
      continue;
    }
    const delta = overrideRelative - modelRelative;
    deltas.push(delta);
    if (delta > 0) {
      override_better_count += 1;
    } else if (delta < 0) {
      model_better_count += 1;
    }
  }

  return {
    paired_horizon_count: deltas.length,
    mean_delta_relative_return_pct: mean(deltas),
    override_better_count,
    model_better_count,
  };
}

export function aggregateTripleBarrierMetrics(
  outcomes: EvaluationOutcomeRow[],
): TripleBarrierMetrics {
  const finalized = outcomes.filter((row) => row.status !== "pending");
  const counts: Record<BarrierResult, number> = {
    hit_profit_first: 0,
    hit_stop_first: 0,
    hit_time_first: 0,
    none: 0,
  };
  for (const row of finalized) {
    counts[normalizeBarrierResult(row.barrier_result)] += 1;
  }
  const total = finalized.length;
  return {
    total_count: total,
    hit_profit_first_count: counts.hit_profit_first,
    hit_stop_first_count: counts.hit_stop_first,
    hit_time_first_count: counts.hit_time_first,
    none_count: counts.none,
    profit_first_rate: total > 0 ? roundScore(counts.hit_profit_first / total) : null,
    stop_first_rate: total > 0 ? roundScore(counts.hit_stop_first / total) : null,
    time_first_rate: total > 0 ? roundScore(counts.hit_time_first / total) : null,
  };
}

export function computeSystemQualityScores(outcomes: EvaluationOutcomeRow[]): {
  evidence_utility_score: number | null;
  contra_predictive_power: number | null;
} {
  const labeledModelPath = outcomes.filter(
    (row) => row.path === "model_path" && row.status === "labeled",
  );
  if (labeledModelPath.length === 0) {
    return {
      evidence_utility_score: null,
      contra_predictive_power: null,
    };
  }

  const evidenceHits = labeledModelPath.filter((row) =>
    row.label === "positive" ||
    row.label === "target_hit" ||
    normalizeBarrierResult(row.barrier_result) === "hit_profit_first"
  ).length;
  const contraHits = labeledModelPath.filter((row) =>
    row.label === "negative" ||
    row.label === "invalidated" ||
    normalizeBarrierResult(row.barrier_result) === "hit_stop_first"
  ).length;

  return {
    evidence_utility_score: roundScore(evidenceHits / labeledModelPath.length),
    contra_predictive_power: roundScore(contraHits / labeledModelPath.length),
  };
}

export function aggregateEvaluationMetrics(outcomes: EvaluationOutcomeRow[]): EvaluationMetrics {
  const scores = computeSystemQualityScores(outcomes);
  return {
    model_path: aggregatePathMetrics(outcomes, "model_path"),
    override_path: aggregatePathMetrics(outcomes, "override_path"),
    delta_human_value: computeDeltaHumanValue(outcomes),
    triple_barrier: aggregateTripleBarrierMetrics(outcomes),
    evidence_utility_score: scores.evidence_utility_score,
    contra_predictive_power: scores.contra_predictive_power,
  };
}

export function deriveRecommendation(metrics: EvaluationMetrics): EvaluationRecommendation {
  if (metrics.model_path.labeled_count < MIN_LABELED_MODEL_PATH) {
    return "needs_more_data";
  }

  const finalizedCount =
    metrics.model_path.labeled_count +
    metrics.model_path.skipped_count +
    metrics.model_path.failed_count +
    metrics.override_path.labeled_count +
    metrics.override_path.skipped_count +
    metrics.override_path.failed_count;

  const labeledCount = metrics.model_path.labeled_count + metrics.override_path.labeled_count;
  if (finalizedCount > 0 && labeledCount / finalizedCount < 0.5) {
    return "needs_more_data";
  }

  return "hold";
}

export function inferEvaluationWindow(outcomes: EvaluationOutcomeRow[]): {
  window_start: string | null;
  window_end: string | null;
} {
  const timestamps = outcomes
    .map(outcomeTimestamp)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => a.localeCompare(b));

  if (timestamps.length === 0) {
    return { window_start: null, window_end: null };
  }

  return {
    window_start: timestamps[0] ?? null,
    window_end: timestamps[timestamps.length - 1] ?? null,
  };
}

export function filterOutcomesForModelVersion(input: {
  outcomes: EvaluationOutcomeRow[];
  decisions: ModelDecisionSummary[];
  model_version: string;
}): EvaluationOutcomeRow[] {
  const decisionIds = new Set(
    input.decisions
      .filter((decision) => (decision.model_version ?? "stage1-v0") === input.model_version)
      .map((decision) => decision.decision_id),
  );
  return input.outcomes.filter((outcome) => decisionIds.has(outcome.decision_id));
}

export function toDecisionOutcomeSummaries(
  outcomes: EvaluationOutcomeRow[],
): DecisionOutcomeSummary[] {
  return outcomes
    .filter((row) => row.status === "labeled" && row.label)
    .map((row) => ({
      decision_id: row.decision_id,
      symbol: row.symbol,
      horizon: row.horizon,
      path: row.path,
      normalized_label: normalizeDecisionLabel(row.label!),
      relative_return_pct: parseNumber(row.relative_return_pct),
      absolute_return_pct: parseNumber(row.absolute_return_pct),
    }));
}

export function toInsightCandidateOutcomeSummaries(
  outcomes: InsightCandidateOutcomeRow[],
): InsightCandidateOutcomeSummary[] {
  return outcomes
    .filter((row) => row.status === "labeled" && row.normalized_label)
    .map((row) => ({
      outcome_id: row.outcome_id,
      insight_id: row.insight_id,
      symbol: row.symbol,
      horizon: row.horizon,
      normalized_label: normalizeInsightLabel(row.normalized_label!),
      reason_codes: row.reason_codes_json ?? [],
    }));
}

function countByLabel(labels: NormalizedOutcomeLabel[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const label of labels) {
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return counts;
}

function rankSymbolsByFrequency(items: { symbol: string }[]): string[] {
  const freq = new Map<string, number>();
  for (const item of items) {
    freq.set(item.symbol, (freq.get(item.symbol) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([symbol, count]) => `${symbol}(${count})`);
}

function rankHorizonsByFrequency(items: { horizon: string }[]): string[] {
  const freq = new Map<string, number>();
  for (const item of items) {
    freq.set(item.horizon, (freq.get(item.horizon) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([horizon, count]) => `${horizon}(${count})`);
}

function detectPositivePatterns(
  decisionSummaries: DecisionOutcomeSummary[],
  insightSummaries: InsightCandidateOutcomeSummary[],
): string[] {
  const patterns: string[] = [];
  const hitDecisions = decisionSummaries.filter((d) => d.normalized_label === "hit");
  if (hitDecisions.length > 0) {
    const topSymbols = rankSymbolsByFrequency(hitDecisions);
    patterns.push(`decision hits by symbol: ${topSymbols.join(", ")}`);
    const topHorizons = rankHorizonsByFrequency(hitDecisions);
    if (topHorizons.length > 0) {
      patterns.push(`decision hit horizons: ${topHorizons.join(", ")}`);
    }
  }
  const hitInsights = insightSummaries.filter((i) => i.normalized_label === "hit");
  if (hitInsights.length > 0) {
    const topSymbols = rankSymbolsByFrequency(hitInsights);
    patterns.push(`insight candidate hits by symbol: ${topSymbols.join(", ")}`);
    const topHorizons = rankHorizonsByFrequency(hitInsights);
    if (topHorizons.length > 0) {
      patterns.push(`insight candidate hit horizons: ${topHorizons.join(", ")}`);
    }
  }
  return patterns.slice(0, 5);
}

function detectNegativePatterns(
  decisionSummaries: DecisionOutcomeSummary[],
  insightSummaries: InsightCandidateOutcomeSummary[],
): string[] {
  const patterns: string[] = [];
  const missDecisions = decisionSummaries.filter((d) => d.normalized_label === "miss");
  if (missDecisions.length > 0) {
    const topSymbols = rankSymbolsByFrequency(missDecisions);
    patterns.push(`decision misses by symbol: ${topSymbols.join(", ")}`);
    const topHorizons = rankHorizonsByFrequency(missDecisions);
    if (topHorizons.length > 0) {
      patterns.push(`decision miss horizons: ${topHorizons.join(", ")}`);
    }
  }
  const missInsights = insightSummaries.filter((i) => i.normalized_label === "miss");
  if (missInsights.length > 0) {
    const topSymbols = rankSymbolsByFrequency(missInsights);
    patterns.push(`insight candidate misses by symbol: ${topSymbols.join(", ")}`);
    const topHorizons = rankHorizonsByFrequency(missInsights);
    if (topHorizons.length > 0) {
      patterns.push(`insight candidate miss horizons: ${topHorizons.join(", ")}`);
    }
  }
  return patterns.slice(0, 5);
}

function detectFailureModes(
  decisionSummaries: DecisionOutcomeSummary[],
  insightSummaries: InsightCandidateOutcomeSummary[],
): string[] {
  const modes: string[] = [];
  const invalidDecisions = decisionSummaries.filter((d) => d.normalized_label === "invalid");
  if (invalidDecisions.length > 0) {
    const topSymbols = rankSymbolsByFrequency(invalidDecisions);
    modes.push(`${invalidDecisions.length} decision outcome(s) invalid — ${topSymbols.join(", ")}`);
  }
  const invalidInsights = insightSummaries.filter((i) => i.normalized_label === "invalid");
  if (invalidInsights.length > 0) {
    const topSymbols = rankSymbolsByFrequency(invalidInsights);
    modes.push(`${invalidInsights.length} insight candidate outcome(s) invalid — ${topSymbols.join(", ")}`);
  }
  const insufficientInsights = insightSummaries.filter(
    (i) => i.normalized_label === "insufficient_data",
  );
  if (insufficientInsights.length > 0) {
    const topHorizons = rankHorizonsByFrequency(insufficientInsights);
    modes.push(`${insufficientInsights.length} insight outcome(s) insufficient data — horizons: ${topHorizons.join(", ")}`);
  }
  return modes.slice(0, 5);
}

function detectDataGaps(
  decisionSummaries: DecisionOutcomeSummary[],
  insightSummaries: InsightCandidateOutcomeSummary[],
  rawDecisionOutcomes: EvaluationOutcomeRow[],
): string[] {
  const gaps: string[] = [];
  const skippedDecisions = rawDecisionOutcomes.filter((r) => r.status === "skipped");
  if (skippedDecisions.length > 0) {
    gaps.push(`${skippedDecisions.length} decision outcome(s) skipped (no market data)`);
  }
  if (decisionSummaries.length === 0) {
    gaps.push("no labeled decision outcomes available for evaluation");
  }
  if (insightSummaries.length === 0) {
    gaps.push("no labeled insight candidate outcomes available for evaluation");
  }
  const insufficientReasonCodes = insightSummaries
    .flatMap((i) => i.reason_codes)
    .filter((c) => c === "insufficient_market_bars");
  if (insufficientReasonCodes.length > 0) {
    gaps.push(`${insufficientReasonCodes.length} insight outcome(s) flagged insufficient market bars`);
  }
  return gaps.slice(0, 5);
}

function collectEvidenceRefs(
  decisionSummaries: DecisionOutcomeSummary[],
  insightSummaries: InsightCandidateOutcomeSummary[],
): string[] {
  const refs: string[] = [];
  if (decisionSummaries.length > 0) {
    refs.push(`decision_outcomes: ${decisionSummaries.length} labeled records`);
  }
  if (insightSummaries.length > 0) {
    refs.push(`insight_candidate_outcomes: ${insightSummaries.length} labeled records`);
  }
  const decisionSymbols = [...new Set(decisionSummaries.map((d) => d.symbol))];
  const insightSymbols = [...new Set(insightSummaries.map((i) => i.symbol))];
  const allSymbols = [...new Set([...decisionSymbols, ...insightSymbols])];
  if (allSymbols.length > 0) {
    refs.push(`symbols_covered: ${allSymbols.slice(0, 10).join(", ")}`);
  }
  return refs;
}

export function buildEvaluationReportSections(input: {
  decisionOutcomes: EvaluationOutcomeRow[];
  insightCandidateOutcomes: InsightCandidateOutcomeRow[];
}): EvaluationReportSections {
  const decisionSummaries = toDecisionOutcomeSummaries(input.decisionOutcomes);
  const insightSummaries = toInsightCandidateOutcomeSummaries(input.insightCandidateOutcomes);

  const decisionLabels = decisionSummaries.map((d) => d.normalized_label);
  const insightLabels = insightSummaries.map((i) => i.normalized_label);

  const decisionReturns = decisionSummaries
    .map((d) => d.relative_return_pct)
    .filter((v): v is number => v !== null);
  const decisionAbsReturns = decisionSummaries
    .map((d) => d.absolute_return_pct)
    .filter((v): v is number => v !== null);

  const insightHits = insightLabels.filter((l) => l === "hit").length;

  return {
    decision_performance: {
      total: decisionSummaries.length,
      by_label: countByLabel(decisionLabels),
      mean_relative_return_pct: mean(decisionReturns),
      mean_absolute_return_pct: mean(decisionAbsReturns),
    },
    insight_candidate_performance: {
      total: insightSummaries.length,
      by_label: countByLabel(insightLabels),
      hit_rate: insightSummaries.length > 0 ? insightHits / insightSummaries.length : null,
    },
    top_positive_patterns: detectPositivePatterns(decisionSummaries, insightSummaries),
    top_negative_patterns: detectNegativePatterns(decisionSummaries, insightSummaries),
    failure_modes: detectFailureModes(decisionSummaries, insightSummaries),
    data_gaps: detectDataGaps(decisionSummaries, insightSummaries, input.decisionOutcomes),
    evidence_refs: collectEvidenceRefs(decisionSummaries, insightSummaries),
  };
}

export function buildEvaluationReportPayload(input: {
  outcomes: EvaluationOutcomeRow[];
  insightCandidateOutcomes?: InsightCandidateOutcomeRow[];
  model_version: string;
  report_id?: string;
  window_start?: string | null;
  window_end?: string | null;
}): EvaluationReportPayload {
  const metrics_json = aggregateEvaluationMetrics(input.outcomes);
  const evidence_utility_score = metrics_json.evidence_utility_score ?? null;
  const contra_predictive_power = metrics_json.contra_predictive_power ?? null;
  const recommendation = deriveRecommendation(metrics_json);
  const inferredWindow = inferEvaluationWindow(input.outcomes);

  const sections = buildEvaluationReportSections({
    decisionOutcomes: input.outcomes,
    insightCandidateOutcomes: input.insightCandidateOutcomes ?? [],
  });

  return {
    report_id: input.report_id ?? `eval_${randomUUID().replace(/-/g, "")}`,
    model_version: input.model_version,
    window_start: input.window_start ?? inferredWindow.window_start,
    window_end: input.window_end ?? inferredWindow.window_end,
    metrics_json,
    recommendation,
    sections,
    evidence_utility_score,
    contra_predictive_power,
    report_json: {
      summary: "Stage 1 single-arm evaluation; no auto-promotion",
      outcome_count: input.outcomes.length,
      insight_candidate_outcome_count: (input.insightCandidateOutcomes ?? []).length,
      system_quality: {
        evidence_utility_score,
        contra_predictive_power,
        triple_barrier: metrics_json.triple_barrier,
      },
      recommendation_reason:
        recommendation === "hold"
          ? "sufficient labeled model_path outcomes"
          : "insufficient labeled outcomes for stable evaluation",
      auto_promotion: false,
    },
  };
}

export async function fetchDecisionOutcomesForEvaluation(input: {
  decision_id?: string;
  symbol?: string;
  status?: string;
  limit?: number;
}): Promise<EvaluationOutcomeRow[]> {
  const params = new URLSearchParams();
  if (input.decision_id) {
    params.set("decision_id", input.decision_id);
  }
  if (input.symbol) {
    params.set("symbol", input.symbol.toUpperCase());
  }
  if (input.status) {
    params.set("status", input.status);
  }
  if (input.limit !== undefined) {
    params.set("limit", String(input.limit));
  }
  const query = params.toString();
  const response = await fetchStage1<{ items: EvaluationOutcomeRow[]; count: number }>(
    `/decision-outcomes${query ? `?${query}` : ""}`,
  );
  return response.items;
}

export async function fetchInsightCandidateOutcomesForEvaluation(input: {
  symbol?: string;
  limit?: number;
}): Promise<InsightCandidateOutcomeRow[]> {
  const params = new URLSearchParams();
  if (input.symbol) {
    params.set("symbol", input.symbol.toUpperCase());
  }
  if (input.limit !== undefined) {
    params.set("limit", String(input.limit));
  }
  params.set("status", "labeled");
  const query = params.toString();
  const response = await fetchStage1<{ items: Record<string, unknown>[]; count: number }>(
    `/insight-candidate-outcomes${query ? `?${query}` : ""}`,
  );
  return response.items.map(mapToInsightCandidateOutcomeRow);
}

export async function fetchModelDecisionsForEvaluation(input: {
  symbol?: string;
  model_version?: string;
  limit?: number;
}): Promise<ModelDecisionSummary[]> {
  const params = new URLSearchParams();
  if (input.symbol) {
    params.set("symbol", input.symbol.toUpperCase());
  }
  if (input.model_version) {
    params.set("model_version", input.model_version);
  }
  if (input.limit !== undefined) {
    params.set("limit", String(input.limit));
  }
  const query = params.toString();
  const response = await fetchStage1<{ items: ModelDecisionSummary[]; count: number }>(
    `/model-decisions${query ? `?${query}` : ""}`,
  );
  return response.items;
}

export async function createEvaluationReport(
  payload: EvaluationReportPayload,
): Promise<EvaluationReportRecord> {
  return fetchStage1<EvaluationReportRecord>("/evaluation-reports", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function buildEvaluationReport(
  input: BuildEvaluationReportInput = {},
): Promise<EvaluationReportPayload> {
  const model_version = input.model_version ?? "stage1-v0";
  const limit = input.limit ?? 500;

  const [outcomes, decisions, insightCandidateOutcomes] = await Promise.all([
    fetchDecisionOutcomesForEvaluation({
      symbol: input.symbol,
      limit,
    }),
    fetchModelDecisionsForEvaluation({
      symbol: input.symbol,
      model_version,
      limit,
    }),
    fetchInsightCandidateOutcomesForEvaluation({
      symbol: input.symbol,
      limit,
    }),
  ]);

  const scopedOutcomes = filterOutcomesForModelVersion({
    outcomes: outcomes.filter((row) => row.status !== "pending"),
    decisions,
    model_version,
  });

  return buildEvaluationReportPayload({
    outcomes: scopedOutcomes,
    insightCandidateOutcomes,
    model_version,
    report_id: input.report_id,
    window_start: input.window_start,
    window_end: input.window_end,
  });
}
