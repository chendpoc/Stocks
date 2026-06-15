import type { EvidenceRef } from "../types/context.js";
import {
  ALPHA_SEED_SCHEMA_VERSION,
  isAlphaSeedV1,
  type AlphaSeedV1,
} from "./insightCandidates.js";
import type {
  AdvanceCandidateResponse,
  AlphaInputValidationReport,
  AlphaResearchClient,
  AlphaResearchFetch,
  AlphaResearchInput,
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

function ruleCandidatesBaseUrl(): string {
  const explicit = process.env.TRADER_RULE_CANDIDATES_API_BASE?.replace(/\/$/, "");
  if (explicit) {
    return explicit;
  }
  const intelBase = process.env.TRADER_API_BASE?.replace(/\/$/, "") ?? "http://127.0.0.1:8000/api/intel";
  if (intelBase.endsWith("/api/intel")) {
    return intelBase.replace(/\/api\/intel$/, "/api/rule-candidates");
  }
  return "http://127.0.0.1:8000/api/rule-candidates";
}

async function fetchRuleCandidates<T>(
  path: string,
  options: RequestInit = {},
  fetchImpl: AlphaResearchFetch = fetch,
): Promise<T> {
  const base = ruleCandidatesBaseUrl();
  const url = path
    ? `${base}${path.startsWith("/") ? path : `/${path}`}`
    : base;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetchImpl(url, { ...options, headers });
  if (!response.ok) {
    throw new Error(`Rule Candidate API ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

export function createAlphaResearchClient(
  fetchImpl: AlphaResearchFetch = fetch,
): AlphaResearchClient {
  return {
    createRuleCandidate: (payload) =>
      fetchRuleCandidates<RuleCandidateCreateResponse>("", {
        method: "POST",
        body: JSON.stringify(payload),
      }, fetchImpl),
    validateEvidence: (candidateId) =>
      fetchRuleCandidates<EvidenceValidationResponse>(
        `/${candidateId}/evidence-requirements`,
        { method: "POST" },
        fetchImpl,
      ),
    runLiteBacktest: (candidateId, window) =>
      fetchRuleCandidates<LiteBacktestResponse>(
        `/${candidateId}/lite-backtest`,
        {
          method: "POST",
          body: JSON.stringify({ start: window.start, end: window.end }),
        },
        fetchImpl,
      ),
    advanceCandidate: (candidateId, decision) =>
      fetchRuleCandidates<AdvanceCandidateResponse>(
        `/${candidateId}/advance`,
        {
          method: "POST",
          body: JSON.stringify({ decision }),
        },
        fetchImpl,
      ),
    getLiteBacktestReport: (candidateId) =>
      fetchRuleCandidates<LiteBacktestReportResponse>(
        `/${candidateId}/lite-backtest-report`,
        {},
        fetchImpl,
      ),
  };
}

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

export const alphaResearchClient = createAlphaResearchClient();

export async function createRuleCandidate(
  payload: RuleCandidateCreateRequest,
  client: AlphaResearchClient = alphaResearchClient,
): Promise<RuleCandidateCreateResponse> {
  return client.createRuleCandidate(payload);
}

export async function validateEvidence(
  candidateId: string,
  client: AlphaResearchClient = alphaResearchClient,
): Promise<EvidenceValidationResponse> {
  return client.validateEvidence(candidateId);
}

export async function runLiteBacktest(
  candidateId: string,
  window: { start: string; end: string },
  client: AlphaResearchClient = alphaResearchClient,
): Promise<LiteBacktestResponse> {
  return client.runLiteBacktest(candidateId, window);
}

export async function advanceCandidate(
  candidateId: string,
  decision: string,
  client: AlphaResearchClient = alphaResearchClient,
): Promise<AdvanceCandidateResponse> {
  return client.advanceCandidate(candidateId, decision);
}

export async function getLiteBacktestReport(
  candidateId: string,
  client: AlphaResearchClient = alphaResearchClient,
): Promise<LiteBacktestReportResponse> {
  return client.getLiteBacktestReport(candidateId);
}
