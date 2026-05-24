import type {
  AdminStrategyRuleMatch,
  EvidenceNeed,
  OpportunityReasoningResult,
  ResearchContextSummary,
  ResearchPlanStep,
} from "@stock-summary/summary-core";
import { selectAdminStrategyRules } from "./admin-strategy-rulebook";
import { symbolsFromResearchContext } from "./opportunity-scoring";

export type OpportunityReasoningInput = {
  summary?: {
    day?: string;
    overview?: string[];
    eventSummary?: string[];
    risks?: string[];
  };
  opportunity?: {
    title?: string;
    symbols?: string[];
    hypothesis?: string;
    supportingEvidence?: string[];
    contradictingEvidence?: string[];
    trigger?: string[];
    invalidation?: string[];
    watchPlan?: string[];
  };
  context?: {
    adminCore?: string[];
    adminSymbols?: string[];
    notes?: string[];
  };
};

const RESEARCH_ONLY_NOTICE = "研究观察，不是交易指令";

function cleanText(value: string | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function cleanList(values: string[] | undefined) {
  return (values ?? []).map(cleanText).filter(Boolean);
}

function unique(values: string[]) {
  return values.filter((value, index, all) => all.indexOf(value) === index);
}

function compactList(values: string[] | undefined, maxItems: number, maxLength: number) {
  return cleanList(values)
    .slice(0, maxItems)
    .map((value) => value.slice(0, maxLength));
}

function normalizeSymbol(value: string) {
  return cleanText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "");
}

function symbolsFromInput(input: OpportunityReasoningInput) {
  const directSymbols = unique(cleanList(input.opportunity?.symbols).map(normalizeSymbol).filter(Boolean));
  if (directSymbols.length) return directSymbols;

  const adminSymbols = cleanList(input.context?.adminSymbols)
    .flatMap((item) => item.match(/[A-Z]{1,6}(?:[.\-][A-Z])?/g) ?? [])
    .map(normalizeSymbol)
    .filter((symbol) => symbol.length >= 2);
  return unique(adminSymbols.filter(Boolean));
}

function fallbackList(values: string[], fallback: string) {
  return values.length ? values : [fallback];
}

function firstSentence(values: string[], fallback: string) {
  return values[0] ?? fallback;
}

function buildSourceScope(input: OpportunityReasoningInput) {
  return [
    input.summary ? "local summary object" : "",
    input.opportunity ? "local opportunity object" : "",
    input.context ? "local research context object" : "",
  ].filter(Boolean);
}

function buildAdminTheory(input: OpportunityReasoningInput, matchedAdminRules: AdminStrategyRuleMatch[]) {
  const adminCore = cleanList(input.context?.adminCore);
  const overview = cleanList(input.summary?.overview);
  const hypothesis = cleanText(input.opportunity?.hypothesis);
  const risks = [
    ...cleanList(input.summary?.risks),
    ...cleanList(input.opportunity?.contradictingEvidence),
  ];

  return {
    summary: `${firstSentence(
      [hypothesis, ...adminCore, ...overview].filter(Boolean),
      "尚未形成明确机会假设，需要先补齐管理员理论、事件背景和标的线索。",
    )} (${RESEARCH_ONLY_NOTICE}).`,
    supportingPoints: fallbackList(
      [
        ...matchedAdminRules.map((rule) => `规则 ${rule.ruleId}: ${rule.title}`),
        ...adminCore,
        ...overview,
        ...cleanList(input.opportunity?.supportingEvidence),
      ],
      "当前支撑证据不足，需先从本地总结、管理员观点和事件背景中补齐证据链。",
    ),
    openRisks: fallbackList(risks, "风险条件尚不完整，需要先明确哪些事实会让该观察失效。"),
  };
}

function buildMarketIntelNeeds(input: OpportunityReasoningInput) {
  const symbols = symbolsFromInput(input);
  const triggers = cleanList(input.opportunity?.trigger);
  const needs = [
    ...symbols.map((symbol) => `${symbol}: 核验最新价格行为、流动性、公告/财报和官方信息。`),
    ...triggers.map((trigger) => `触发条件核验：${trigger}`),
    "在提高观察优先级前，先把最新市场数据与管理员核心理论逐项对照。",
  ];
  return unique(needs);
}

