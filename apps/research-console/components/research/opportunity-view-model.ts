import type {
  EvidenceNeed,
  EvidenceRun,
  OpportunityBoardScore,
  OpportunityBoardSummary,
  OpportunityConfidence,
  ResearchOpportunity,
  ResearchOpportunityStatus,
  ResearchSession,
  ReviewRecord,
} from "@stock-summary/summary-core";

import { formatScoreReason } from "../ScoreRows";

export type OpportunityFilterState = {
  query: string;
  status: ResearchOpportunityStatus | "all";
  confidence: OpportunityConfidence | "all";
  missingEvidenceOnly: boolean;
  toolAvailability: "all" | "has-tools" | "cached" | "blocked";
};

export type EvidenceActionState = "ready" | "blocked" | "pending" | "cached" | "error";

export type EvidenceActionView = {
  id: string;
  tool: string;
  label: string;
  groupLabel: string;
  executable: boolean;
  kind: EvidenceNeed["kind"];
  question: string;
  required: boolean;
  state: EvidenceActionState;
  stateLabel: string;
  stateReason: string;
  reason: string;
  lastRunLabel: string;
  lastRunSummary: string;
  lastRunAt: string;
  lastRunVerdictLabel: string;
  request?: {
    tool: string;
    symbol: string;
    opportunityId?: string;
    query?: string;
    period?: string;
  };
};

export type OpportunityRowView = {
  rank: number;
  symbol: string;
  score: number;
  confidence: OpportunityConfidence;
  scoreReason: string;
  status: ResearchOpportunityStatus;
  statusLabel: string;
  statusTone: "ready" | "warning" | "blocked" | "selected" | "neutral";
  evidenceGapCount: number;
  evidenceGapLabel: string;
  keyThesis: string;
  lastEvidence: EvidenceRun | null;
  lastEvidenceLabel: string;
  latestReview: ReviewRecord | null;
  latestReviewLabel: string;
  latestReviewAt: string;
  latestReviewLearning: string;
  sourceRefs: string[];
  boardScore: OpportunityBoardScore;
  opportunity: ResearchOpportunity | null;
  evidenceNeeds: EvidenceNeed[];
  evidenceActions: EvidenceActionView[];
  invalidation: string[];
};

export type InspectorView = {
  row: OpportunityRowView;
  judgementSummary: string;
  hypothesis: string;
  supportingEvidence: string[];
  evidenceGaps: EvidenceNeed[];
  evidenceActions: EvidenceActionView[];
  invalidation: string[];
  recentEvidenceRuns: EvidenceRun[];
  reviewRecords: ReviewRecord[];
};

const STATUS_LABELS: Record<ResearchOpportunityStatus, string> = {
  new: "待确认",
  needs_evidence: "待补证据",
  evidence_ready: "证据已刷新",
  watching: "观察中",
  invalidated: "已失效",
  reviewed: "已复盘",
};

const STATUS_TONES: Record<ResearchOpportunityStatus, OpportunityRowView["statusTone"]> = {
  new: "neutral",
  needs_evidence: "warning",
  evidence_ready: "ready",
  watching: "selected",
  invalidated: "blocked",
  reviewed: "neutral",
};

const TOOL_LABELS: Record<string, string> = {
  alpha_vantage_quote: "Alpha Vantage",
  longbridge_quote: "Longbridge",
  manual_filing_review: "人工复核",
  news_search: "News Search",
  yfinance_history: "yfinance history",
  yfinance_quote: "yfinance quote",
};

const EVIDENCE_KIND_LABELS: Record<EvidenceNeed["kind"], string> = {
  quote: "行情报价",
  history: "价格历史",
  news: "新闻/催化",
  fundamental: "基本面/文件",
};

const VERDICT_LABELS: Record<EvidenceRun["verdict"] | "none", string> = {
  blocked: "已阻断",
  contradicting: "反证",
  error: "错误",
  neutral: "中性",
  none: "未执行",
  supporting: "支持",
};

const REVIEW_OUTCOME_LABELS: Record<ReviewRecord["outcome"], string> = {
  failed: "已失效",
  unclear: "未确认",
  validated: "已验证",
};

const EXECUTABLE_EVIDENCE_TOOLS = new Set([
  "alpha_vantage_quote",
  "longbridge_quote",
  "news_search",
  "yfinance_history",
  "yfinance_quote",
]);

const DEFAULT_FILTER: OpportunityFilterState = {
  query: "",
  status: "all",
  confidence: "all",
  missingEvidenceOnly: false,
  toolAvailability: "all",
};

function normalizeSymbol(value: string) {
  return value.trim().toUpperCase();
}

function matchesOpportunitySymbol(opportunity: ResearchOpportunity, symbol: string) {
  const normalized = normalizeSymbol(symbol);
  return opportunity.symbols.some((item) => normalizeSymbol(item) === normalized);
}

function findOpportunity(session: ResearchSession | null | undefined, symbol: string) {
  return session?.opportunities.find((opportunity) => matchesOpportunitySymbol(opportunity, symbol)) ?? null;
}

