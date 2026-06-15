import {
  ALPHA_SEED_SCHEMA_VERSION,
  isAlphaSeedV1,
} from "./insightCandidates.js";
import type {
  AlphaInputValidationReport,
  AlphaResearchClient,
  AlphaResearchInput,
  AdvanceCandidateResponse,
  EvidenceValidationResponse,
  LiteBacktestReportResponse,
  LiteBacktestResponse,
  RuleCandidateCreateRequest,
  RuleCandidateCreateResponse,
} from "../types/alpha.js";

export type {
  AlphaResearchInput,
  AlphaInputValidationReport,
  RuleCandidateCreateRequest,
  RuleCandidateCreateResponse,
  EvidenceValidationResponse,
  LiteBacktestResponse,
  AdvanceCandidateResponse,
  LiteBacktestReportResponse,
  AlphaResearchClient,
  AlphaResearchFetch,
} from "../types/alpha.js";

export const ALPHA_RESEARCH_INPUT_VALIDATION_FAILED = "input_validation_failed" as const;

function requireNonEmptyString(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`missing ${field}`);
  }
}

export function validateAlphaResearchInput(
  input: Partial<AlphaResearchInput>,
): AlphaInputValidationReport {
  const errors: string[] = [];

  requireNonEmptyString(input.insight_id, "insight_id", errors);
  requireNonEmptyString(input.symbol, "symbol", errors);
  requireNonEmptyString(input.thesis, "thesis", errors);
  requireNonEmptyString(input.backtest_window_start, "backtest_window_start", errors);
  requireNonEmptyString(input.backtest_window_end, "backtest_window_end", errors);

  if (!Array.isArray(input.evidence_refs) || input.evidence_refs.length === 0) {
    errors.push("missing evidence_refs");
  }

  const seed = input.alpha_seed;
  if (!isAlphaSeedV1(seed)) {
    errors.push("missing alpha_seed");
  } else {
    if (seed.schema_version !== ALPHA_SEED_SCHEMA_VERSION) {
      errors.push("invalid alpha_seed.schema_version");
    }
    requireNonEmptyString(seed.candidate_family, "candidate_family", errors);
    requireNonEmptyString(seed.mechanism, "mechanism", errors);
    requireNonEmptyString(seed.trigger_hint, "trigger_hint", errors);
    requireNonEmptyString(seed.entry_condition_hint, "entry_condition_hint", errors);
    requireNonEmptyString(seed.invalidation_hint, "invalidation_hint", errors);
    if (!Array.isArray(seed.required_evidence_hint) || seed.required_evidence_hint.length === 0) {
      errors.push("missing required_evidence_hint");
    }
  }

  return { valid: errors.length === 0, errors };
}

export function buildRuleCandidateRequest(
  input: AlphaResearchInput,
): RuleCandidateCreateRequest {
  return {
    source: "insight_candidate",
    source_ref: {
      insight_id: input.insight_id,
      ...(input.run_id ? { run_id: input.run_id } : {}),
    },
    hypothesis: input.thesis.trim() || input.alpha_seed.mechanism,
    symbols: [input.symbol.toUpperCase()],
    trigger_definition: input.alpha_seed.trigger_hint,
    entry_condition: input.alpha_seed.entry_condition_hint,
    exit_condition: input.alpha_seed.exit_condition_hint,
    invalidation: input.alpha_seed.invalidation_hint,
    risk_notes: input.alpha_seed.risk_notes,
  };
}

export async function createRuleCandidate(
  payload: RuleCandidateCreateRequest,
  client: AlphaResearchClient,
): Promise<RuleCandidateCreateResponse> {
  return client.createRuleCandidate(payload);
}

export async function validateEvidence(
  candidateId: string,
  client: AlphaResearchClient,
): Promise<EvidenceValidationResponse> {
  return client.validateEvidence(candidateId);
}

export async function runLiteBacktest(
  candidateId: string,
  window: { start: string; end: string },
  client: AlphaResearchClient,
): Promise<LiteBacktestResponse> {
  return client.runLiteBacktest(candidateId, window);
}

export async function advanceCandidate(
  candidateId: string,
  decision: string,
  client: AlphaResearchClient,
): Promise<AdvanceCandidateResponse> {
  return client.advanceCandidate(candidateId, decision);
}

export async function getLiteBacktestReport(
  candidateId: string,
  client: AlphaResearchClient,
): Promise<LiteBacktestReportResponse> {
  return client.getLiteBacktestReport(candidateId);
}
