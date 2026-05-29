import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  EvidenceNeed,
  EvidenceRun,
  EvidenceRunSourceType,
  EvidenceRunVerdict,
  MarketInterpretation,
  ResearchOpportunity,
  ResearchOpportunityStatus,
  ResearchSession,
  ReviewRecord,
  SessionStatus,
} from "@stock-summary/summary-core";
import { loadResearchContext } from "./context";
import { loadOpportunityBoard } from "./opportunity-board";

type EvidenceRunInput = {
  opportunityId: string;
  toolName: string;
  input?: Record<string, string>;
  summary: string;
  sourceType: EvidenceRunSourceType;
  verdict: EvidenceRunVerdict;
  fromCache?: boolean;
};

type ReviewRecordInput = {
  opportunityId: string;
  outcome: ReviewRecord["outcome"];
  observedMove: string;
  failureReason?: string;
  learning: string;
};

type SessionPatch = Partial<Pick<ResearchSession, "status" | "opportunities">>;

function workspaceRoot() {
  return process.env.STOCK_SUMMARY_ROOT
    ? path.resolve(process.env.STOCK_SUMMARY_ROOT)
    : path.resolve(process.cwd(), "../..");
}

function validateDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error(`Invalid research session date: ${day}`);
  }
}

function sessionPath(day: string) {
  validateDay(day);
  return path.join(workspaceRoot(), ".cache", "research-sessions", day, "session.json");
}

function nowIso() {
  return new Date().toISOString();
}

function boundedText(value: unknown, maxLength = 240) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[A-Za-z]:[\\/][^\s"]+/g, "[local-path]")
    .slice(0, maxLength);
}

function shortId(prefix: string, parts: string[]) {
  const hash = crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12);
  return `${prefix}_${hash}`;
}

function datedId(prefix: string, day: string, parts: string[]) {
  return `${prefix}_${day}_${crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12)}`;
}

function stableRecordKey(input: Record<string, string>) {
  return JSON.stringify(Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right))));
}

function evidenceRunDuplicateKey(run: Pick<
  EvidenceRun,
  "opportunityId" | "toolName" | "input" | "summary" | "sourceType" | "verdict" | "fromCache"
>) {
  return JSON.stringify({
    opportunityId: run.opportunityId,
    toolName: run.toolName,
    input: stableRecordKey(run.input),
    summary: run.summary,
    sourceType: run.sourceType,
    verdict: run.verdict,
    fromCache: run.fromCache,
  });
}

function reviewRecordDuplicateKey(record: Pick<
  ReviewRecord,
  "opportunityId" | "outcome" | "observedMove" | "failureReason" | "learning"
>) {
  return JSON.stringify({
    opportunityId: record.opportunityId,
    outcome: record.outcome,
    observedMove: record.observedMove,
    failureReason: record.failureReason ?? "",
    learning: record.learning,
  });
}

async function readSessionFile(day: string) {
  try {
    return JSON.parse(await fs.readFile(sessionPath(day), "utf8")) as ResearchSession;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return undefined;
    throw error;
  }
}

async function writeSessionFile(session: ResearchSession) {
  const filePath = sessionPath(session.day);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(session, null, 2), "utf8");
}

function evidenceNeedsForSymbol(symbol: string, evidenceNeeds: EvidenceNeed[]) {
  return evidenceNeeds.filter((need) => need.symbol === symbol).slice(0, 8);
}

function statusForOpportunity(evidenceNeeds: EvidenceNeed[], existing?: ResearchOpportunityStatus) {
  if (existing && existing !== "new" && existing !== "needs_evidence") return existing;
  return evidenceNeeds.length ? "needs_evidence" : "new";
}

