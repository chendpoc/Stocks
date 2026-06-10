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

export type DecisionLlmAnalysisSummary = {
  evidence_text?: string;
  contra_text?: string;
  confidence_contribution?: number;
  risk_flags?: string[];
};

export interface DecisionGenerationInput {
  symbol: string;
  /** ISO UTC timestamp aligned with the context snapshot `asof_ts`. */
  asof_ts: string;
  contextItems: WeightedContextItem[];
  /** Mid-day evidence / contra chain from DecisionGraph LLM nodes (§3-4). */
  llmAnalysis?: DecisionLlmAnalysisSummary;
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
  if (!/\/v\d+(\/|$)/.test(base) && /deepseek\.com/i.test(base)) {
    base = `${base}/v1`;
  }
  return base;
}

type ChatCompletionPayload = {
  choices?: Array<{
    finish_reason?: string;
    message?: Record<string, unknown>;
  }>;
  error?: { message?: string };
};

function pickNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function textFromMessageContent(content: unknown): string | undefined {
  const direct = pickNonEmptyString(content);
  if (direct) {
    return direct;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  const joined = content
    .map((part) => {
      if (typeof part !== "object" || part === null) {
        return "";
      }
      const record = part as Record<string, unknown>;
      if (record.type === "text" && typeof record.text === "string") {
        return record.text;
      }
      return "";
    })
    .join("");
  return pickNonEmptyString(joined);
}

/** OpenAI-compatible completion text (DeepSeek V4 may use reasoning_content). */
export function extractChatCompletionMessageText(
  payload: ChatCompletionPayload,
): string {
  const choice = payload.choices?.[0];
  const message = choice?.message;
  if (!message) {
    const apiError = payload.error?.message;
    throw new Error(
      apiError
        ? `LLM provider returned no message: ${apiError}`
        : "LLM provider returned no choices[0].message",
    );
  }

  const fromContent = textFromMessageContent(message.content);
  if (fromContent) {
    return fromContent;
  }

  const fromReasoning =
    pickNonEmptyString(message.reasoning_content) ??
    pickNonEmptyString(message.reasoning);
  if (fromReasoning) {
    return fromReasoning;
  }

  const refusal = pickNonEmptyString(message.refusal);
  if (refusal) {
    throw new Error(`LLM provider refused: ${refusal}`);
  }

  const finish = choice.finish_reason ?? "unknown";
  throw new Error(
    `LLM provider returned empty content (finish_reason=${finish})`,
  );
}

function buildChatCompletionBody(
  model: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: 8192,
  };
  if (/deepseek-v4/i.test(model) && process.env.DECISION_LLM_THINKING !== "1") {
    body.thinking = { type: "disabled" };
  }
  return body;
}

async function postChatCompletion(
  baseUrl: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<ChatCompletionPayload> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`LLM provider ${response.status}: ${raw}`);
  }

  try {
    return JSON.parse(raw) as ChatCompletionPayload;
  } catch {
    throw new Error(`LLM provider returned non-JSON body: ${raw.slice(0, 400)}`);
  }
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
  "WATCH: watch_condition one line: 观察周期=<daily|multi-day> | 条件=<testable condition>",
  "WAIT_TRIGGER: trigger + invalidation",
  "PAPER_ENTER_CANDIDATE: trigger + invalidation + target_plan",
  "PAPER_EXIT_CANDIDATE: exit_rationale + (invalidation or hold_condition)",
  "INVALIDATE: invalidation",
].join("\n");

const DEFAULT_DECISION_PROMPT_TZ = "Asia/Shanghai";
const FALLBACK_DECISION_PROMPT_TZ = "America/New_York";

function isValidIanaTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

function resolvePromptTimeZone(): string {
  const fromEnv = process.env.DECISION_PROMPT_TZ ?? process.env.TZ;
  const candidate = fromEnv?.trim();
  if (candidate && isValidIanaTimeZone(candidate)) {
    return candidate;
  }
  return DEFAULT_DECISION_PROMPT_TZ;
}

