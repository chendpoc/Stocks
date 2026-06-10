import { generateText, zodSchema, type CoreTool, type LanguageModel } from "ai";
import { z } from "zod";

import { resolveEvidenceTools } from "../../llm/evidenceTools.js";
import {
  getFlashModel,
  getProModel,
  getProThinkingModel,
} from "../../llm/workflowModels.js";
import {
  applyContraGuardrails,
  CONTRA_UNAVAILABLE,
  ContraResultSchema,
  mergeConfidenceContribution,
  type ContraGuardrailOutput,
  type ContraResult,
  type FailurePath,
} from "./contraResult.js";
import {
  applyEvidenceGuardrails,
  EVIDENCE_UNAVAILABLE,
  EvidenceResultSchema,
  truncateToMaxWords,
  type EvidenceGuardrailOutput,
  type EvidenceResult,
} from "./evidenceResult.js";
import { formatMidDayDeepPrompt, formatSwarmLeadPrompt } from "./prompts.js";

// ─── Types ───────────────────────────────────────────────────

export type BuildEvidenceInput = {
  symbol: string;
  setupName: string;
  features?: Record<string, unknown>;
  marketState?: Record<string, unknown>;
};

export type GenerateContraInput = {
  evidenceText: string;
  symbol: string;
  setupName: string;
  features?: Record<string, unknown>;
  evidenceSourceCount: number;
};

export type GateDecision = {
  complexity_score: number;
  symbols: string[];
  setups?: Record<string, string>;
};

export type SwarmWorkerResult = {
  symbol: string;
  text: string;
  wallClockMs: number;
};

export type ChatReActFn = (opts: {
  model: LanguageModel;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tools: Record<string, CoreTool>;
  maxSteps?: number;
}) => Promise<{ text: string; wallClockMs: number }>;

export type GenerateTextLike = (options: {
  model: LanguageModel;
  system: string;
  prompt: string;
  tools?: Record<string, CoreTool>;
  maxSteps?: number;
  maxRetries?: number;
  experimental_output?: ReturnType<typeof zodSchema>;
}) => Promise<{
  experimental_output?: unknown;
  steps?: unknown[];
}>;

export type LlmNodeDeps = {
  getFlashModel?: () => LanguageModel;
  getProModel?: () => LanguageModel;
  getProThinkingModel?: () => LanguageModel;
  resolveTools?: (scope: "evidence") => Record<string, CoreTool>;
  generateTextFn?: GenerateTextLike;
  chatReAct?: ChatReActFn;
};

const EVIDENCE_MAX_STEPS = 5;
const TOT_BEAM_WIDTH = 3;
const TOT_MAX_DEPTH = 2;
const SWARM_COMPLEXITY_THRESHOLD = 0.3;

const OpponentPathSchema = z.object({
  paths: z.array(
    z.object({
      path: z.string(),
      score: z.number().min(0).max(1),
      detail: z.string(),
      children: z
        .array(
          z.object({
            path: z.string(),
            score: z.number().min(0).max(1),
            detail: z.string(),
          }),
        )
        .optional(),
    }),
  ),
});

// ─── Helpers ─────────────────────────────────────────────────

function buildEvidenceUserPrompt(input: BuildEvidenceInput): string {
  return [
    `Symbol: ${input.symbol}`,
    `Setup: ${input.setupName}`,
    input.features ? `Features: ${JSON.stringify(input.features)}` : "",
    input.marketState ? `Market state: ${JSON.stringify(input.marketState)}` : "",
    "Collect evidence via tools, then output structured JSON.",
  ]
    .filter(Boolean)
    .join("\n");
}

function resolveLlmDeps(overrides: LlmNodeDeps = {}) {
  return {
    getFlashModel: overrides.getFlashModel ?? getFlashModel,
    getProModel: overrides.getProModel ?? getProModel,
    getProThinkingModel: overrides.getProThinkingModel ?? getProThinkingModel,
    resolveTools: overrides.resolveTools ?? (() => resolveEvidenceTools()),
    generateTextFn:
      overrides.generateTextFn ??
      ((options) => generateText(options as Parameters<typeof generateText>[0])),
    chatReAct: overrides.chatReAct,
  };
}

type StepToolUsage = {
  toolsUsed: string[];
  unverifiedNews: boolean;
};

