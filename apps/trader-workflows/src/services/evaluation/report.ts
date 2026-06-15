import { randomUUID } from "node:crypto";

import { fetchStage1 } from "../../api/client.js";
import type {
  BuildEvaluationReportInput,
  DecisionOutcomeSummary,
  EvaluationOutcomeRow,
  EvaluationReportPayload,
  EvaluationReportRecord,
  EvaluationReportSections,
  InsightCandidateOutcomeSummary,
  ModelDecisionSummary,
} from "../../types/evaluation.js";
import type { InsightCandidateOutcomeRow, NormalizedOutcomeLabel } from "../../types/outcomes.js";
import { mapToInsightCandidateOutcomeRow } from "../outcomes/persistence.js";
import {
  aggregateEvaluationMetrics,
  deriveRecommendation,
  filterOutcomesForModelVersion,
  inferEvaluationWindow,
  toDecisionOutcomeSummaries,
  toInsightCandidateOutcomeSummaries,
} from "./metrics.js";

function mean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
