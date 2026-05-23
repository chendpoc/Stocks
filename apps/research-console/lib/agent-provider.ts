import type {
  AgentChatMessage,
  AgentToolCall,
  AgentToolDefinition,
  AgentProviderMode,
  AgentToolPolicyDecision,
  AgentToolTrace,
  OpportunityReasoningResult,
  ResearchContextSummary,
} from "@stock-summary/summary-core";
import type { ResearchToolName } from "./agent-tools";
import {
  buildOpportunityReasoning,
  buildReasoningInputFromResearchContext,
} from "./opportunity-reasoning";

export type ResearchAgentProvider = {
  mode: AgentProviderMode;
  selectToolPlan(input: {
    day: string;
    message: string;
    messages?: AgentChatMessage[];
    context?: ResearchContextSummary;
    opportunityReasoning?: OpportunityReasoningResult;
    toolTrace?: AgentToolTrace[];
    policyDecisions?: AgentToolPolicyDecision[];
    conversationSummary?: string;
    round?: number;
  }): Array<string | AgentToolCall> | Promise<Array<string | AgentToolCall>>;
  generateResponse(input: {
    day: string;
    message: string;
    messages?: AgentChatMessage[];
    context: ResearchContextSummary;
    opportunityReasoning?: OpportunityReasoningResult;
    toolTrace: AgentToolTrace[];
    policyDecisions: AgentToolPolicyDecision[];
    conversationSummary: string;
  }): Promise<{
    answer: string;
    reasoning_summary: string[];
    next_watch_plan: string[];
    provider_status: "ready" | "fallback" | "error";
  }>;
};

const DIGEST_LIMIT = 3;
const DIGEST_TEXT_LIMIT = 180;

function safeDigestText(value: string | undefined) {
  const text = (value ?? "")
    .replace(/\s+/g, " ")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .trim();
  if (text.length <= DIGEST_TEXT_LIMIT) return text;
  return `${text.slice(0, DIGEST_TEXT_LIMIT - 1)}…`;
}

function buildEvidenceDigest(toolTrace: AgentToolTrace[]) {
  if (!toolTrace.length) {
    return "- 未执行外部或额外工具；本次仅依据本地日报、机会观察与管理员重点标的。";
  }

  return toolTrace
    .slice(0, DIGEST_LIMIT)
    .map((tool) => `- ${tool.name}: ${safeDigestText(tool.result_summary) || "已执行，结果为空"}`)
    .join("\n");
}

function buildBlockedPolicyDigest(policyDecisions: AgentToolPolicyDecision[]) {
  const blocked = policyDecisions.filter((decision) => decision.status === "blocked");
  if (!blocked.length) return "";

  return blocked
    .slice(0, DIGEST_LIMIT)
    .map((decision) => `- ${decision.name}: ${safeDigestText(decision.reason) || "策略未放行"}`)
    .join("\n");
}