function buildOpportunitiesFromBoard(
  day: string,
  board: Awaited<ReturnType<typeof loadOpportunityBoard>>,
  existing: ResearchOpportunity[] = [],
): ResearchOpportunity[] {
  const existingById = new Map(existing.map((item) => [item.id, item]));

  return board.scores.map((score) => {
    const id = datedId("opp", day, [day, score.symbol]);
    const existingOpportunity = existingById.get(id);
    const evidenceNeeds = evidenceNeedsForSymbol(score.symbol, board.reasoning.evidenceNeeds);
    const candidate = board.reasoning.candidateOpportunities.find((item) => item.symbol === score.symbol);

    return {
      id,
      day,
      symbols: [score.symbol],
      sourceMotive: boundedText(score.reason, 320),
      adminTheoryLink: boundedText(board.reasoning.adminTheory.summary || "admin theory", 240),
      hypothesis: boundedText(candidate?.thesis || score.reason, 360),
      triggerConditions: board.reasoning.nextChecks.slice(0, 4).map((item) => boundedText(item, 220)),
      invalidationConditions: (candidate?.invalidation ?? board.reasoning.invalidationPlan)
        .slice(0, 5)
        .map((item) => boundedText(item, 220)),
      evidenceNeeds,
      score: score.score,
      status: statusForOpportunity(evidenceNeeds, existingOpportunity?.status),
    };
  });
}

function inferSessionStatus(session: ResearchSession): SessionStatus {
  if (session.reviewRecords.length) return "reviewed";
  if (session.evidenceRuns.length) return "evidence_enriched";
  if (session.opportunities.length) return "opportunity_generated";
  if (session.contextStatus.hasStructuredSummary) return "context_loaded";
  return "draft";
}

async function buildSession(day: string | undefined, existing?: ResearchSession): Promise<ResearchSession> {
  const board = await loadOpportunityBoard(day);
  const context = board.status.hasStructuredSummary
    ? await loadResearchContext(board.day)
    : undefined;
  const resolvedDay = board.day;
  const opportunities = buildOpportunitiesFromBoard(resolvedDay, board, existing?.opportunities ?? []);
  const session: ResearchSession = {
    day: resolvedDay,
    status: existing?.status ?? "draft",
    updatedAt: nowIso(),
    contextStatus: board.status,
    sourceContext: {
      adminTheory: board.reasoning.adminTheory.supportingPoints
        .slice(0, 8)
        .map((item) => boundedText(item, 240)),
      marketContext: [
        ...(context?.eventSummary ?? []),
        ...(context?.overview ?? []),
      ].slice(0, 8).map((item) => boundedText(item, 240)),
      keySymbols: board.status.adminSymbolsPreview.map((item) => boundedText(item, 120)),
      risks: board.reasoning.adminTheory.openRisks
        .concat(context?.risks ?? [])
        .slice(0, 8)
        .map((item) => boundedText(item, 220)),
      sourceRefs: [
        board.status.opportunityPath,
        board.status.sourceSummaryPath,
        board.status.structuredSummaryPath,
      ].filter(Boolean),
    },
    opportunities,
    evidenceRuns: existing?.evidenceRuns ?? [],
    agentAnalyses: existing?.agentAnalyses ?? [],
    reviewRecords: existing?.reviewRecords ?? [],
  };
  session.status = inferSessionStatus(session);
  return session;
}

export async function loadResearchSession(day?: string): Promise<ResearchSession> {
  const board = await loadOpportunityBoard(day);
  const resolvedDay = board.day;
  validateDay(resolvedDay);
  const existing = await readSessionFile(resolvedDay);
  const session = await buildSession(day, existing);
  if (!existing) {
    await writeSessionFile(session);
  }
  return session;
}

export async function saveResearchSession(session: ResearchSession) {
  const nextSession = {
    ...session,
    status: inferSessionStatus(session),
    updatedAt: nowIso(),
  };
  await writeSessionFile(nextSession);
  return nextSession;
}

export async function patchResearchSession(day: string | undefined, patch: SessionPatch) {
  const session = await loadResearchSession(day);
  const nextSession = await saveResearchSession({
    ...session,
    ...patch,
    day: session.day,
  });
  return nextSession;
}

