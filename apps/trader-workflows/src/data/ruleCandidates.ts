import { fetchRuleCandidates } from "../api/ruleCandidatesClient.js";
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

export function createAlphaResearchClient(
  fetchImpl?: AlphaResearchFetch,
): AlphaResearchClient {
  return {
    createRuleCandidate: (payload: RuleCandidateCreateRequest) =>
      fetchRuleCandidates<RuleCandidateCreateResponse>("", {
        method: "POST",
        json: payload,
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
          json: { start: window.start, end: window.end },
        },
        fetchImpl,
      ),
    advanceCandidate: (candidateId, decision) =>
      fetchRuleCandidates<AdvanceCandidateResponse>(
        `/${candidateId}/advance`,
        {
          method: "POST",
          json: { decision },
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