function buildLocalResponse(input: {
  message: string;
  context: ResearchContextSummary;
  opportunityReasoning?: OpportunityReasoningResult;
  toolTrace: AgentToolTrace[];
  policyDecisions: AgentToolPolicyDecision[];
  conversationSummary: string;
}) {
  const opportunityReasoning =
    input.opportunityReasoning ??
    buildOpportunityReasoning(buildReasoningInputFromResearchContext(input.context));
  const theory =
    opportunityReasoning.adminTheory.summary ??
    input.context.adminCore[0] ??
    input.context.eventSummary[0] ??
    "当前上下文尚未形成明确核心理论。";
  const risk =
    opportunityReasoning.invalidationPlan[0] ??
    input.context.risks[0] ??
    "如果价格、时间窗口和资金承接不一致，则机会观察失效。";
  const candidate =
    opportunityReasoning.candidateOpportunities[0]?.symbol ??
    input.context.adminSymbols[0] ??
    "暂无明确管理员重点标的";
  const marketNeed =
    opportunityReasoning.marketIntelNeeds[0] ??
    "先补齐行情、成交量、新闻与官方信息，再调整观察置信度。";
  const nextCheck =
    opportunityReasoning.nextChecks[0] ??
    "复核本地总结、机会观察与风险条件。";
  const evidenceDigest = buildEvidenceDigest(input.toolTrace);
  const blockedPolicyDigest = buildBlockedPolicyDigest(input.policyDecisions);

  return {
    answer:
      `结论：当前优先线索是 ${candidate}。针对「${input.message || "请解释当前机会观察"}」，先用核心理论校准，再看触发条件，最后找反证。` +
      `\n\n证据：\n证据摘要：\n${evidenceDigest}` +
      (blockedPolicyDigest ? `\n策略阻断：\n${blockedPolicyDigest}` : "") +
      `\n\n反证：${risk}` +
      `\n\n下一步观察：\n- ${nextCheck}\n- ${marketNeed}` +
      `\n\n研究边界：这是一份机会观察，不是交易指令；需要等触发条件、行情验证和反证检查同时支持后，才能提高关注优先级。`,
    reasoning_summary: [
      `多轮上下文：${input.conversationSummary}`,
      `核心理论：${theory}`,
      `候选观察：${candidate}`,
      `市场情报需求：${marketNeed}`,
      `工具证据：${input.toolTrace.map((tool) => `${tool.name} => ${tool.result_summary}`).join("；")}`,
      `主要反证：${risk}`,
    ],
    next_watch_plan: [
      nextCheck,
      "先确认管理员重点标的是否进入机会观察定义的价格或时间窗口。",
      "再检查走势是否符合核心理论中的资金节奏，而不是普通用户讨论热度。",
      "最后用风险条件做反证；反证更强时，取消观察，不升级成交易动作。",
    ],
  };
}

const DEFAULT_LOCAL_TOOL_PLAN: ResearchToolName[] = [
  "load_structured_summary",
  "load_opportunity_observation",
  "extract_watchlist",
  "score_opportunities",
];

const MARKET_VALIDATION_PATTERN =
  /\b(market validation|quote|quotes|price|prices|volume|volumes|latest price|latest quote)\b|行情|报价|最新价|价格|成交量|验证/i;

const HISTORY_VALIDATION_PATTERN =
  /\b(history|historical|trend|trends|drawdown|drawdowns|volatility|volatile|volume expansion|momentum history)\b|鍘嗗彶|瓒嬪娍|鍥炴挙|娉㈠姩|閲忚兘|鏀鹃噺|鎵挎帴/i;

const BROAD_EVIDENCE_REFRESH_PATTERN =
  /\b(all missing evidence|missing evidence|evidence refresh|refresh evidence|refresh all|evidence needs)\b|补齐.*证据|刷新.*证据|证据.*补齐/i;

const NEWS_EVIDENCE_PATTERN = /\b(news|headline|headlines|market news)\b|新闻|消息/i;
const FUNDAMENTAL_EVIDENCE_PATTERN =
  /\b(fundamental|fundamentals|earnings|filing|filings|guidance|margin|capex|orders)\b|基本面|财报|指引|订单|利润率/i;

const TICKER_STOP_WORDS = new Set([
  "A",
  "AI",
  "API",
  "CFO",
  "CEO",
  "ETF",
  "JSON",
  "LLM",
  "NAV",
  "NYSE",
  "NASDAQ",
  "OTC",
  "SEC",
  "USD",
]);

function normalizeTicker(value: string | undefined) {
  const symbol = (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "");
  if (!symbol || TICKER_STOP_WORDS.has(symbol)) return "";
  return symbol;
}

function firstTickerFromText(text: string | undefined) {
  const matches = (text ?? "").match(/\b[A-Z][A-Z0-9.\-]{0,5}\b/g) ?? [];
  return matches.map(normalizeTicker).find(Boolean) ?? "";
}

