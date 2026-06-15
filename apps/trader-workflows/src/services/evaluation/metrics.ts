import type {
  DecisionOutcomeSummary,
  DeltaHumanValue,
  EvaluationMetrics,
  EvaluationOutcomeRow,
  EvaluationPath,
  EvaluationRecommendation,
  InsightCandidateOutcomeSummary,
  ModelDecisionSummary,
  PathMetrics,
  TripleBarrierMetrics,
} from "../../types/evaluation.js";
import type { BarrierResult, InsightCandidateOutcomeRow } from "../../types/outcomes.js";
import { normalizeDecisionLabel, normalizeInsightLabel } from "../outcomes/labeling.js";

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
