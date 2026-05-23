export type OpportunityConfidence = "low" | "medium" | "high";

export interface OpportunityObservation {
  title: string;
  symbols: string[];
  sourceMotive: string;
  hypothesis: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  trigger: string[];
  invalidation: string[];
  watchPlan: string[];
  confidence: OpportunityConfidence;
}

export interface OpportunityScore {
  symbol: string;
  thesis_alignment: number;
  trigger_clarity: number;
  evidence_quality: number;
  invalidation_clarity: number;
  liquidity_risk: number;
  summary: string;
}

export interface OpportunityBoardScore {
  rank: number;
  symbol: string;
  score: number;
  confidence: OpportunityConfidence;
  reason: string;
  components: Omit<OpportunityScore, "symbol" | "summary">;
  sourceRefs: string[];
}

export type EvidenceNeedKind = "quote" | "history" | "news" | "fundamental";

export interface EvidenceNeed {
  kind: "quote" | "history" | "news" | "fundamental";
  symbol: string;
  question: string;
  preferredTools: string[];
  required: boolean;
}

export type ResearchPlanStage = "hypothesis" | "evidence" | "falsification" | "data_plan" | "synthesis";

export interface ResearchPlanStep {
  stage: ResearchPlanStage;
  title: string;
  question: string;
  method: string;
  expectedOutput: string;
  toolHints: string[];
}

export interface OpportunityReasoningCandidate {
  symbol: string;
  thesis: string;
  sourceBasis: string[];
  invalidation: string[];
  researchOnly: true;
}

export interface OpportunityReasoningResult {
  context: {
    day: string;
    sourceScope: string[];
    observationOnly: true;
  };
  adminTheory: {
    summary: string;
    supportingPoints: string[];
    openRisks: string[];
  };
  marketIntelNeeds: string[];
  evidenceNeeds: EvidenceNeed[];
  candidateOpportunities: OpportunityReasoningCandidate[];
  invalidationPlan: string[];
  nextChecks: string[];
  researchPlan: ResearchPlanStep[];
  reasoningSummary: string[];
}

export interface ResearchContextSummary {
  day: string;
  sourceSummaryPath?: string;
  opportunityPath?: string;
  eventSummary: string[];
  overview: string[];
  adminCore: string[];
  adminSymbols: string[];
  risks: string[];
  opportunityMarkdown?: string;
}

export interface ResearchContextStatus {
  day: string;
  hasStructuredSummary: boolean;
  hasOpportunityObservation: boolean;
  hasSourceSummary: boolean;
  structuredSummaryPath: string;
  opportunityPath: string;
  sourceSummaryPath: string;
  eventSummaryCount: number;
  overviewCount: number;
  adminCoreCount: number;
  adminSymbolCount: number;
  riskCount: number;
  adminSymbolsPreview: string[];
  missing: string[];
}

export interface OpportunityBoardSummary {
  day: string;
  status: ResearchContextStatus;
  scores: OpportunityBoardScore[];
  reasoning: OpportunityReasoningResult;
  riskSummary: {
    hasRiskContext: boolean;
    riskCount: number;
    maxLiquidityRisk: number;
    maxInvalidationClarity: number;
  };
}

export interface AgentChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentToolTrace {
  name: string;
  reason: string;
  input: Record<string, string>;
  result_summary: string;
}

export interface AgentToolCall {
  name: string;
  input?: Record<string, string>;
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, string>;
  source: "local" | "external";
  enabled: boolean;
}

export interface AgentToolPolicyDecision {
  name: string;
  status: "allowed" | "blocked";
  reason: string;
}

export interface ResearchToolReadiness extends AgentToolDefinition {
  status: AgentToolPolicyDecision["status"];
  policy: AgentToolPolicyDecision;
}

export type AgentProviderMode = "local-deterministic" | "openai-compatible";

export interface AgentResponseEnvelope {
  run_id: string;
  evidence_log_path: string;
  answer: string;
  reasoning_summary: string[];
  used_context: string[];
  next_watch_plan: string[];
  opportunity_reasoning: OpportunityReasoningResult;
  conversation_summary?: string;
  provider: AgentProviderMode;
  provider_status: "ready" | "fallback" | "error";
  tool_trace: AgentToolTrace[];
  policy_decisions: AgentToolPolicyDecision[];
}

export interface AgentRunEvidenceSummary {
  run_id: string;
  created_at: string;
  day: string;
  provider: AgentProviderMode;
  provider_status: "ready" | "fallback" | "error";
  message_preview: string;
  answer_preview: string;
  tool_names: string[];
  blocked_tools: string[];
  candidate_symbols: string[];
  evidence_log_path: string;
}

export interface AgentRunEvidenceList {
  day: string;
  evidence_log_path: string;
  runs: AgentRunEvidenceSummary[];
}