function firstAdminSymbol(context: ResearchContextSummary | undefined) {
  for (const item of context?.adminSymbols ?? []) {
    const symbol = firstTickerFromText(item);
    if (symbol) return symbol;
  }
  return "";
}

function wantsMarketValidation(input?: {
  message?: string;
  conversationSummary?: string;
}) {
  const text = [input?.message, input?.conversationSummary].filter(Boolean).join(" ");
  return MARKET_VALIDATION_PATTERN.test(text);
}

function wantsHistoryValidation(input?: {
  message?: string;
  conversationSummary?: string;
}) {
  const text = [input?.message, input?.conversationSummary].filter(Boolean).join(" ");
  return HISTORY_VALIDATION_PATTERN.test(text);
}

function historyPeriodFromText(text: string | undefined) {
  const match = (text ?? "").toLowerCase().match(/\b(\d+d|\d+mo|\d+y|ytd|max)\b/);
  return match?.[1] ?? "30d";
}

function requestedEvidenceKinds(input?: {
  message?: string;
  conversationSummary?: string;
}) {
  const text = [input?.message, input?.conversationSummary].filter(Boolean).join(" ");
  if (BROAD_EVIDENCE_REFRESH_PATTERN.test(text)) {
    return new Set(["quote", "history", "news", "fundamental"]);
  }

  const kinds = new Set<string>();
  if (wantsMarketValidation(input)) kinds.add("quote");
  if (wantsHistoryValidation(input)) kinds.add("history");
  if (NEWS_EVIDENCE_PATTERN.test(text)) kinds.add("news");
  if (FUNDAMENTAL_EVIDENCE_PATTERN.test(text)) kinds.add("fundamental");
  return kinds;
}

function preferredEvidenceTool(
  preferredTools: string[],
  fallbackTools: ResearchToolName[],
) {
  const fallbackSet = new Set(fallbackTools);
  return preferredTools.find((tool): tool is ResearchToolName => fallbackSet.has(tool as ResearchToolName))
    ?? fallbackTools[0];
}

function evidenceToolCall(
  need: OpportunityReasoningResult["evidenceNeeds"][number],
  period: string,
): AgentToolCall | undefined {
  if (!need.symbol || need.symbol === "GENERAL") return undefined;

  if (need.kind === "quote") {
    return {
      name: preferredEvidenceTool(need.preferredTools, [
        "yfinance_quote",
        "longbridge_quote",
        "alpha_vantage_quote",
      ]),
      input: { symbol: need.symbol },
    };
  }

  if (need.kind === "history") {
    return {
      name: preferredEvidenceTool(need.preferredTools, ["yfinance_history"]),
      input: { symbol: need.symbol, period },
    };
  }

  if (need.kind === "news") {
    return {
      name: preferredEvidenceTool(need.preferredTools, ["news_search"]),
      input: { query: `${need.symbol} recent market news` },
    };
  }

  if (need.kind === "fundamental") {
    return {
      name: preferredEvidenceTool(need.preferredTools, ["news_search"]),
      input: { query: `${need.symbol} earnings guidance filings` },
    };
  }

  return undefined;
}

function toolCallsFromEvidenceNeeds(input?: {
  message?: string;
  conversationSummary?: string;
  opportunityReasoning?: OpportunityReasoningResult;
}) {
  const kinds = requestedEvidenceKinds(input);
  const evidenceNeeds = input?.opportunityReasoning?.evidenceNeeds ?? [];
  if (!kinds.size || !evidenceNeeds.length) return [];

  const explicitSymbol = firstTickerFromText(input?.message);
  const targetSymbol = explicitSymbol || normalizeTicker(
    evidenceNeeds.find((need) => need.symbol !== "GENERAL")?.symbol,
  );
  if (!targetSymbol) return [];

  const period = historyPeriodFromText(input?.message);
  const seenKinds = new Set<string>();
  const calls: AgentToolCall[] = [];

  for (const need of evidenceNeeds) {
    if (!kinds.has(need.kind)) continue;
    if (normalizeTicker(need.symbol) !== targetSymbol) continue;
    if (seenKinds.has(need.kind)) continue;

    const call = evidenceToolCall({ ...need, symbol: targetSymbol }, period);
    if (call) {
      calls.push(call);
      seenKinds.add(need.kind);
    }
  }

  return calls;
}