function extractToolUsageFromSteps(steps: unknown[]): StepToolUsage {
  const toolsUsed: string[] = [];
  let webSearch = false;
  let fetchUrl = false;

  for (const step of steps) {
    const record = step as { toolCalls?: Array<{ toolName: string }> };
    for (const call of record.toolCalls ?? []) {
      toolsUsed.push(call.toolName);
      const name = call.toolName.toLowerCase();
      if (name.includes("websearch")) {
        webSearch = true;
      }
      if (name.includes("fetchurl")) {
        fetchUrl = true;
      }
    }
  }

  return {
    toolsUsed,
    unverifiedNews: webSearch && !fetchUrl,
  };
}

const LeadSynthesisSchema = z.object({
  lead_summary: z.string().max(500),
  per_symbol: z.array(
    z.object({
      symbol: z.string(),
      stance: z.enum(["trade", "watch", "invalidate"]),
      confidence: z.number().min(0).max(1),
      note: z.string().max(200),
    }),
  ),
});

export function parseWorkerEvidence(text: string): EvidenceResult {
  const trimmed = text.trim();
  const jsonBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [jsonBlock?.[1], trimmed].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      return EvidenceResultSchema.parse(parsed);
    } catch {
      // try next
    }
  }

  const confMatch = trimmed.match(/confidence_contribution:\s*([0-9.]+)/i);
  const confidence = confMatch ? Number(confMatch[1]) : 0.4;

  return {
    evidence_text: truncateToMaxWords(trimmed),
    confidence_contribution: Number.isFinite(confidence) ? confidence : 0.4,
    evidence_sources: ["swarm_worker_react"],
  };
}

// ─── S1: build_evidence ──────────────────────────────────────

export async function buildEvidence(
  input: BuildEvidenceInput,
  deps: LlmNodeDeps = {},
): Promise<EvidenceGuardrailOutput> {
  const { getFlashModel: flash, resolveTools, generateTextFn } =
    resolveLlmDeps(deps);

  try {
    const result = await generateTextFn({
      model: flash(),
      system: formatMidDayDeepPrompt(input.symbol, input.setupName),
      prompt: buildEvidenceUserPrompt(input),
      tools: resolveTools("evidence"),
      maxSteps: EVIDENCE_MAX_STEPS,
      maxRetries: 2,
      experimental_output: zodSchema(EvidenceResultSchema),
    });

    const raw = EvidenceResultSchema.parse(result.experimental_output);
    const stepCount = result.steps?.length ?? 0;
    const { toolsUsed, unverifiedNews } = extractToolUsageFromSteps(
      result.steps ?? [],
    );

    return applyEvidenceGuardrails(raw, {
      reactSteps: stepCount,
      toolsUsed,
      unverifiedNews,
    });
  } catch {
    return applyEvidenceGuardrails(EVIDENCE_UNAVAILABLE, { reactSteps: 0 });
  }
}

// ─── S2: generate_contra (Debate + ToT) ─────────────────────

async function runProposer(
  input: GenerateContraInput,
  generateTextFn: GenerateTextLike,
  flash: () => LanguageModel,
): Promise<string | null> {
  try {
    const result = await generateTextFn({
      model: flash(),
      system:
        "You are the Proposer in a trading debate. Argue why the setup holds based on evidence.",
      prompt: [
        `Symbol: ${input.symbol}`,
        `Setup: ${input.setupName}`,
        `Evidence: ${input.evidenceText}`,
        "Output JSON: { proposal: string }",
      ].join("\n"),
      maxSteps: 1,
      experimental_output: zodSchema(z.object({ proposal: z.string().max(200) })),
    });
    const parsed = z.object({ proposal: z.string() }).parse(result.experimental_output);
    return parsed.proposal;
  } catch {
    return null;
  }
}

async function runOpponentTot(
  input: GenerateContraInput,
  proposal: string,
  generateTextFn: GenerateTextLike,
  proThinking: () => LanguageModel,
): Promise<FailurePath[]> {
  try {
    const result = await generateTextFn({
      model: proThinking(),
      system: [
        "You are the Opponent using Tree of Thoughts.",
        `Explore up to ${TOT_BEAM_WIDTH} failure paths at depth ${TOT_MAX_DEPTH}.`,
        "Score each path 0-1. Prune weak paths.",
      ].join(" "),
      prompt: [
        `Symbol: ${input.symbol}`,
        `Setup: ${input.setupName}`,
        `Proposer: ${proposal}`,
        `Evidence: ${input.evidenceText}`,
        "Output JSON with paths array.",
      ].join("\n"),
      maxSteps: 1,
      experimental_output: zodSchema(OpponentPathSchema),
    });

    const parsed = OpponentPathSchema.parse(result.experimental_output);
    const ranked: FailurePath[] = [];

    for (const root of parsed.paths) {
      ranked.push({ path: root.path, score: root.score, detail: root.detail });
      for (const child of root.children ?? []) {
        ranked.push({
          path: `${root.path} → ${child.path}`,
          score: child.score,
          detail: child.detail,
        });
      }
    }

    return ranked
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
  } catch {
    return [];
  }
}

