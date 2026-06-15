import { fetchStage1 } from "../api/client.js";
import { mapToInsightCandidateOutcomeRow } from "../services/outcomes/persistence.js";
import type {
  EvaluationOutcomeRow,
  EvaluationReportPayload,
  EvaluationReportRecord,
  ModelDecisionSummary,
} from "../types/evaluation.js";
import type { InsightCandidateOutcomeRow } from "../types/outcomes.js";

export async function fetchDecisionOutcomesForEvaluation(input: {
  decision_id?: string;
  symbol?: string;
  status?: string;
  limit?: number;
}): Promise<EvaluationOutcomeRow[]> {
  const response = await fetchStage1<{ items: EvaluationOutcomeRow[]; count: number }>(
    "/decision-outcomes",
    {
      searchParams: {
        decision_id: input.decision_id,
        symbol: input.symbol?.toUpperCase(),
        status: input.status,
        limit: input.limit,
      },
    },
  );
  return response.items;
}

export async function fetchInsightCandidateOutcomesForEvaluation(input: {
  symbol?: string;
  limit?: number;
}): Promise<InsightCandidateOutcomeRow[]> {
  const response = await fetchStage1<{ items: Record<string, unknown>[]; count: number }>(
    "/insight-candidate-outcomes",
    {
      searchParams: {
        symbol: input.symbol?.toUpperCase(),
        limit: input.limit,
        status: "labeled",
      },
    },
  );
  return response.items.map(mapToInsightCandidateOutcomeRow);
}

export async function fetchModelDecisionsForEvaluation(input: {
  symbol?: string;
  model_version?: string;
  limit?: number;
}): Promise<ModelDecisionSummary[]> {
  const response = await fetchStage1<{ items: ModelDecisionSummary[]; count: number }>(
    "/model-decisions",
    {
      searchParams: {
        symbol: input.symbol?.toUpperCase(),
        model_version: input.model_version,
        limit: input.limit,
      },
    },
  );
  return response.items;
}

export async function createEvaluationReport(
  payload: EvaluationReportPayload,
): Promise<EvaluationReportRecord> {
  return fetchStage1<EvaluationReportRecord>("/evaluation-reports", {
    method: "POST",
    json: payload,
  });
}
