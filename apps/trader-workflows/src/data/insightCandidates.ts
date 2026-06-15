import { fetchStage1 } from "../api/client.js";
import { fetchDecisionOutcomesForEvaluation } from "./evaluation.js";
import { listContextSnapshots } from "./contextSnapshots.js";
import type { ContextSnapshotRecord } from "../services/context/types.js";
import type {
  EvaluationOutcomeRow,
  EvaluationReportPayload,
} from "../services/insight/types.js";
import type {
  InsightCandidatePayload,
  InsightCandidateRecord,
} from "../services/insight/types.js";

export async function fetchContextSnapshotsForSymbol(input: {
  symbol: string;
  limit?: number;
}): Promise<ContextSnapshotRecord[]> {
  const response = await listContextSnapshots({
    symbol: input.symbol,
    limit: input.limit,
  });
  return response.items;
}

export async function fetchOutcomesForInsight(input: {
  symbol: string;
  limit?: number;
}): Promise<EvaluationOutcomeRow[]> {
  return fetchDecisionOutcomesForEvaluation({
    symbol: input.symbol,
    limit: input.limit ?? 200,
  });
}

export async function fetchLatestEvaluationReportForInsight(input: {
  evaluation_report_id?: string;
  symbol?: string;
  limit?: number;
}): Promise<EvaluationReportPayload | null> {
  if (input.evaluation_report_id) {
    return fetchStage1<EvaluationReportPayload>(
      `/evaluation-reports/${input.evaluation_report_id}`,
    );
  }
  const response = await fetchStage1<{
    items: EvaluationReportPayload[];
    count: number;
  }>("/evaluation-reports", {
    searchParams: {
      symbol: input.symbol?.toUpperCase(),
      limit: input.limit ?? 1,
    },
  });
  return response.items[0] ?? null;
}

export async function createInsightCandidate(
  payload: InsightCandidatePayload,
): Promise<InsightCandidateRecord> {
  return fetchStage1<InsightCandidateRecord>("/insight-candidates", {
    method: "POST",
    json: payload,
  });
}
