import { config } from "../runtime/config.js";
import type {
  AdvanceCandidateResponse,
  AlphaResearchClient,
  AlphaResearchFetch,
  EvidenceValidationResponse,
  LiteBacktestReportResponse,
  LiteBacktestResponse,
  RuleCandidateCreateRequest,
  RuleCandidateCreateResponse,
} from "../types/alpha.js";

export function ruleCandidatesBaseUrl(): string {
  const explicit = config.traderRuleCandidatesApiBase.replace(/\/$/, "");
  if (explicit) {
    return explicit;
  }
  const intelBase = config.traderApiBase.replace(/\/$/, "");
  if (intelBase.endsWith("/api/intel")) {
    return intelBase.replace(/\/api\/intel$/, "/api/rule-candidates");
  }
  return "http://127.0.0.1:8000/api/rule-candidates";
}

export async function fetchRuleCandidates<T>(
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

export const alphaResearchClient = createAlphaResearchClient();
