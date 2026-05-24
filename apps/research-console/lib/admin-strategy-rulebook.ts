import type { AdminStrategyRule, AdminStrategyRuleMatch } from "@stock-summary/summary-core";

export type AdminStrategyRulebookInput = {
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

const RESEARCH_BOUNDARY = "仅用于研究观察和反证核验，不形成交易指令。";

export const ADMIN_STRATEGY_RULES: AdminStrategyRule[] = [
  {
    id: "zhao-passive-reduction-window",
    title: "节日前被动减仓窗口",
    family: "market_regime",
    regime: "passive_reduction",
    thesis: "节日前后若出现机构被动减仓，盘中容易形成周期性急跌急涨，观察重点应放在时间窗口、价格位置和资金承接是否同时出现。",
    trigger: ["节日前后", "被动减仓", "程序化急跌急涨", "固定盘中时间窗口"],
    requiredEvidence: ["日期与事件窗口", "分时波动节奏", "成交量承接", "重点标的相对强弱"],
    invalidation: ["跌破前低后无承接", "时间窗口失效", "突发事件改变原有节奏"],
    instrumentDiscipline: ["优先观察重点标的节奏", "不把指数波动直接等同于个股机会"],
    sourceRefs: [
      "docs/opportunities/2026-05/2026-05-22-机会观察.md:7",
      "docs/opportunities/2026-05/2026-05-22-机会观察.md:73",
    ],
    researchBoundary: RESEARCH_BOUNDARY,
    keywords: ["被动减", "节前", "节日", "每隔一小时", "机器", "程序化", "急跌急涨", "10:30", "11:30"],
  },
  {
    id: "zhao-turning-volume-confirmation",
    title: "转弯与资金承接确认",
    family: "signal_confirmation",
    regime: "turning_confirmation",
    thesis: "机会观察必须等价格转弯和成交量承接同时出现，消息本身不能替代资金确认。",
    trigger: ["分时转弯", "成交额覆盖前段抛压", "价格位置与资金承接一致"],
    requiredEvidence: ["分时价格变化", "成交额对比", "买盘承接", "前段抛压是否被接回"],
    invalidation: ["转弯无量", "承接不足", "价格反弹后再次跌破确认位"],
    instrumentDiscipline: ["先验证正股或底层标的承接，再讨论衍生品观察"],
    sourceRefs: [
      "docs/trading-experiences/index.md:23",
      "docs/trading-experiences/index.md:49",
    ],
    researchBoundary: RESEARCH_BOUNDARY,
    keywords: ["转弯", "资金承接", "成交额", "成交量", "买盘", "抛盘", "价格位置", "时间窗口"],
  },
  {
    id: "zhao-event-weekend-cash-discipline",
    title: "周末事件与现金纪律",
    family: "market_regime",
    regime: "event_weekend",
    thesis: "盘后或周末密集事件会放大不可控波动，观察优先级应让位于现金纪律和事件落地后的再评估。",
    trigger: ["周末讲话", "盘后政策事件", "地缘谈判", "节假日流动性收缩"],
    requiredEvidence: ["事件日历", "盘后消息窗口", "市场是否提前调控波动", "事件落地后的走势"],
    invalidation: ["事件结果与原风险假设相反", "低点未出现", "相关领先指标继续走弱"],
    instrumentDiscipline: ["事件前降低暴露", "期权不硬抗事件磨损", "只保留研究观察"],
    sourceRefs: [
      "docs/index.md:11",
      "docs/index.md:40",
      "docs/index.md:47",
    ],
    researchBoundary: RESEARCH_BOUNDARY,
    keywords: ["周末", "讲话", "盘后", "不隔夜", "持币", "伊朗", "货币政策", "事件", "节假日"],
  },
  {
    id: "zhao-btc-leading-signal",
    title: "比特币先行信号",
    family: "signal_confirmation",
    regime: "crypto_leading",
    thesis: "币市常作为高弹性风险偏好的先行指标，币股观察需要先核验比特币是否出现转折信号。",
    trigger: ["BTC 快速波动", "币市场转弯", "币股联动", "风险偏好变化"],
    requiredEvidence: ["BTC 短周期涨跌", "币股同步性", "成交量扩张", "相关标的强弱"],
    invalidation: ["BTC 持续走弱", "币股不跟随", "相关标的无承接"],
    instrumentDiscipline: ["币股只作为联动观察，不单独确认机会"],
    sourceRefs: [
      "docs/trading-experiences/index.md:8",
      "docs/index.md:31",
      "docs/index.md:64",
    ],
    researchBoundary: RESEARCH_BOUNDARY,
    keywords: ["BTC", "比特币", "币市场", "币股", "CONL", "COIN", "IREN", "CIFR", "转弯"],
  },
  {
    id: "zhao-liquidity-rotation-seesaw",
    title: "存量跷跷板轮动",
    family: "market_regime",
    regime: "liquidity_rotation",
    thesis: "存量环境下一个板块获得资金，其他板块往往承压；观察应区分真实增量和板块间拆借。",
    trigger: ["缺少增量资金", "板块轮动", "大盘股与小盘股跷跷板", "明星股与币股切换"],
    requiredEvidence: ["板块相对表现", "资金流向", "核心标的强弱", "指数与个股背离"],
    invalidation: ["出现明确增量资金", "多板块同步放量", "轮动关系断裂"],
    instrumentDiscipline: ["不因单一板块热度提高整体置信度"],
    sourceRefs: ["docs/trading-experiences/index.md:4"],
    researchBoundary: RESEARCH_BOUNDARY,
    keywords: ["存量", "跷跷板", "轮动", "拆东墙补西墙", "七姐妹", "明星股", "小盘股"],
  },
  {
    id: "zhao-three-day-bad-news-digestion",
    title: "利空三日消化",
    family: "signal_confirmation",
    regime: "bad_news_digestion",
    thesis: "增发、减持、财报利空等冲击需要等待消化，不能把第一反应当作确认。",
    trigger: ["增发", "高管减持", "财报利空", "利空消息后第三日"],
    requiredEvidence: ["消息日期", "三日内价格路径", "分时转弯", "成交量承接"],
    invalidation: ["消化期后仍无承接", "新利空叠加", "反弹无法站稳"],
    instrumentDiscipline: ["利空消化前只保留低置信度观察"],
    sourceRefs: ["docs/trading-experiences/index.md:23"],
    researchBoundary: RESEARCH_BOUNDARY,
    keywords: ["三天", "三日", "消化", "利空", "增发", "减持", "财报", "不要一利空就马上进"],
  },
  {
    id: "zhao-options-time-decay-discipline",
    title: "期权时间成本纪律",
    family: "instrument_discipline",
    regime: "options_time_decay",
    thesis: "期权观察必须优先考虑时间损耗和波动率陷阱，即使方向判断正确也不能忽视持有成本。",
    trigger: ["期权", "时间损耗", "高 IV", "重大不确定性", "日内异动"],
    requiredEvidence: ["到期时间", "隐含波动率", "时间价值", "底层标的确认", "流动性"],
    invalidation: ["横盘磨损扩大", "底层标的不确认", "高波动率回落", "重大事件未落地"],
    instrumentDiscipline: ["期权只保留短周期研究观察", "重大不确定性下不硬抗时间成本"],
    sourceRefs: ["docs/trading-experiences/index.md:38"],
    researchBoundary: RESEARCH_BOUNDARY,
    keywords: ["期权", "时间衰减", "时间损耗", "Theta", "IV", "磨损", "止损", "日内"],
  },
  {
    id: "zhao-half-rebound-memory",
    title: "跌幅一半与历史对标",
    family: "signal_confirmation",
    regime: "historical_memory",
    thesis: "腰斩明星股或历史相似图形可提供研究参照，但必须经过当前市场状态和承接验证。",
    trigger: ["腰斩明星股", "反弹一半位置", "历史日期对标", "前高回归"],
    requiredEvidence: ["历史高低点", "当前回撤幅度", "相似历史结构", "当前成交量"],
    invalidation: ["基本面断裂", "相似结构失效", "反弹量能不足"],
    instrumentDiscipline: ["历史对标只能作为观察框架，不替代现时证据"],
    sourceRefs: [
      "docs/trading-experiences/index.md:12",
      "docs/trading-experiences/index.md:19",
    ],
    researchBoundary: RESEARCH_BOUNDARY,
    keywords: ["历史", "相似", "腰斩", "一半", "前高", "回归", "赚钱记忆"],
  },
  {
    id: "zhao-key-symbol-focus",
    title: "重点标的优先",
    family: "instrument_discipline",
    regime: "symbol_focus",
    thesis: "研究范围应优先限定在管理员重点标的和高弹性主线，普通用户热议不能直接升级为机会。",
    trigger: ["管理员重点标的", "算力", "光通信", "炒币股", "第一梯队"],
    requiredEvidence: ["管理员明确提及", "主题一致性", "流动性", "当日触发条件"],
    invalidation: ["仅普通用户热议", "标的杂乱", "与核心理论冲突", "无流动性证据"],
    instrumentDiscipline: ["先缩小观察池，再补证据"],
    sourceRefs: [
      "docs/opportunities/2026-05/2026-05-22-机会观察.md:62",
      "docs/opportunities/2026-05/2026-05-22-机会观察.md:83",
    ],
    researchBoundary: RESEARCH_BOUNDARY,
    keywords: ["重点标的", "算力", "光通信", "炒币股", "第一梯队", "普通用户", "热议"],
  },
  {
    id: "zhao-invalidation-before-escalation",
    title: "先反证再升级",
    family: "falsification",
    regime: "risk_boundary",
    thesis: "任何机会观察升级前都必须先列出失效条件，反证更强时取消观察。",
    trigger: ["失效条件", "风险边界", "跌破前低", "无承接", "框架失效"],
    requiredEvidence: ["前低位置", "承接质量", "事件风险", "核心假设是否仍成立"],
    invalidation: ["反证强于支撑证据", "关键时间窗口失效", "领先指标转弱"],
    instrumentDiscipline: ["证据不足时保持低置信度研究观察"],
    sourceRefs: [
      "docs/opportunities/2026-05/2026-05-22-机会观察.md:76",
      "docs/index.md:47",
    ],
    researchBoundary: RESEARCH_BOUNDARY,
    keywords: ["失效", "风险", "反证", "跌破前低", "无承接", "框架失效", "回避"],
  },
];

function cleanText(value: string | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function cleanList(values: string[] | undefined) {
  return (values ?? []).map(cleanText).filter(Boolean);
}

function inputText(input: AdminStrategyRulebookInput) {
  return [
    input.summary?.day ?? "",
    ...cleanList(input.summary?.overview),
    ...cleanList(input.summary?.eventSummary),
    ...cleanList(input.summary?.risks),
    cleanText(input.opportunity?.title),
    ...(input.opportunity?.symbols ?? []),
    cleanText(input.opportunity?.hypothesis),
    ...cleanList(input.opportunity?.supportingEvidence),
    ...cleanList(input.opportunity?.contradictingEvidence),
    ...cleanList(input.opportunity?.trigger),
    ...cleanList(input.opportunity?.invalidation),
    ...cleanList(input.opportunity?.watchPlan),
    ...cleanList(input.context?.adminCore),
    ...cleanList(input.context?.adminSymbols),
    ...cleanList(input.context?.notes),
  ].join("\n");
}

function matchScore(rule: AdminStrategyRule, text: string) {
  const normalized = text.toLowerCase();
  return rule.keywords.reduce((score, keyword) => {
    return normalized.includes(keyword.toLowerCase()) ? score + 1 : score;
  }, 0);
}

function toMatch(rule: AdminStrategyRule, score: number): AdminStrategyRuleMatch {
  return {
    ruleId: rule.id,
    title: rule.title,
    family: rule.family,
    regime: rule.regime,
    matchReason: `命中 ${score} 个规则关键词；用于限定研究观察，不提高结论置信度。`,
    requiredEvidence: rule.requiredEvidence,
    invalidation: rule.invalidation,
    sourceRefs: rule.sourceRefs,
  };
}

export function selectAdminStrategyRules(
  input: AdminStrategyRulebookInput,
  limit = 5,
): AdminStrategyRuleMatch[] {
  const text = inputText(input);
  if (!text.trim()) {
    return [];
  }

  return ADMIN_STRATEGY_RULES
    .map((rule) => ({ rule, score: matchScore(rule, text) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.rule.id.localeCompare(right.rule.id))
    .slice(0, limit)
    .map((item) => toMatch(item.rule, item.score));
}
