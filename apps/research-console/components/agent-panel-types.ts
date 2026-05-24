import type { AgentRunEvidenceList } from "@stock-summary/summary-core";

export type AgentReply = {
  run_id: string;
  evidence_log_path: string;
  answer: string;
  hypothesis: string;
  planSteps: OpportunityReasoning["researchPlan"];
  toolCalls: { name: string; input?: Record<string, string> }[];
  approvalRequired: boolean;
  executionTrace: AgentReply["tool_trace"];
  marketJudgement: string[];
  invalidation: string[];
  reasoning_summary: string[];
  used_context: string[];
  next_watch_plan: string[];
  opportunity_reasoning: OpportunityReasoning;
  conversation_summary?: string;
  tool_trace: {
    name: string;
    input?: Record<string, string>;
    reason: string;
    result_summary: string;
    execution_status?: "pending_approval" | "approved" | "rejected" | "blocked" | "failed";
    approval_required?: boolean;
    command_preview?: string;
    cwd?: string;
    env_keys?: string[];
  }[];
  policy_decisions: {
    name: string;
    status: "allowed" | "blocked";
    reason: string;
  }[];
  provider: string;
  provider_status: "ready" | "fallback" | "error";
};

export type OpportunityReasoning = {
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
  evidenceNeeds: {
    kind: "quote" | "history" | "news" | "fundamental";
    symbol: string;
    question: string;
    preferredTools: string[];
    required: boolean;
  }[];
  candidateOpportunities: {
    symbol: string;
    thesis: string;
    sourceBasis: string[];
    invalidation: string[];
    researchOnly: true;
  }[];
  invalidationPlan: string[];
  nextChecks: string[];
  researchPlan: {
    stage: "hypothesis" | "evidence" | "falsification" | "data_plan" | "synthesis";
    title: string;
    question: string;
    method: string;
    expectedOutput: string;
    toolHints: string[];
  }[];
  reasoningSummary: string[];
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AgentRunHistory = AgentRunEvidenceList;

export type ResearchContextStatus = {
  day: string;
  requestedDay: string;
  selectedDayStatus:
    | "exact_ready"
    | "exact_partial"
    | "latest_with_structured_context"
    | "latest_partial"
    | "no_sources";
  availableDays: string[];
  hasStructuredSummary: boolean;
  hasOpportunityObservation: boolean;
  hasSourceSummary: boolean;
  structuredSummaryPath: string;
  opportunityPath: string;
  sourceSummaryPath: string;
  sourceRefs: string[];
  missingSources: {
    key: "structured_summary" | "opportunity_observation" | "source_summary";
    label: string;
    available: boolean;
    path: string;
    resolvedPath?: string;
    candidates: string[];
  }[];
  sourceStatuses: {
    key: "structured_summary" | "opportunity_observation" | "source_summary";
    label: string;
    available: boolean;
    path: string;
    resolvedPath?: string;
    candidates: string[];
  }[];
  eventSummaryCount: number;
  overviewCount: number;
  adminCoreCount: number;
  adminSymbolCount: number;
  riskCount: number;
  adminSymbolsPreview: string[];
  missing: string[];
};

export type ResearchToolReadiness = {
  name: string;
  source: "local" | "external";
  enabled: boolean;
  approvalRequired?: boolean;
  policy: {
    status: "allowed" | "blocked";
    reason: string;
  };
};

export type ToolTrace = AgentReply["tool_trace"][number];

export type ResearchPlanStep = OpportunityReasoning["researchPlan"][number];
export type ResearchPlanStatus = "done" | "blocked" | "pending" | "process";

export function formatBoundedPath(value: string): string {
  if (!value) return "";
  const normalized = value.replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(normalized) || (normalized.startsWith("/") && !normalized.startsWith("./"))) {
    const parts = normalized.split("/").filter(Boolean);
    return parts.slice(-3).join("/");
  }
  return value;
}

export function providerStatusLabel(status: string): string {
  switch (status) {
    case "ready":
      return "就绪";
    case "fallback":
      return "降级";
    case "error":
      return "异常";
    case "checking":
      return "检查中";
    case "partial":
      return "部分就绪";
    default:
      return status;
  }
}

export function policyStatusLabel(status: "allowed" | "blocked"): string {
  return status === "allowed" ? "允许" : "已阻断";
}

export function researchPlanStatusLabel(status: ResearchPlanStatus): string {
  switch (status) {
    case "done":
      return "完成";
    case "blocked":
      return "阻断";
    case "pending":
      return "待执行";
    case "process":
      return "进行中";
    default:
      return status;
  }
}
