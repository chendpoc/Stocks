import type {
  OpportunityBoardScore,
  OpportunityConfidence,
  OpportunityScore,
  ResearchContextSummary,
} from "@stock-summary/summary-core";

function normalizeSymbol(value: string | undefined) {
  return (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "");
}

function textMentionsSymbol(text: string, symbol: string) {
  return new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
}

function scoreIf(condition: boolean, points: number) {
  return condition ? points : 0;
}

export function symbolsFromResearchContext(context: ResearchContextSummary) {
  return context.adminSymbols
    .flatMap((item) => {
      const match = item.match(/[A-Z]{1,6}(?:[.\-][A-Z])?/);
      return match?.[0] ? [match[0]] : [];
    })
    .filter((symbol, index, all) => all.indexOf(symbol) === index);
}

export function scoreOpportunity(symbol: string, context: ResearchContextSummary): OpportunityScore {
  const adminText = [...context.adminCore, ...context.adminSymbols].join("\n");
  const evidenceText = [
    ...context.overview,
    ...context.eventSummary,
    context.opportunityMarkdown ?? "",
  ].join("\n");
  const riskText = context.risks.join("\n");
  const triggerText = context.opportunityMarkdown ?? "";

  const mentionedInAdmin = textMentionsSymbol(adminText, symbol);
  const mentionedInEvidence = textMentionsSymbol(evidenceText, symbol);
  const hasAdminTheory = context.adminCore.some((item) => item.trim());
  const hasTriggerWording = /\b(trigger|window|confirm|confirmation)\b/i.test(triggerText);
  const hasEvidence = [context.overview, context.eventSummary, [context.opportunityMarkdown ?? ""]]
    .filter((items) => items.some((item) => item.trim()))
    .length;

  const thesis_alignment = Math.min(
    100,
    35 + scoreIf(mentionedInAdmin, 35) + scoreIf(hasAdminTheory, 20) + scoreIf(mentionedInEvidence, 10),
  );
  const trigger_clarity = Math.min(
    100,
    25 + scoreIf(hasTriggerWording, 45) + scoreIf(textMentionsSymbol(triggerText, symbol), 20),
  );
  const evidence_quality = Math.min(
    100,
    20 + hasEvidence * 15 + scoreIf(mentionedInEvidence, 25) + scoreIf(mentionedInAdmin, 10),
  );
  const invalidation_clarity = Math.min(
    100,
    20 + scoreIf(riskText.trim().length > 0, 45) + Math.min(25, riskText.length / 8),
  );
  const liquidity_risk = Math.max(
    20,
    Math.min(80, 65 - Math.min(25, riskText.length / 16) + scoreIf(!mentionedInEvidence, 10)),
  );

  return {
    symbol,
    thesis_alignment: Math.round(thesis_alignment),
    trigger_clarity: Math.round(trigger_clarity),
    evidence_quality: Math.round(evidence_quality),
    invalidation_clarity: Math.round(invalidation_clarity),
    liquidity_risk: Math.round(liquidity_risk),
    summary: `${symbol}: research observation only; alignment, trigger, evidence, invalidation, and liquidity-risk context require continued verification.`,
  };
}

export function totalOpportunityScore(score: OpportunityScore) {
  return Math.round(
    (
      score.thesis_alignment +
      score.trigger_clarity +
      score.evidence_quality +
      score.invalidation_clarity +
      (100 - score.liquidity_risk)
    ) / 5,
  );
}

export function opportunityConfidence(score: number): OpportunityConfidence {
  if (score >= 75) return "high";
  if (score >= 55) return "medium";
  return "low";
}

export function formatOpportunityScoreReason(score: OpportunityScore) {
  return `thesis_alignment=${score.thesis_alignment}; trigger_clarity=${score.trigger_clarity}; evidence_quality=${score.evidence_quality}; invalidation_clarity=${score.invalidation_clarity}; liquidity_risk=${score.liquidity_risk}`;
}

export function buildOpportunityScores(
  context: ResearchContextSummary,
  requestedSymbol?: string,
): OpportunityScore[] {
  const symbol = normalizeSymbol(requestedSymbol);
  const symbols = symbol ? [symbol] : symbolsFromResearchContext(context);
  return symbols
    .map((item) => scoreOpportunity(item, context))
    .sort((left, right) => totalOpportunityScore(right) - totalOpportunityScore(left));
}

export function buildOpportunityBoardScores(context: ResearchContextSummary): OpportunityBoardScore[] {
  const sourceRefs = [
    "structured_summary",
    context.opportunityMarkdown?.trim() ? "opportunity_observation" : "",
  ].filter(Boolean);

  return buildOpportunityScores(context).map((score, index) => {
    const total = totalOpportunityScore(score);
    return {
      rank: index + 1,
      symbol: score.symbol,
      score: total,
      confidence: opportunityConfidence(total),
      reason: formatOpportunityScoreReason(score),
      components: {
        thesis_alignment: score.thesis_alignment,
        trigger_clarity: score.trigger_clarity,
        evidence_quality: score.evidence_quality,
        invalidation_clarity: score.invalidation_clarity,
        liquidity_risk: score.liquidity_risk,
      },
      sourceRefs,
    };
  });
}
