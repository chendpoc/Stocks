import {
  type DecisionEnvelope,
  DecisionEnvelopeValidationError,
  parseDecisionEnvelope,
} from "./decisionEnvelope.js";
import type { WeightedContextItem } from "../services/contextSnapshots.js";
import {
  DEFAULT_INSIGHT_WEIGHT_CAP,
  enforceInsightProposal,
  evidenceRefsFromContextItems,
  type InsightProposal,
  type InsightReActStepRecord,
} from "../services/insightCandidates.js";
import type { EvaluationOutcomeRow } from "../services/evaluation.js";

export interface DecisionGenerationInput {
  symbol: string;
  contextItems: WeightedContextItem[];
}

export interface InsightProposalGenerationInput {
  symbol: string;
  window_start: string;
  window_end: string;
  contextItems: WeightedContextItem[];
  outcomes: EvaluationOutcomeRow[];
  react_steps?: InsightReActStepRecord[];
  exploration_prompt?: string;
}

export interface WorkflowLlmProvider {
  generateDecisionEnvelope(
    input: DecisionGenerationInput,
  ): Promise<DecisionEnvelope>;
  generateInsightProposal(
    input: InsightProposalGenerationInput,
  ): Promise<InsightProposal>;
}

function normalizeBaseUrl(url: string): string {
  let base = url.replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) {
    base = base.slice(0, -"/chat/completions".length);
  }
  return base;
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("LLM response did not contain JSON object");
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

const DECISION_ACTION_REQUIREMENTS = [
  "NO_TRADE: thesis only",
  "WATCH: watch_condition (what to monitor)",
  "WAIT_TRIGGER: trigger + invalidation",
  "PAPER_ENTER_CANDIDATE: trigger + invalidation + target_plan",
  "PAPER_EXIT_CANDIDATE: exit_rationale + (invalidation or hold_condition)",
  "INVALIDATE: invalidation",
].join("\n");

function buildDecisionPrompt(input: DecisionGenerationInput, repairHint?: string): string {
  const topItems = [...input.contextItems]
    .sort((a, b) => b.composite_weight - a.composite_weight)
    .slice(0, 12)
    .map((item) => ({
      source_type: item.source_type,
      summary: item.summary,
      evidence_ref: item.evidence_ref,
      composite_weight: item.composite_weight,
    }));

  return [
    "Return strict JSON only for a trading DecisionEnvelope.",
    `Symbol: ${input.symbol}`,
    "Allowed actions: NO_TRADE, WATCH, WAIT_TRIGGER, PAPER_ENTER_CANDIDATE, PAPER_EXIT_CANDIDATE, INVALIDATE.",
    "Required fields: symbol, action, thesis, confidence (decimal 0-1, not percent). Optional: uncertainty (decimal 0-1).",
    "Action-specific required fields:",
    DECISION_ACTION_REQUIREMENTS,
    repairHint ? `Fix this validation error from the previous response: ${repairHint}` : "",
    "Context items:",
    JSON.stringify(topItems),
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

async function callDecisionLlm(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
): Promise<unknown> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a market decision assistant. Output one JSON object only with snake_case field names.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM provider ${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM provider returned empty content");
  }
  return extractJsonObject(content);
}

export function createWorkflowLlmProvider(): WorkflowLlmProvider {
  const provider = process.env.LLM_PROVIDER ?? "deepseek";
  const apiKey = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY;
  const model = process.env.LLM_MODEL ?? "deepseek-chat";

  if (!apiKey) {
    throw new Error("LLM_API_KEY or OPENAI_API_KEY is required for DecisionGraph");
  }

  const baseUrl =
    provider === "openrouter"
      ? "https://openrouter.ai/api/v1"
      : normalizeBaseUrl(process.env.LLM_BASE_URL ?? "https://api.deepseek.com/v1");

  return {
    async generateDecisionEnvelope(input) {
      const symbol = input.symbol.toUpperCase();
      let repairHint: string | undefined;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const prompt = buildDecisionPrompt(input, repairHint);
        const parsed = await callDecisionLlm(baseUrl, apiKey, model, prompt);
        try {
          const envelope = parseDecisionEnvelope(parsed);
          if (envelope.symbol !== symbol) {
            throw new Error(
              `DecisionEnvelope symbol mismatch: expected ${symbol}, got ${envelope.symbol}`,
            );
          }
          return envelope;
        } catch (error) {
          if (
            attempt === 0 &&
            error instanceof DecisionEnvelopeValidationError
          ) {
            repairHint = error.message;
            continue;
          }
          throw error;
        }
      }

      throw new Error("DecisionEnvelope generation failed after retry");
    },

    async generateInsightProposal(input) {
      const topItems = [...input.contextItems]
        .sort((a, b) => b.composite_weight - a.composite_weight)
        .slice(0, 12);
      const labeledOutcomes = input.outcomes
        .filter((row) => row.status === "labeled")
        .slice(0, 20)
        .map((row) => ({
          outcome_id: row.outcome_id,
          horizon: row.horizon,
          path: row.path,
          label: row.label ?? null,
          relative_return_pct: row.relative_return_pct ?? null,
        }));

      const prompt = [
        "Return strict JSON only for an unverified market InsightCandidate proposal.",
        `Symbol: ${input.symbol}`,
        `Window: ${input.window_start} -> ${input.window_end}`,
        `Max weight_cap: ${DEFAULT_INSIGHT_WEIGHT_CAP}`,
        "Fields: thesis (string), evidence_refs (array of {ref_type, ref_id, summary?}), weight_cap (0-0.5), candidate_json (object with confidence, status=candidate, auto_promotion=false).",
        "Do not promote lessons, trade, train, or exceed weight_cap.",
        input.exploration_prompt ? `Exploration prompt: ${input.exploration_prompt}` : "",
        "ReAct observations:",
        JSON.stringify(input.react_steps ?? []),
        "Context items:",
        JSON.stringify(
          topItems.map((item) => ({
            source_type: item.source_type,
            summary: item.summary,
            evidence_ref: item.evidence_ref,
            composite_weight: item.composite_weight,
          })),
        ),
        "Historical outcomes:",
        JSON.stringify(labeledOutcomes),
      ]
        .filter((line) => line.length > 0)
        .join("\n");

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "You explore market mechanisms and output one JSON InsightCandidate proposal only. Never trade or promote lessons.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `LLM provider ${response.status}: ${await response.text()}`,
        );
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("LLM provider returned empty insight content");
      }

      const parsed = extractJsonObject(content) as Record<string, unknown>;
      const thesis =
        typeof parsed.thesis === "string" && parsed.thesis.trim().length > 0
          ? parsed.thesis.trim()
          : `Exploratory insight for ${input.symbol}`;
      const evidence_refs = Array.isArray(parsed.evidence_refs)
        ? (parsed.evidence_refs as InsightProposal["evidence_refs"])
        : evidenceRefsFromContextItems(topItems);
      const weight_cap =
        typeof parsed.weight_cap === "number" ? parsed.weight_cap : DEFAULT_INSIGHT_WEIGHT_CAP;
      const candidate_json =
        typeof parsed.candidate_json === "object" && parsed.candidate_json !== null
          ? (parsed.candidate_json as Record<string, unknown>)
          : { status: "candidate", auto_promotion: false };

      return enforceInsightProposal({
        thesis,
        evidence_refs,
        weight_cap,
        candidate_json: {
          ...candidate_json,
          status: "candidate",
          auto_promotion: false,
          source: "llm_react",
        },
      });
    },
  };
}
