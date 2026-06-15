import type { EvidenceRef } from "./context.js";
import type { AlphaSeedV1 } from "./insight.js";

export interface AlphaResearchInput {
  insight_id: string;
  run_id?: string;
  symbol: string;
  thesis: string;
  evidence_refs: EvidenceRef[];
  alpha_seed: AlphaSeedV1;
  backtest_window_start: string;
  backtest_window_end: string;
}

export interface AlphaInputValidationReport {
  valid: boolean;
  errors: string[];
}

export interface RuleCandidateCreateRequest {
  source: "insight_candidate";
  source_ref: { insight_id: string; run_id?: string };
  hypothesis: string;
  symbols: string[];
  trigger_definition: string;
  entry_condition: string;
  exit_condition?: string;
  invalidation: string;
  risk_notes?: string[];
}

export interface RuleCandidateCreateResponse {
  candidate_id: string;
  status: string;
}

export interface EvidenceValidationResponse {
  candidate_id: string;
  status: string;
  candidate_status: string;
  status_sequence: string[];
  gaps: Array<Record<string, string>>;
}

export interface LiteBacktestResponse {
  candidate_id: string;
  latest_report_id: string;
  candidate_status: string;
  decision: string;
  reason: string;
  quality_flags: string[];
  sample_size: number;
}

export interface AdvanceCandidateResponse {
  candidate_id: string;
  status: string;
}

export interface LiteBacktestReportResponse {
  id: string;
  candidate_id: string;
  decision: string;
  reason: string;
  quality_flags: string[];
  sample_size: number;
}

export interface AlphaResearchClient {
  createRuleCandidate: (
    payload: RuleCandidateCreateRequest,
  ) => Promise<RuleCandidateCreateResponse>;
  validateEvidence: (candidateId: string) => Promise<EvidenceValidationResponse>;
  runLiteBacktest: (
    candidateId: string,
    window: { start: string; end: string },
  ) => Promise<LiteBacktestResponse>;
  advanceCandidate: (
    candidateId: string,
    decision: string,
  ) => Promise<AdvanceCandidateResponse>;
  getLiteBacktestReport: (candidateId: string) => Promise<LiteBacktestReportResponse>;
}

export type AlphaResearchFetch = typeof fetch;