function formatDecisionLocal(ms: number, timeZone: string): string | null {
  try {
    const local = new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(ms));
    return `${local} (${timeZone})`;
  } catch {
    return null;
  }
}

/** Active DecisionGraph thesis prompt style (operator / default runtime). */
export const DECISION_THESIS_PROMPT_STYLE_ACTIVE = "structured" as const;

export type DecisionThesisPromptStyle = "structured" | "paragraph";

/**
 * v0 paragraph thesis guide — retained for rollback / experiments; not active by default.
 * Not surfaced in CLI or Studio; switch only via DECISION_THESIS_PROMPT=v0_paragraph.
 */
export const DECISION_THESIS_PROMPT_GUIDE_PARAGRAPH = [
  "thesis: 一段中文结论（1-3句，\\n 不换行）；连贯叙述矛盾、结构与关注点。",
  "数字仅来自 context；勿 markdown / 勿列表 / 勿「时点：」等标签行。",
  "示例语气：「标的持续相对基准跑输，但趋势偏离与回踩结构矛盾，需监控相对强弱与关键支撑。」",
].join("\n");

export const DECISION_THESIS_SYSTEM_MESSAGE_PARAGRAPH =
  "You are a market decision assistant. Output one JSON object only with snake_case field names. thesis must be one short Chinese paragraph (1-3 sentences), no markdown.";

export const DECISION_THESIS_SYSTEM_MESSAGE_STRUCTURED =
  "You are a market decision assistant. Output one JSON object only with snake_case field names. thesis must use the fixed Chinese line labels (时点/周期/事实/判断/风险); keep each line short.";

function resolveDecisionThesisPromptStyle(): DecisionThesisPromptStyle {
  const raw = process.env.DECISION_THESIS_PROMPT?.trim().toLowerCase();
  if (
    raw === "v0_paragraph" ||
    raw === "paragraph" ||
    raw === "legacy" ||
    raw === "v0"
  ) {
    return "paragraph";
  }
  return DECISION_THESIS_PROMPT_STYLE_ACTIVE;
}

/** Local decision clock for prompts (no UTC suffix). Default CN; format fallback US. */
export function formatDecisionAsOfForPrompt(isoUtc: string): string {
  const ms = Date.parse(isoUtc);
  if (!Number.isFinite(ms)) {
    return isoUtc;
  }
  const primaryTz = resolvePromptTimeZone();
  return (
    formatDecisionLocal(ms, primaryTz) ??
    formatDecisionLocal(ms, FALLBACK_DECISION_PROMPT_TZ) ??
    isoUtc
  );
}

function buildDecisionPromptGuideStructured(input: DecisionGenerationInput): string {
  const asofLine = formatDecisionAsOfForPrompt(input.asof_ts);
  return [
    `决策时点（本地优先）：${asofLine}`,
    "数据尺度：market_bar=日K最新收盘；signals/events=近日窗口。无 context 写明5m/分时/盘中时，禁止缩量/放量/盘中话术。",
    "周期标签：daily=日K价格；multi-day=信号/事件/lesson；mixed=仅当 context 明确多尺度。",
    "thesis 固定4-5行（\\n分隔，无 markdown）：时点、周期、事实、判断共4行；风险可选第5行",
    `时点：${asofLine}`,
    "周期：daily|multi-day|mixed",
    "事实：<一行；数字仅来自 context；价格注明日K/信号/事件>",
    "判断：<一行>",
    "风险：<一行；无则省略整行，勿写「无」>",
  ].join("\n");
}

function buildDecisionPromptGuide(
  input: DecisionGenerationInput,
  style: DecisionThesisPromptStyle = resolveDecisionThesisPromptStyle(),
): string {
  if (style === "paragraph") {
    return DECISION_THESIS_PROMPT_GUIDE_PARAGRAPH;
  }
  return buildDecisionPromptGuideStructured(input);
}