async function runJudge(
  input: GenerateContraInput,
  proposal: string,
  failurePaths: FailurePath[],
  generateTextFn: GenerateTextLike,
  pro: () => LanguageModel,
): Promise<ContraResult | null> {
  try {
    const result = await generateTextFn({
      model: pro(),
      system:
        "You are the Judge. Synthesize contra case, risk_flags, quality_score, criteria_scores.",
      prompt: [
        `Symbol: ${input.symbol}`,
        `Setup: ${input.setupName}`,
        `Proposer: ${proposal}`,
        `Opponent paths: ${JSON.stringify(failurePaths)}`,
        `Evidence: ${input.evidenceText}`,
      ].join("\n"),
      maxSteps: 1,
      experimental_output: zodSchema(ContraResultSchema),
    });
    return ContraResultSchema.parse(result.experimental_output);
  } catch {
    return null;
  }
}

function evidenceOnlyContra(input: GenerateContraInput): ContraGuardrailOutput {
  return applyContraGuardrails(
    {
      contra_text: input.evidenceText.slice(0, 200),
      risk_flags: [],
      quality_score: 0.45,
      criteria_scores: {
        evidence_completeness: Math.min(0.6, input.evidenceSourceCount / 5),
        setup_validation: 0.5,
        risk_identification: 0,
      },
    },
    { evidenceSourceCount: input.evidenceSourceCount },
  );
}

export async function generateContra(
  input: GenerateContraInput,
  deps: LlmNodeDeps = {},
): Promise<ContraGuardrailOutput | null> {
  const {
    getFlashModel: flash,
    getProModel: pro,
    getProThinkingModel: proThinking,
    generateTextFn,
  } = resolveLlmDeps(deps);

  const proposal = await runProposer(input, generateTextFn, flash);
  if (!proposal) {
    return evidenceOnlyContra(input);
  }

  const failurePaths = await runOpponentTot(
    input,
    proposal,
    generateTextFn,
    proThinking,
  );
  if (failurePaths.length === 0) {
    return applyContraGuardrails(
      {
        contra_text: proposal,
        risk_flags: [],
        quality_score: 0.5,
        criteria_scores: {
          evidence_completeness: 0.3,
          setup_validation: 0.5,
          risk_identification: 0,
        },
      },
      { evidenceSourceCount: input.evidenceSourceCount },
    );
  }

  const judged = await runJudge(input, proposal, failurePaths, generateTextFn, pro);
  if (!judged) {
    const topPaths = failurePaths.slice(0, 2);
    return applyContraGuardrails(
      {
        contra_text: topPaths.map((p) => p.detail).join(" "),
        risk_flags: topPaths.map((p) => p.path.replace(/\s+/g, "_").toLowerCase()),
        quality_score: topPaths[0]?.score ?? 0.3,
        criteria_scores: {
          evidence_completeness: 0.4,
          setup_validation: 0.4,
          risk_identification: topPaths[0]?.score ?? 0.3,
        },
        top_failure_paths: topPaths,
      },
      { evidenceSourceCount: input.evidenceSourceCount },
    );
  }

  return applyContraGuardrails(
    { ...judged, top_failure_paths: failurePaths },
    { evidenceSourceCount: input.evidenceSourceCount },
  );
}

export async function generateContraWithFallback(
  input: GenerateContraInput,
  deps: LlmNodeDeps = {},
): Promise<ContraGuardrailOutput> {
  const result = await generateContra(input, deps);
  return result ?? applyContraGuardrails(CONTRA_UNAVAILABLE, {
    evidenceSourceCount: input.evidenceSourceCount,
  });
}

// ─── S3: Swarm ───────────────────────────────────────────────

export function shouldUseSwarm(gate: GateDecision): boolean {
  return (
    gate.complexity_score >= SWARM_COMPLEXITY_THRESHOLD &&
    gate.symbols.length > 0
  );
}