function appendUniquePlanItems(
  plan: Array<ResearchToolName | AgentToolCall>,
  items: AgentToolCall[],
) {
  const seen = new Set(plan.map((item) => JSON.stringify(typeof item === "string" ? { name: item, input: {} } : item)));
  for (const item of items) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    plan.push(item);
  }
}

function defaultToolPlan(input?: {
  round?: number;
  message?: string;
  conversationSummary?: string;
  context?: ResearchContextSummary;
  opportunityReasoning?: OpportunityReasoningResult;
}): Array<ResearchToolName | AgentToolCall> {
  if ((input?.round ?? 0) > 0) return [];

  const plan: Array<ResearchToolName | AgentToolCall> = [...DEFAULT_LOCAL_TOOL_PLAN];
  const evidencePlan = toolCallsFromEvidenceNeeds(input);
  if (evidencePlan.length) {
    appendUniquePlanItems(plan, evidencePlan);
    return plan;
  }

  if (wantsMarketValidation(input)) {
    const symbol = firstTickerFromText(input?.message) || firstAdminSymbol(input?.context);
    plan.push({ name: "yfinance_quote", input: symbol ? { symbol } : {} });
  }
  if (wantsHistoryValidation(input)) {
    const symbol = firstTickerFromText(input?.message) || firstAdminSymbol(input?.context);
    const period = historyPeriodFromText(input?.message);
    plan.push({ name: "yfinance_history", input: symbol ? { symbol, period } : { period } });
  }

  return plan;
}

const MODEL_PLANNING_TOOLS: AgentToolDefinition[] = [
  {
    name: "score_opportunities",
    description:
      "Score local admin watchlist symbols against the loaded summary context. Use after local context is available when ranked non-actionable opportunity observations are needed.",
    input_schema: { symbol: "optional ticker symbol" },
    source: "local",
    enabled: true,
  },
  {
    name: "alpha_vantage_quote",
    description: "Fetch a latest Alpha Vantage global quote for a ticker when price context is needed.",
    input_schema: { symbol: "string" },
    source: "external",
    enabled: true,
  },
  {
    name: "longbridge_quote",
    description:
      "Fetch a latest Longbridge quote for a ticker when market status, price, change, and volume context are needed. Use for evidence gathering only; policy may block it unless external tools and server-side Longbridge credentials are configured.",
    input_schema: { symbol: "string" },
    source: "external",
    enabled: true,
  },
  {
    name: "yfinance_quote",
    description:
      "Fetch a latest quote through local Python yfinance when price, volume, and exchange context are needed. Use for evidence gathering only; policy may block it unless external tools are explicitly enabled.",
    input_schema: { symbol: "string" },
    source: "external",
    enabled: true,
  },
  {
    name: "yfinance_history",
    description:
      "Fetch bounded historical trend, drawdown, volatility, and volume metrics through local Python yfinance. Use for evidence gathering only; it is not a trading signal and policy may block it unless external tools are explicitly enabled.",
    input_schema: { symbol: "string", period: "optional yfinance period, default 30d" },
    source: "external",
    enabled: true,
  },
  {
    name: "news_search",
    description:
      "Search recent market news for a specific ticker, company, or market event when external news evidence is needed. Use only for evidence gathering; policy may block it unless external tools are explicitly enabled.",
    input_schema: { query: "specific ticker, company, or event query" },
    source: "external",
    enabled: true,
  },
];

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function openAiToolDefinitions() {
  return MODEL_PLANNING_TOOLS.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(tool.input_schema).map(([key, description]) => [
            key,
            { type: "string", description },
          ]),
        ),
        required: Object.keys(tool.input_schema),
      },
    },
  }));
}

