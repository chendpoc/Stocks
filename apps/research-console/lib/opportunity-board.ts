import type { OpportunityBoardSummary } from "@stock-summary/summary-core";
import { inspectResearchContext, loadResearchContext } from "./context";
import {
  buildOpportunityReasoning,
  buildReasoningInputFromResearchContext,
} from "./opportunity-reasoning";
import { buildOpportunityBoardScores } from "./opportunity-scoring";

export async function loadOpportunityBoard(day: string): Promise<OpportunityBoardSummary> {
  const status = await inspectResearchContext(day);
  const context = status.hasStructuredSummary
    ? await loadResearchContext(day)
    : undefined;
  const scores = context ? buildOpportunityBoardScores(context) : [];
  const reasoning = buildOpportunityReasoning(
    context
      ? buildReasoningInputFromResearchContext(context)
      : {
          summary: { day },
          context: { notes: status.missing },
        },
  );

  return {
    day,
    status,
    scores,
    reasoning,
    riskSummary: {
      hasRiskContext: status.riskCount > 0,
      riskCount: status.riskCount,
      maxLiquidityRisk: scores.reduce(
        (max, score) => Math.max(max, score.components.liquidity_risk),
        0,
      ),
      maxInvalidationClarity: scores.reduce(
        (max, score) => Math.max(max, score.components.invalidation_clarity),
        0,
      ),
    },
  };
}