function buildEvidenceNeeds(input: OpportunityReasoningInput): EvidenceNeed[] {
  const symbols = fallbackList(symbolsFromInput(input), "GENERAL");

  return symbols.flatMap((symbol) => [
    {
      kind: "quote",
      symbol,
      question: `${symbol}: 核验最新价格、涨跌幅、交易状态、成交量和流动性背景，证据不足时不能提高置信度。`,
      preferredTools: ["yfinance_quote", "alpha_vantage_quote", "longbridge_quote"],
      required: true,
    },
    {
      kind: "history",
      symbol,
      question: `${symbol}: 对比近期趋势、回撤、波动率和成交量扩张，判断当日异动是否有历史参照。`,
      preferredTools: ["yfinance_history"],
      required: true,
    },
    {
      kind: "news",
      symbol,
      question: `${symbol}: 检查近期公司、行业和宏观新闻，寻找能支持或反驳本地假设的信息。`,
      preferredTools: ["news_search"],
      required: true,
    },
    {
      kind: "fundamental",
      symbol,
      question: `${symbol}: 复核财报表述、公告、指引、订单、资本开支、利润率或资产负债表信号。`,
      preferredTools: ["news_search", "manual_filing_review"],
      required: true,
    },
  ]);
}

function buildCandidateOpportunities(
  input: OpportunityReasoningInput,
): OpportunityReasoningResult["candidateOpportunities"] {
  const symbols = symbolsFromInput(input);
  const thesis = cleanText(input.opportunity?.hypothesis) || "机会假设尚未清晰，需要先把来源总结、管理员理论和标的线索整理成可验证命题。";
  const sourceBasis = fallbackList(
    [
      ...cleanList(input.opportunity?.supportingEvidence),
      ...cleanList(input.summary?.eventSummary),
      ...cleanList(input.summary?.overview),
    ],
    "当前来源证据不足，只能保留为低置信度研究观察，后续必须补齐行情、新闻和反证信息。",
  );
  const invalidation = fallbackList(
    [...cleanList(input.opportunity?.invalidation), ...cleanList(input.summary?.risks)],
    "需要先定义明确失效条件，例如价格、时间窗口、成交量或新闻事实与原假设不一致。",
  );

  return fallbackList(symbols, "未指定").map((symbol) => ({
    symbol,
    thesis,
    sourceBasis,
    invalidation,
    researchOnly: true,
  }));
}

function buildInvalidationPlan(input: OpportunityReasoningInput) {
  const invalidation = cleanList(input.opportunity?.invalidation);
  const risks = cleanList(input.summary?.risks);
  return fallbackList(
    [...invalidation, ...risks].map((item) => `反证核验：${item}`),
    "先建立至少一个可证伪条件，再进入 agent 推演或外部数据验证。",
  );
}

function buildNextChecks(input: OpportunityReasoningInput) {
  return fallbackList(
    [
      ...cleanList(input.opportunity?.watchPlan),
      ...cleanList(input.opportunity?.trigger).map((item) => `验证触发条件：${item}`),
    ],
    "先复核本地总结、机会观察和风险条件，再请求外部工具补证。",
  );
}

export function buildResearchPlan(
  input: OpportunityReasoningInput,
  evidenceNeeds: EvidenceNeed[],
  invalidationPlan: string[],
  nextChecks: string[],
  matchedAdminRules: AdminStrategyRuleMatch[] = [],
): ResearchPlanStep[] {
  const hypothesis = cleanText(input.opportunity?.hypothesis)
    || cleanList(input.context?.adminCore)[0]
    || cleanList(input.summary?.overview)[0]
    || "先澄清本地机会假设，再使用外部证据。";
  const symbols = fallbackList(symbolsFromInput(input), "GENERAL").slice(0, 4);
  const tools = unique(evidenceNeeds.flatMap((need) => need.preferredTools)).slice(0, 6);
  const ruleSummary = matchedAdminRules.length
    ? `命中规则：${matchedAdminRules.map((rule) => rule.ruleId).join(", ")}。`
    : "尚未命中明确规则。";

  return [
    {
      stage: "hypothesis",
      title: "整理假设",
      question: "管理员理论要成立，哪些事实必须同时为真？",
      method: `${ruleSummary}把本地线索转成可证伪的研究命题：${hypothesis}`,
      expectedOutput: "形成绑定具体标的和失效条件的有限研究假设。",
      toolHints: [],
    },
    {
      stage: "evidence",
      title: "列出证据缺口",
      question: "哪些证据缺口会阻止观察置信度上升？",
      method: `区分已有本地上下文，以及 ${symbols.join(", ")} 仍缺失的行情、历史、新闻和基本面核验。`,
      expectedOutput: "一组按优先级排序的证据缺口，且不把缺口误当成确认信号。",
      toolHints: tools,
    },
    {
      stage: "falsification",
      title: "优先寻找反证",
      question: "在观察升级前，什么事实会让该观察失效？",
      method: invalidationPlan.slice(0, 3).join(" / "),
      expectedOutput: "少量明确的取消条件和矛盾核验点。",
      toolHints: ["score_opportunities", "news_search"],
    },
    {
      stage: "data_plan",
      title: "刷新有限数据",
      question: "哪些工具或人工核验能补齐证据缺口？",
      method: "把每个证据需求映射到允许的工具；若策略阻断执行，则保留阻断原因。",
      expectedOutput: "一份带来源归因和缓存证据摘要的工具/人工核验计划。",
      toolHints: tools,
    },
    {
      stage: "synthesis",
      title: "带边界综合",
      question: "完成证据和反证核验后，只能得出什么有限结论？",
      method: fallbackList(nextChecks, "Compare refreshed evidence against the local thesis and risk boundary.").slice(0, 3).join(" / "),
      expectedOutput: "一份带置信度边界、下一步核验和非交易指令声明的研究观察。",
      toolHints: [],
    },
  ];
}