function parseToolArguments(raw: unknown): Record<string, string> {
  if (typeof raw !== "string" || !raw.trim()) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)]),
    );
  } catch {
    return {};
  }
}

function parseOpenAICompatibleToolCalls(payload: unknown): AgentToolCall[] {
  if (!payload || typeof payload !== "object") return [];
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return [];
  const first = choices[0] as { message?: { tool_calls?: unknown } } | undefined;
  const toolCalls = first?.message?.tool_calls;
  if (!Array.isArray(toolCalls)) return [];

  return toolCalls.flatMap((toolCall) => {
    const fn = (toolCall as { function?: { name?: unknown; arguments?: unknown } })?.function;
    if (!fn || typeof fn.name !== "string" || !fn.name.trim()) return [];
    return [{ name: fn.name.trim(), input: parseToolArguments(fn.arguments) }];
  });
}

function formatEvidenceNeedsForPrompt(reasoning: OpportunityReasoningResult | undefined) {
  return (reasoning?.evidenceNeeds ?? [])
    .slice(0, 12)
    .map((need) =>
      `${need.kind} ${need.symbol}: ${need.question}; tools=${need.preferredTools.join(",")}; required=${need.required}`,
    )
    .join(" / ");
}

function formatResearchPlanForPrompt(reasoning: OpportunityReasoningResult | undefined) {
  return (reasoning?.researchPlan ?? [])
    .slice(0, 5)
    .map((step) =>
      `${step.stage}: ${step.title}; question=${step.question}; method=${step.method}; output=${step.expectedOutput}; tools=${step.toolHints.join(",")}`,
    )
    .join(" / ");
}

function buildPrompt(input: {
  day: string;
  message: string;
  messages?: AgentChatMessage[];
  context: ResearchContextSummary;
  opportunityReasoning?: OpportunityReasoningResult;
  toolTrace: AgentToolTrace[];
  policyDecisions: AgentToolPolicyDecision[];
  conversationSummary: string;
}) {
  return [
    `日期：${input.day}`,
    `用户问题：${input.message}`,
    `多轮上下文：${input.conversationSummary}`,
    `三句话总结：${input.context.eventSummary.join(" / ")}`,
    `核心理论：${input.context.adminCore.join(" / ")}`,
    `管理员重点标的：${input.context.adminSymbols.join(" / ")}`,
    `风险条件：${input.context.risks.join(" / ")}`,
    `推演摘要：${input.opportunityReasoning?.reasoningSummary.join(" / ") ?? ""}`,
    `候选观察：${input.opportunityReasoning?.candidateOpportunities.map((item) => `${item.symbol}: ${item.thesis}`).join(" / ") ?? ""}`,
    `Market intel needs: ${input.opportunityReasoning?.marketIntelNeeds.join(" / ") ?? ""}`,
    `Research plan: ${formatResearchPlanForPrompt(input.opportunityReasoning)}`,
    `Evidence needs: ${formatEvidenceNeedsForPrompt(input.opportunityReasoning)}`,
    `Invalidation plan: ${input.opportunityReasoning?.invalidationPlan.join(" / ") ?? ""}`,
    `Next checks: ${input.opportunityReasoning?.nextChecks.join(" / ") ?? ""}`,
    `工具调用：${input.toolTrace.map((tool) => `${tool.name}: ${tool.result_summary}`).join(" / ")}`,
    `工具策略：${input.policyDecisions.map((decision) => `${decision.name}: ${decision.status}`).join(" / ")}`,
    "输出必须使用固定结构：结论 / 证据 / 反证 / 下一步观察 / 研究边界。请用中文输出，不要给确定性买卖指令。",
  ].join("\n");
}

