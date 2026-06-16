import type { TokenBudgetReport } from "./processedContext.js";

export const DEFAULT_TOKEN_BUDGET = 16_000;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateLayerTokens(
  layeredText: string,
  budgetLimit = DEFAULT_TOKEN_BUDGET,
): TokenBudgetReport {
  const layers = layeredText.split(/^## /m).filter(Boolean);
  const byLayer: Record<string, number> = {};
  let totalEstimated = 0;

  for (const chunk of layers) {
    const lineEnd = chunk.indexOf("\n");
    const name = lineEnd >= 0 ? chunk.slice(0, lineEnd).trim() : "unknown";
    const est = estimateTokens(chunk);
    byLayer[name] = (byLayer[name] ?? 0) + est;
    totalEstimated += est;
  }

  if (Object.keys(byLayer).length === 0) {
    totalEstimated = estimateTokens(layeredText);
    byLayer.all = totalEstimated;
  }

  return {
    totalEstimated,
    byLayer,
    withinBudget: totalEstimated <= budgetLimit,
    budgetLimit,
  };
}