export async function appendEvidenceRun(day: string, input: EvidenceRunInput): Promise<EvidenceRun> {
  const session = await loadResearchSession(day);
  const createdAt = nowIso();
  const evidenceRun: EvidenceRun = {
    id: shortId("ev", [day, input.opportunityId, input.toolName, createdAt, input.summary]),
    sessionDay: day,
    opportunityId: input.opportunityId,
    toolName: boundedText(input.toolName, 80),
    input: Object.fromEntries(
      Object.entries(input.input ?? {}).map(([key, value]) => [boundedText(key, 40), boundedText(value, 120)]),
    ),
    summary: boundedText(input.summary, 800),
    sourceType: input.sourceType,
    verdict: input.verdict,
    createdAt,
    fromCache: Boolean(input.fromCache),
  };
  const duplicateKey = evidenceRunDuplicateKey(evidenceRun);
  const opportunities = session.opportunities.map((opportunity) =>
    opportunity.id === input.opportunityId && input.verdict !== "blocked" && input.verdict !== "error"
      ? { ...opportunity, status: "evidence_ready" as const }
      : opportunity,
  );

  await saveResearchSession({
    ...session,
    opportunities,
    evidenceRuns: [
      evidenceRun,
      ...session.evidenceRuns.filter((run) => evidenceRunDuplicateKey(run) !== duplicateKey),
    ].slice(0, 100),
  });

  return evidenceRun;
}

export async function appendReviewRecord(day: string, input: ReviewRecordInput): Promise<ReviewRecord> {
  const session = await loadResearchSession(day);
  const createdAt = nowIso();
  const reviewRecord: ReviewRecord = {
    id: shortId("review", [day, input.opportunityId, createdAt, input.learning]),
    opportunityId: input.opportunityId,
    outcome: input.outcome,
    observedMove: boundedText(input.observedMove, 480),
    failureReason: input.failureReason ? boundedText(input.failureReason, 320) : undefined,
    learning: boundedText(input.learning, 640),
    createdAt,
  };
  const duplicateKey = reviewRecordDuplicateKey(reviewRecord);
  const opportunities = session.opportunities.map((opportunity) =>
    opportunity.id === input.opportunityId
      ? { ...opportunity, status: "reviewed" as const }
      : opportunity,
  );

  await saveResearchSession({
    ...session,
    opportunities,
    reviewRecords: [
      reviewRecord,
      ...session.reviewRecords.filter((record) => reviewRecordDuplicateKey(record) !== duplicateKey),
    ].slice(0, 200),
  });

  return reviewRecord;
}

export async function buildMarketInterpretation(day: string): Promise<MarketInterpretation> {
  const session = await loadResearchSession(day);
  const supportingEvidence = session.evidenceRuns
    .filter((item) => item.verdict === "supporting" || item.verdict === "neutral")
    .slice(0, 6)
    .map((item) => `${item.toolName}: ${item.summary}`);
  const contradictingRisks = [
    ...session.sourceContext.risks,
    ...session.evidenceRuns
      .filter((item) => item.verdict === "contradicting" || item.verdict === "blocked")
      .slice(0, 6)
      .map((item) => `${item.toolName}: ${item.summary}`),
    ...session.evidenceRuns
      .filter((item) => item.verdict === "error")
      .slice(0, 4)
      .map((item) => `${item.toolName}: ${item.summary}`),
  ].slice(0, 8);

  return {
    day,
    marketState: session.sourceContext.marketContext.length
      ? session.sourceContext.marketContext.slice(0, 4)
      : ["Context is incomplete; load the daily summary before increasing confidence."],
    mainLine: session.sourceContext.adminTheory.length
      ? session.sourceContext.adminTheory.slice(0, 4)
      : ["No administrator theory has been extracted for this session yet."],
    symbolReadings: session.opportunities.slice(0, 8).map((opportunity) =>
      `${opportunity.symbols.join(", ")}: ${opportunity.hypothesis}`,
    ),
    supportingEvidence: supportingEvidence.length
      ? supportingEvidence
      : ["No supporting external evidence has been attached yet."],
    contradictingRisks: contradictingRisks.length
      ? contradictingRisks
      : ["No explicit contradicting evidence has been attached yet."],
    nextWatch: session.opportunities
      .flatMap((opportunity) => opportunity.triggerConditions)
      .slice(0, 6),
    researchOnly: true,
  };
}
