import { z } from "zod";

export const FailurePathSchema = z.object({
  path: z.string(),
  score: z.number().min(0).max(1),
  detail: z.string(),
});

export const ContraResultSchema = z.object({
  contra_text: z.string().max(200),
  risk_flags: z.array(z.string()),
  quality_score: z.number().min(0).max(1),
  criteria_scores: z.object({
    evidence_completeness: z.number().min(0).max(1),
    setup_validation: z.number().min(0).max(1),
    risk_identification: z.number().min(0).max(1),
  }),
  top_failure_paths: z.array(FailurePathSchema).optional(),
});

export type ContraResult = z.infer<typeof ContraResultSchema>;
export type FailurePath = z.infer<typeof FailurePathSchema>;

export type ContraGuardrailContext = {
  evidenceSourceCount: number;
};

export type ContraGuardrailOutput = ContraResult & {
  needs_review?: boolean;
  top_failure_paths?: FailurePath[];
};

/** §4.5 deterministic guardrails E-G */
export function applyContraGuardrails(
  raw: ContraResult,
  ctx: ContraGuardrailContext,
): ContraGuardrailOutput {
  let quality_score = raw.quality_score;
  const risk_flags = [...raw.risk_flags];
  const criteria_scores = { ...raw.criteria_scores };
  let needs_review = false;

  // Rule E
  if (risk_flags.length === 0 && quality_score > 0.7) {
    quality_score = 0.6;
    risk_flags.push("suspicious_high_score");
  }

  // Rule F
  if (
    ctx.evidenceSourceCount < 2 &&
    criteria_scores.evidence_completeness > 0.5
  ) {
    criteria_scores.evidence_completeness = 0.3;
  }

  // Rule G
  if (quality_score < 0.4) {
    needs_review = true;
  }

  return {
    ...raw,
    quality_score,
    risk_flags,
    criteria_scores,
    ...(needs_review ? { needs_review } : {}),
  };
}

export function mergeConfidenceContribution(
  evidenceConfidence: number,
  judgeQuality: number,
): number {
  return Math.min(evidenceConfidence, judgeQuality);
}

export const CONTRA_UNAVAILABLE: ContraResult = {
  contra_text: "LLM unavailable — contra not generated",
  risk_flags: [],
  quality_score: 0,
  criteria_scores: {
    evidence_completeness: 0,
    setup_validation: 0,
    risk_identification: 0,
  },
};
