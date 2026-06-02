import { randomUUID } from "node:crypto";

import { fetchStage1 } from "../api/client.js";
import type { DecisionOutcomeRow } from "./outcomes.js";

export type EvaluationRecommendation = "hold" | "needs_more_data";
export type EvaluationPath = "model_path" | "override_path";

export const MIN_LABELED_MODEL_PATH = 3;

export interface EvaluationOutcomeRow extends DecisionOutcomeRow {
  relative_return_pct?: number | null;
  absolute_return_pct?: number | null;
  label?: string | null;
  labeled_at?: string | null;
}

export interface ModelDecisionSummary {
  decision_id: string;
  model_version?: string | null;
  symbol: string;
  created_at?: string;
  human_overrides_json?: string | null;
}

export interface PathMetrics {
  path: EvaluationPath;
  total_count: number;
  labeled_count: number;
  skipped_count: number;
  failed_count: number;
  mean_relative_return_pct: number | null;
  mean_absolute_return_pct: number | null;
  positive_label_count: number;
  negative_label_count: number;
}

export interface DeltaHumanValue {
  paired_horizon_count: number;
  mean_delta_relative_return_pct: number | null;
  override_better_count: number;
  model_better_count: number;
}

export interface EvaluationMetrics {
  model_path: PathMetrics;
  override_path: PathMetrics;
  delta_human_value: DeltaHumanValue;
}

export interface EvaluationReportRecord {
  report_id: string;
  model_version: string;
  window_start: string | null;
  window_end: string | null;
  metrics_json: EvaluationMetrics | string;
  recommendation: EvaluationRecommendation;
  report_json: Record<string, unknown> | string;
  created_at?: string;
}

export interface BuildEvaluationReportInput {
  model_version?: string;
  symbol?: string;
  limit?: number;
  report_id?: string;
  window_start?: string | null;
  window_end?: string | null;
}

export interface EvaluationReportPayload {
  report_id: string;
  model_version: string;
  window_start: string | null;
  window_end: string | null;
  metrics_json: EvaluationMetrics;
  recommendation: EvaluationRecommendation;
  report_json: Record<string, unknown>;
}

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

export function aggregateEvaluationMetrics(outcomes: EvaluationOutcomeRow[]): EvaluationMetrics {
  return {
    model_path: aggregatePathMetrics(outcomes, "model_path"),
    override_path: aggregatePathMetrics(outcomes, "override_path"),
    delta_human_value: computeDeltaHumanValue(outcomes),
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

export function buildEvaluationReportPayload(input: {
  outcomes: EvaluationOutcomeRow[];
  model_version: string;
  report_id?: string;
  window_start?: string | null;
  window_end?: string | null;
}): EvaluationReportPayload {
  const metrics_json = aggregateEvaluationMetrics(input.outcomes);
  const recommendation = deriveRecommendation(metrics_json);
  const inferredWindow = inferEvaluationWindow(input.outcomes);

  return {
    report_id: input.report_id ?? `eval_${randomUUID().replace(/-/g, "")}`,
    model_version: input.model_version,
    window_start: input.window_start ?? inferredWindow.window_start,
    window_end: input.window_end ?? inferredWindow.window_end,
    metrics_json,
    recommendation,
    report_json: {
      summary: "Stage 1 single-arm evaluation; no auto-promotion",
      outcome_count: input.outcomes.length,
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

  const [outcomes, decisions] = await Promise.all([
    fetchDecisionOutcomesForEvaluation({
      symbol: input.symbol,
      limit,
    }),
    fetchModelDecisionsForEvaluation({
      symbol: input.symbol,
      model_version,
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
    model_version,
    report_id: input.report_id,
    window_start: input.window_start,
    window_end: input.window_end,
  });
}