function parseOpenAICompatibleContent(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return "";
  const first = choices[0] as { message?: { content?: unknown } } | undefined;
  return typeof first?.message?.content === "string" ? first.message.content.trim() : "";
}

function createLocalProvider(): ResearchAgentProvider {
  return {
    mode: "local-deterministic",
    selectToolPlan: defaultToolPlan,
    async generateResponse(input) {
      return {
        ...buildLocalResponse(input),
        provider_status: "ready",
      };
    },
  };
}

function createOpenAICompatibleProvider(): ResearchAgentProvider {
  return {
    mode: "openai-compatible",
    async selectToolPlan(input) {
      const apiKey = process.env.AGENT_API_KEY;
      const baseUrl = process.env.AGENT_API_BASE_URL;
      const model = process.env.AGENT_MODEL;

      if (!apiKey || !baseUrl || !model) return defaultToolPlan(input);

      try {
        const response = await fetch(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            tool_choice: "auto",
            tools: openAiToolDefinitions(),
            messages: [
              {
                role: "system",
                content:
                  "You are planning research tool calls. Return tool_calls only when a tool is needed. Never include credentials. For news_search, use a narrow query that includes a ticker, company name, or concrete market event.",
              },
              {
                role: "user",
                content: buildPrompt({
                  ...input,
                  context: input.context ?? {
                    day: input.day,
                    eventSummary: [],
                    overview: [],
                    adminCore: [],
                    adminSymbols: [],
                    risks: [],
                  },
                  toolTrace: input.toolTrace ?? [],
                  policyDecisions: input.policyDecisions ?? [],
                  conversationSummary: input.conversationSummary ?? "",
                }),
              },
            ],
          }),
          signal: AbortSignal.timeout(20_000),
        });

        if (!response.ok) return defaultToolPlan(input);
        const toolCalls = parseOpenAICompatibleToolCalls(await response.json());
        return toolCalls.length ? toolCalls : defaultToolPlan(input);
      } catch {
        return defaultToolPlan(input);
      }
    },
    async generateResponse(input) {
      const apiKey = process.env.AGENT_API_KEY;
      const baseUrl = process.env.AGENT_API_BASE_URL;
      const model = process.env.AGENT_MODEL;

      if (!apiKey || !baseUrl || !model) {
        return {
          ...buildLocalResponse(input),
          provider_status: "fallback",
        };
      }

      try {
        const response = await fetch(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            messages: [
              {
                role: "system",
                content: "你是交易研究助手。基于给定上下文做研究观察，不输出确定性买卖指令。",
              },
              {
                role: "user",
                content: buildPrompt(input),
              },
            ],
          }),
          signal: AbortSignal.timeout(20_000),
        });

        if (!response.ok) {
          return {
            ...buildLocalResponse(input),
            provider_status: "error",
          };
        }

        const content = parseOpenAICompatibleContent(await response.json());
        if (!content) {
          return {
            ...buildLocalResponse(input),
            provider_status: "error",
          };
        }

        return {
          answer: content,
          reasoning_summary: [
            `模型：${model}`,
            `工具证据：${input.toolTrace.map((tool) => `${tool.name} => ${tool.result_summary}`).join("；")}`,
            `策略边界：不输出确定性买卖指令；外部行情工具仍需单独授权。`,
          ],
          next_watch_plan: [
            "按模型回答中的触发条件建立观察清单。",
            "对照管理员重点标的和风险条件做反证。",
            "若需要实时行情或新闻，再显式启用对应外部工具。",
          ],
          provider_status: "ready",
        };
      } catch {
        return {
          ...buildLocalResponse(input),
          provider_status: "error",
        };
      }
    },
  };
}

export function createResearchAgentProvider(): ResearchAgentProvider {
  const requestedProvider = process.env.AGENT_PROVIDER || "local-deterministic";

  if (requestedProvider === "openai-compatible") {
    return createOpenAICompatibleProvider();
  }

  return createLocalProvider();
}
