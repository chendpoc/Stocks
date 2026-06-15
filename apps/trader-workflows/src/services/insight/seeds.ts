import {
  isCandidateFamily,
  type CandidateFamily,
} from "../candidateFamilies.js";
import type {
  AlphaSeedV1,
  InsightCandidateHorizon,
  InsightCandidateOriginCategory,
} from "./types.js";
import { ALPHA_SEED_SCHEMA_VERSION } from "./types.js";

export function mapOriginCategoryToCandidateFamily(
  origin_category: InsightCandidateOriginCategory,
): CandidateFamily {
  switch (origin_category) {
    case "failure_mode":
      return "mean_reversion";
    case "positive_pattern":
      return "momentum_trend";
    case "data_gap":
      return "cross_sectional_filter";
    default:
      return "event_driven";
  }
}

export function buildAlphaSeedV1(input: {
  origin_category: InsightCandidateOriginCategory;
  thesis: string;
  horizon: InsightCandidateHorizon;
  symbol: string;
}): AlphaSeedV1 {
  const symbol = input.symbol.toUpperCase();
  const family = mapOriginCategoryToCandidateFamily(input.origin_category);
  const mechanism = input.thesis.trim().slice(0, 240) || `${family} hypothesis for ${symbol}`;
  const triggerHint =
    input.origin_category === "failure_mode"
      ? "sharp adverse move with potential stabilization"
      : input.origin_category === "positive_pattern"
        ? "sustained strength or breakout confirmation"
        : "context-weighted signal cluster";
  const entryHint = `measure_next_bar_after_trigger_${input.horizon}`;
  const invalidationHint =
    input.origin_category === "failure_mode"
      ? "adverse move resumes with expanding participation"
      : "thesis-supporting evidence fails to persist";

  return {
    schema_version: ALPHA_SEED_SCHEMA_VERSION,
    candidate_family: family,
    mechanism,
    trigger_hint: triggerHint,
    entry_condition_hint: entryHint,
    invalidation_hint: invalidationHint,
    required_evidence_hint: [
      `market_bars:${symbol}`,
      `labeled_outcomes:${input.horizon}`,
      `context_evidence:${symbol}`,
    ],
    risk_notes: ["heuristic_alpha_seed_v0", "research_measurement_only"],
    exit_condition_hint: "evaluate_to_sample_window_final_bar",
  };
}

export function isAlphaSeedV1(value: unknown): value is AlphaSeedV1 {
  if (!value || typeof value !== "object") {
    return false;
  }
  const seed = value as Record<string, unknown>;
  return (
    seed.schema_version === ALPHA_SEED_SCHEMA_VERSION &&
    typeof seed.candidate_family === "string" &&
    isCandidateFamily(seed.candidate_family) &&
    typeof seed.mechanism === "string" &&
    typeof seed.trigger_hint === "string" &&
    typeof seed.entry_condition_hint === "string" &&
    typeof seed.invalidation_hint === "string" &&
    Array.isArray(seed.required_evidence_hint)
  );
}