export function buildDecisionSystemMessage(
  style: DecisionThesisPromptStyle = resolveDecisionThesisPromptStyle(),
): string {
  return style === "paragraph"
    ? DECISION_THESIS_SYSTEM_MESSAGE_PARAGRAPH
    : DECISION_THESIS_SYSTEM_MESSAGE_STRUCTURED;
}

/** @internal Exported for tests. */
export function buildDecisionPrompt(
  input: DecisionGenerationInput,
  repairHint?: string,
  style: DecisionThesisPromptStyle = resolveDecisionThesisPromptStyle(),
): string {
  const topItems = [...input.contextItems]
    .sort((a, b) => b.composite_weight - a.composite_weight)
    .slice(0, 12)
    .map((item) => ({
      source_type: item.source_type,
      summary: item.summary,
      evidence_ref: item.evidence_ref,
      composite_weight: item.composite_weight,
    }));

  const llmAnalysis = input.llmAnalysis;
  const analysisBlock =
    llmAnalysis &&
      (llmAnalysis.evidence_text ||
        llmAnalysis.contra_text ||
        llmAnalysis.confidence_contribution !== undefined)
      ? [
        "LLM evidence / contra analysis (must inform action and confidence):",
        JSON.stringify({
          evidence_text: llmAnalysis.evidence_text,
          contra_text: llmAnalysis.contra_text,
          confidence_contribution: llmAnalysis.confidence_contribution,
          risk_flags: llmAnalysis.risk_flags ?? [],
        }),
        llmAnalysis.confidence_contribution !== undefined
          ? `Cap confidence at or below confidence_contribution=${llmAnalysis.confidence_contribution}.`
          : "",
      ]
        .filter((line) => line.length > 0)
        .join("\n")
      : "";

  return [
    "Return strict JSON only for a trading DecisionEnvelope.",
    `Symbol: ${input.symbol}`,
    "Allowed actions: NO_TRADE, WATCH, WAIT_TRIGGER, PAPER_ENTER_CANDIDATE, PAPER_EXIT_CANDIDATE, INVALIDATE.",
    "Required: symbol, action, thesis, confidence (0-1). Optional: uncertainty (0-1).",
    buildDecisionPromptGuide(input, style),
    "Action-specific fields:",
    DECISION_ACTION_REQUIREMENTS,
    repairHint ? `Fix prior validation error: ${repairHint}` : "",
    analysisBlock,
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
  systemMessage: string,
): Promise<unknown> {
  const messages = [
    { role: "system", content: systemMessage },
    { role: "user", content: prompt },
  ];
  const body = buildChatCompletionBody(model, messages, 0.2);

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const payload = await postChatCompletion(baseUrl, apiKey, body);
      const text = extractChatCompletionMessageText(payload);
      return extractJsonObject(text);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const retryable =
        lastError.message.includes("empty content") ||
        lastError.message.includes("no choices");
      if (!retryable || attempt === 1) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error("LLM provider call failed");
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
        const style = resolveDecisionThesisPromptStyle();
        const prompt = buildDecisionPrompt(input, repairHint, style);
        const parsed = await callDecisionLlm(
          baseUrl,
          apiKey,
          model,
          prompt,
          buildDecisionSystemMessage(style),
        );
        try {
          let envelope = parseDecisionEnvelope(parsed);
          if (envelope.symbol !== symbol) {
            throw new Error(
              `DecisionEnvelope symbol mismatch: expected ${symbol}, got ${envelope.symbol}`,
            );
          }
          const cap = input.llmAnalysis?.confidence_contribution;
          if (cap !== undefined && cap >= 0 && cap <= 1) {
            envelope = {
              ...envelope,
              confidence: Math.min(envelope.confidence, cap),
            };
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

      const insightBody = buildChatCompletionBody(
        model,
        [
          {
            role: "system",
            content:
              "You explore market mechanisms and output one JSON InsightCandidate proposal only. Never trade or promote lessons.",
          },
          { role: "user", content: prompt },
        ],
        0.3,
      );
      const payload = await postChatCompletion(baseUrl, apiKey, insightBody);
      const content = extractChatCompletionMessageText(payload);

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