function evidenceRunsForOpportunity(session: ResearchSession | null | undefined, opportunity: ResearchOpportunity | null) {
  if (!session || !opportunity) return [];
  return session.evidenceRuns
    .filter((run) => run.opportunityId === opportunity.id)
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function reviewRecordsForOpportunity(session: ResearchSession | null | undefined, opportunity: ResearchOpportunity | null) {
  if (!session || !opportunity) return [];
  return session.reviewRecords
    .filter((record) => record.opportunityId === opportunity.id)
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function reasoningNeedsForSymbol(board: OpportunityBoardSummary, symbol: string) {
  return board.reasoning.evidenceNeeds.filter((need) => normalizeSymbol(need.symbol) === normalizeSymbol(symbol));
}

function candidateForSymbol(board: OpportunityBoardSummary, symbol: string) {
  return board.reasoning.candidateOpportunities.find(
    (candidate) => normalizeSymbol(candidate.symbol) === normalizeSymbol(symbol),
  );
}

function sourceTypeForNeed(kind: EvidenceNeed["kind"]) {
  if (kind === "quote") return "quote";
  if (kind === "history") return "history";
  if (kind === "news") return "news";
  return "market_context";
}

function toolLabel(tool: string) {
  return TOOL_LABELS[tool] ?? tool;
}

function lastRunView(run: EvidenceRun | null) {
  if (!run) {
    return {
      lastRunLabel: "无运行记录",
      lastRunSummary: "",
      lastRunAt: "",
      lastRunVerdictLabel: VERDICT_LABELS.none,
    };
  }

  return {
    lastRunLabel: `${toolLabel(run.toolName)} / ${run.fromCache ? "缓存" : "已刷新"}`,
    lastRunSummary: run.summary,
    lastRunAt: run.createdAt,
    lastRunVerdictLabel: VERDICT_LABELS[run.verdict],
  };
}

function buildActionRequest(symbol: string, opportunityId: string | undefined, need: EvidenceNeed, tool: string) {
  if (tool === "news_search") {
    const query = need.kind === "fundamental"
      ? `${symbol} earnings guidance filings`
      : `${symbol} recent market news`;
    return { tool, symbol, opportunityId, query };
  }

  if (tool === "yfinance_history") {
    return { tool, symbol, opportunityId, period: "30d" };
  }

  return { tool, symbol, opportunityId };
}

function actionStateFromRuns(need: EvidenceNeed, tool: string, runs: EvidenceRun[]) {
  const matchingRun = runs.find((run) => run.toolName === tool || run.sourceType === sourceTypeForNeed(need.kind));
  const lastRun = lastRunView(matchingRun ?? null);

  if (!matchingRun) {
    return {
      state: "ready" as const,
      stateLabel: "可运行",
      stateReason: "尚未执行；运行后会补足当前证据缺口。",
      reason: "等待执行",
      ...lastRun,
    };
  }
  if (matchingRun.verdict === "blocked") {
    return {
      state: "blocked" as const,
      stateLabel: "blocked",
      stateReason: `上次执行被阻断：${matchingRun.summary}`,
      reason: matchingRun.summary,
      ...lastRun,
    };
  }
  if (matchingRun.verdict === "error") {
    return {
      state: "error" as const,
      stateLabel: "error",
      stateReason: `上次执行失败：${matchingRun.summary}`,
      reason: matchingRun.summary,
      ...lastRun,
    };
  }
  if (matchingRun.fromCache) {
    return {
      state: "cached" as const,
      stateLabel: "cached",
      stateReason: `命中缓存：${matchingRun.summary}`,
      reason: matchingRun.summary,
      ...lastRun,
    };
  }

  return {
    state: "ready" as const,
    stateLabel: "可再运行",
    stateReason: "上次已刷新；需要最新证据时可再次运行。",
    reason: matchingRun.summary,
    ...lastRun,
  };
}

function buildEvidenceActions(symbol: string, opportunityId: string | undefined, needs: EvidenceNeed[], runs: EvidenceRun[]) {
  return needs.flatMap((need) => {
    const tools = need.preferredTools.length ? need.preferredTools : [];
    return tools.map((tool) => {
      if (!EXECUTABLE_EVIDENCE_TOOLS.has(tool)) {
        return {
          id: `${symbol}-${need.kind}-${tool}`,
          tool,
          label: toolLabel(tool),
          groupLabel: EVIDENCE_KIND_LABELS[need.kind],
          executable: false,
          kind: need.kind,
          question: need.question,
          required: need.required,
          state: "blocked" as const,
          stateLabel: "blocked",
          stateReason: `${toolLabel(tool)}需要人工复核，当前不会作为自动证据动作执行。`,
          reason: `${toolLabel(tool)}需要人工复核，当前不会作为自动证据动作执行。`,
          ...lastRunView(null),
        };
      }

      const state = actionStateFromRuns(need, tool, runs);
      return {
        id: `${symbol}-${need.kind}-${tool}`,
        tool,
        label: toolLabel(tool),
        groupLabel: EVIDENCE_KIND_LABELS[need.kind],
        executable: true,
        kind: need.kind,
        question: need.question,
        required: need.required,
        ...state,
        request: buildActionRequest(symbol, opportunityId, need, tool),
      };
    });
  });
}

export function filterOpportunityRows(rows: OpportunityRowView[], filter: Partial<OpportunityFilterState>) {
  const nextFilter = { ...DEFAULT_FILTER, ...filter };
  const query = nextFilter.query.trim().toLowerCase();

  return rows.filter((row) => {
    if (nextFilter.status !== "all" && row.status !== nextFilter.status) return false;
    if (nextFilter.confidence !== "all" && row.confidence !== nextFilter.confidence) return false;
    if (nextFilter.missingEvidenceOnly && row.evidenceGapCount === 0) return false;
    if (nextFilter.toolAvailability === "has-tools" && !row.evidenceActions.length) return false;
    if (nextFilter.toolAvailability === "cached" && !row.evidenceActions.some((action) => action.state === "cached")) {
      return false;
    }
    if (nextFilter.toolAvailability === "blocked" && !row.evidenceActions.some((action) => action.state === "blocked")) {
      return false;
    }
    if (!query) return true;
    const searchable = [
      row.symbol,
      row.confidence,
      row.statusLabel,
      row.scoreReason,
      row.keyThesis,
      row.evidenceGapLabel,
      row.lastEvidenceLabel,
      row.latestReviewLabel,
      row.latestReviewLearning,
      ...row.sourceRefs,
    ].join(" ").toLowerCase();
    return searchable.includes(query);
  });
}

export function buildOpportunityRows({
  board,
  session,
  filter,
}: {
  board: OpportunityBoardSummary | null;
  session?: ResearchSession | null;
  filter?: Partial<OpportunityFilterState>;
}) {
  if (!board) return [];

  const rows = board.scores.map((score): OpportunityRowView => {
    const opportunity = findOpportunity(session, score.symbol);
    const candidate = candidateForSymbol(board, score.symbol);
    const runs = evidenceRunsForOpportunity(session, opportunity);
    const reviewRecords = reviewRecordsForOpportunity(session, opportunity);
    const evidenceNeeds = opportunity?.evidenceNeeds.length
      ? opportunity.evidenceNeeds
      : reasoningNeedsForSymbol(board, score.symbol);
    const status = opportunity?.status ?? (evidenceNeeds.length ? "needs_evidence" : "new");
    const lastEvidence = runs[0] ?? null;
    const latestReview = reviewRecords[0] ?? null;
    const evidenceActions = buildEvidenceActions(score.symbol, opportunity?.id, evidenceNeeds, runs);

    return {
      rank: score.rank,
      symbol: score.symbol,
      score: score.score,
      confidence: score.confidence,
      scoreReason: formatScoreReason(score),
      status,
      statusLabel: STATUS_LABELS[status],
      statusTone: STATUS_TONES[status],
      evidenceGapCount: evidenceNeeds.length,
      evidenceGapLabel: evidenceNeeds.length
        ? `${evidenceNeeds.length} 个证据缺口`
        : "暂无明确缺口",
      keyThesis: opportunity?.hypothesis ?? candidate?.thesis ?? score.reason,
      lastEvidence,
      lastEvidenceLabel: lastEvidence
        ? `${lastEvidence.toolName} / ${lastEvidence.verdict}`
        : "尚无 evidence run",
      latestReview,
      latestReviewLabel: latestReview ? REVIEW_OUTCOME_LABELS[latestReview.outcome] : "未复盘",
      latestReviewAt: latestReview?.createdAt ?? "",
      latestReviewLearning: latestReview?.learning ?? "",
      sourceRefs: score.sourceRefs,
      boardScore: score,
      opportunity,
      evidenceNeeds,
      evidenceActions,
      invalidation: opportunity?.invalidationConditions ?? candidate?.invalidation ?? [],
    };
  });

  return filterOpportunityRows(rows, filter ?? DEFAULT_FILTER);
}

export function buildInspectorView(
  row: OpportunityRowView | null | undefined,
  session?: ResearchSession | null,
): InspectorView | null {
  if (!row) return null;
  const recentEvidenceRuns = evidenceRunsForOpportunity(session, row.opportunity).slice(0, 8);
  const reviewRecords = reviewRecordsForOpportunity(session, row.opportunity).slice(0, 6);
  const supportingEvidence = recentEvidenceRuns
    .filter((run) => run.verdict === "supporting")
    .map((run) => run.summary)
    .slice(0, 5);

  return {
    row,
    judgementSummary: row.scoreReason,
    hypothesis: row.opportunity?.hypothesis ?? row.keyThesis,
    supportingEvidence,
    evidenceGaps: row.evidenceNeeds,
    evidenceActions: row.evidenceActions,
    invalidation: row.invalidation,
    recentEvidenceRuns,
    reviewRecords,
  };
}