export function buildReasoningInputFromResearchContext(
  context: ResearchContextSummary,
): OpportunityReasoningInput {
  const adminCore = compactList(context.adminCore, 5, 180);
  const overview = compactList(context.overview, 4, 180);
  const eventSummary = compactList(context.eventSummary, 4, 180);
  const risks = compactList(context.risks, 5, 180);
  const symbols = symbolsFromResearchContext(context);

  return {
    summary: {
      day: context.day,
      overview,
      eventSummary,
      risks,
    },
    opportunity: {
      title: `${context.day} opportunity observation`,
      symbols,
      hypothesis:
        adminCore[0] ??
        overview[0] ??
        "机会假设尚未清晰，需要先整理管理员理论、事件背景和标的线索。",
      supportingEvidence: [...adminCore, ...eventSummary].slice(0, 6),
      contradictingEvidence: risks,
      trigger: symbols.map((symbol) => `${symbol}: wait for trigger confirmation.`),
      invalidation: risks,
      watchPlan: symbols.map(
        (symbol) => `${symbol}: compare fresh evidence against admin theory and invalidation.`,
      ),
    },
    context: {
      adminCore,
      adminSymbols: compactList(context.adminSymbols, 8, 120),
      notes: compactList(
        [context.sourceSummaryPath ?? "", context.opportunityPath ?? ""],
        2,
        160,
      ),
    },
  };
}

export function buildOpportunityReasoning(input: OpportunityReasoningInput): OpportunityReasoningResult {
  const matchedAdminRules = selectAdminStrategyRules(input);
  const adminTheory = buildAdminTheory(input, matchedAdminRules);
  const evidenceNeeds = buildEvidenceNeeds(input);
  const candidateOpportunities = buildCandidateOpportunities(input);
  const invalidationPlan = buildInvalidationPlan(input);
  const nextChecks = buildNextChecks(input);
  const researchPlan = buildResearchPlan(input, evidenceNeeds, invalidationPlan, nextChecks, matchedAdminRules);

  return {
    context: {
      day: cleanText(input.summary?.day) || "unknown",
      sourceScope: buildSourceScope(input),
      observationOnly: true,
    },
    adminTheory,
    matchedAdminRules,
    marketIntelNeeds: buildMarketIntelNeeds(input),
    evidenceNeeds,
    candidateOpportunities,
    invalidationPlan,
    nextChecks,
    researchPlan,
    reasoningSummary: [
      `仅基于本地输入生成分阶段机会推演（${RESEARCH_ONLY_NOTICE}）。`,
      `核心理论来自机会假设、总结概览和管理员观点，是研究框架，不是交易指令。`,
      `规则命中数量=${matchedAdminRules.length}；规则用于限定研究框架，不是确认信号，也不是交易指令。`,
      `证据需求数量=${evidenceNeeds.length}；这些是待补证问题，不是已验证结论，也不是交易指令。`,
      `候选观察数量=${candidateOpportunities.length}；每个候选都需要来源依据和失效条件核验，不是交易指令。`,
      `下一步优先找反证并刷新证据，再考虑是否升级观察优先级；不是交易指令。`,
    ],
  };
}
