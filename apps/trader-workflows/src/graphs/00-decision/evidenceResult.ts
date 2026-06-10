import { z } from "zod";

export const MAX_EVIDENCE_WORDS = 300;

export function truncateToMaxWords(
  text: string,
  maxWords = MAX_EVIDENCE_WORDS,
): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return text.trim();
  }
  return words.slice(0, maxWords).join(" ");
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export const EvidenceResultSchema = z.object({
  evidence_text: z
    .string()
    .transform((t) => truncateToMaxWords(t))
    .refine((t) => countWords(t) <= MAX_EVIDENCE_WORDS, {
      message: `evidence_text must be at most ${MAX_EVIDENCE_WORDS} words`,
    }),
  confidence_contribution: z.number().min(0).max(1),
  evidence_sources: z.array(z.string()),
});

export type EvidenceResult = z.infer<typeof EvidenceResultSchema>;

const SENTIMENT_SOURCE_MARKERS = [
  "web_search",
  "websearch",
  "fetch_url",
  "fetchurl",
  "searchrecentevents",
];

const MARKET_SOURCE_MARKERS = [
  "fetchmarketbars",
  "fetchbenchmarkbars",
  "fetchoptionflow",
];

const HISTORY_SOURCE_MARKERS = ["querypatternhistory"];

export type EvidenceGuardrailContext = {
  reactSteps: number;
  sentimentToolsUsed?: boolean;
  unverifiedNews?: boolean;
  toolsUsed?: string[];
};

export type EvidenceGuardrailOutput = EvidenceResult & {
  needs_review?: boolean;
  risk_flags?: string[];
  missing_evidence_dimensions?: string[];
};

function hasMarker(sources: string[], markers: string[]): boolean {
  return sources.some((s) =>
    markers.some((m) => s.toLowerCase().replace(/_/g, "").includes(m)),
  );
}

function detectMissingDimensions(sources: string[]): string[] {
  const missing: string[] = [];
  if (!hasMarker(sources, MARKET_SOURCE_MARKERS)) {
    missing.push("market");
  }
  if (!hasMarker(sources, SENTIMENT_SOURCE_MARKERS)) {
    missing.push("sentiment");
  }
  if (!hasMarker(sources, HISTORY_SOURCE_MARKERS)) {
    missing.push("history");
  }
  return missing;
}

function hasSentimentSource(sources: string[]): boolean {
  return hasMarker(sources, SENTIMENT_SOURCE_MARKERS);
}

/** §3.5 deterministic guardrails A-D + H-I */
export function applyEvidenceGuardrails(
  raw: EvidenceResult,
  ctx: EvidenceGuardrailContext,
): EvidenceGuardrailOutput {
  let confidence = raw.confidence_contribution;
  let evidence_text = raw.evidence_text;
  const risk_flags: string[] = [];
  let needs_review = false;
  const sources = [
    ...new Set([...raw.evidence_sources, ...(ctx.toolsUsed ?? [])]),
  ];

  // Rule A
  if (sources.length === 0) {
    confidence = 0;
  }

  // Rule B
  if (sources.length === 1) {
    confidence = Math.min(0.5, confidence);
  }

  // Rule C — word count, not characters
  if (countWords(evidence_text) < 50 && confidence > 0.5) {
    confidence = 0.3;
  }

  // Rule D — record missing dimensions when ReAct exhausted with thin sources
  let missing_evidence_dimensions: string[] | undefined;
  if (ctx.reactSteps >= 5 && sources.length < 3) {
    needs_review = true;
    const missing = detectMissingDimensions(sources);
    if (missing.length > 0) {
      missing_evidence_dimensions = missing;
    }
  }

  // Rule H
  const sentimentUsed = ctx.sentimentToolsUsed ?? hasSentimentSource(sources);
  if (!sentimentUsed) {
    evidence_text = truncateToMaxWords(
      `${evidence_text} [no sentiment data available]`,
    );
  }

  // Rule I
  if (ctx.unverifiedNews) {
    risk_flags.push("unverified_news_source");
  }

  return {
    evidence_text,
    confidence_contribution: confidence,
    evidence_sources: sources,
    ...(needs_review ? { needs_review } : {}),
    ...(risk_flags.length > 0 ? { risk_flags } : {}),
    ...(missing_evidence_dimensions ? { missing_evidence_dimensions } : {}),
  };
}

export const EVIDENCE_UNAVAILABLE: EvidenceResult = {
  evidence_text: "LLM unavailable — evidence not generated",
  confidence_contribution: 0,
  evidence_sources: [],
};