export async function runSwarmWorkers(
  gate: GateDecision,
  deps: LlmNodeDeps = {},
): Promise<SwarmWorkerResult[]> {
  const { getFlashModel: flash, resolveTools, chatReAct } = resolveLlmDeps(deps);
  if (!chatReAct) {
    throw new Error("chatReAct dependency is required for Swarm workers");
  }

  const tools = resolveTools("evidence");
  const setups = gate.setups ?? {};

  const workers = gate.symbols.map(async (symbol) => {
    const setupName = setups[symbol] ?? "Unknown";
    const start = Date.now();
    const result = await chatReAct({
      model: flash(),
      system: formatMidDayDeepPrompt(symbol, setupName),
      messages: [
        {
          role: "user",
          content: `分析 ${symbol} 的 ${setupName} setup`,
        },
      ],
      tools,
      maxSteps: EVIDENCE_MAX_STEPS,
    });
    return {
      symbol,
      text: result.text,
      wallClockMs: result.wallClockMs ?? Date.now() - start,
    };
  });

  return Promise.all(workers);
}

export async function runSwarmLead(
  gate: GateDecision,
  workerResults: SwarmWorkerResult[],
  deps: LlmNodeDeps = {},
): Promise<{
  leadSummary: string;
  contra: ContraGuardrailOutput;
  perSymbolEvidence: EvidenceGuardrailOutput[];
}> {
  const perSymbolEvidence: EvidenceGuardrailOutput[] = workerResults.map((w) => {
    const parsed = parseWorkerEvidence(w.text);
    return applyEvidenceGuardrails(parsed, {
      reactSteps: EVIDENCE_MAX_STEPS,
      toolsUsed: parsed.evidence_sources,
    });
  });

  const combinedEvidence = workerResults
    .map(
      (w, i) =>
        `[${w.symbol}] ${perSymbolEvidence[i]?.evidence_text ?? w.text}`,
    )
    .join("\n\n");

  const { getProModel: pro, generateTextFn } = resolveLlmDeps(deps);

  let leadSummary = combinedEvidence;
  try {
    const leadResult = await generateTextFn({
      model: pro(),
      system: formatSwarmLeadPrompt(gate.symbols),
      prompt: [
        "Worker outputs:",
        combinedEvidence,
        "Synthesize per-symbol stance (trade|watch|invalidate) and confidence.",
        "Output JSON: { lead_summary, per_symbol: [{ symbol, stance, confidence, note }] }",
      ].join("\n"),
      maxSteps: 1,
      experimental_output: zodSchema(LeadSynthesisSchema),
    });
    const parsed = LeadSynthesisSchema.parse(leadResult.experimental_output);
    leadSummary = [
      parsed.lead_summary,
      ...parsed.per_symbol.map(
        (row) =>
          `${row.symbol}: ${row.stance} (conf=${row.confidence}) — ${row.note}`,
      ),
    ].join("\n");
  } catch {
    leadSummary = combinedEvidence;
  }

  const contra = await generateContraWithFallback(
    {
      evidenceText: leadSummary,
      symbol: gate.symbols.join(","),
      setupName: "swarm_multi",
      evidenceSourceCount: perSymbolEvidence.reduce(
        (sum, e) => sum + e.evidence_sources.length,
        0,
      ),
    },
    deps,
  );

  return {
    leadSummary,
    contra,
    perSymbolEvidence,
  };
}

/** Route: single symbol → build_evidence + generate_contra; multi → Swarm */
export async function runMidDayDeepAnalysis(
  gate: GateDecision,
  singleInput: BuildEvidenceInput,
  deps: LlmNodeDeps = {},
): Promise<{
  mode: "single" | "swarm";
  evidence?: EvidenceGuardrailOutput;
  contra?: ContraGuardrailOutput;
  workers?: SwarmWorkerResult[];
  finalConfidence?: number;
}> {
  if (shouldUseSwarm(gate)) {
    const workers = await runSwarmWorkers(gate, deps);
    const lead = await runSwarmLead(gate, workers, deps);
    const evidenceConf = Math.max(
      ...lead.perSymbolEvidence.map((e) => e.confidence_contribution),
      0,
    );
    return {
      mode: "swarm",
      workers,
      contra: lead.contra,
      finalConfidence: mergeConfidenceContribution(
        evidenceConf,
        lead.contra.quality_score,
      ),
    };
  }

  const evidence = await buildEvidence(singleInput, deps);
  const contra = await generateContraWithFallback(
    {
      evidenceText: evidence.evidence_text,
      symbol: singleInput.symbol,
      setupName: singleInput.setupName,
      features: singleInput.features,
      evidenceSourceCount: evidence.evidence_sources.length,
    },
    deps,
  );

  return {
    mode: "single",
    evidence,
    contra,
    finalConfidence: mergeConfidenceContribution(
      evidence.confidence_contribution,
      contra.quality_score,
    ),
  };
}
