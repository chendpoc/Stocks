export interface AuditIssues {
  blockers: string[];
  warnings: string[];
}

export interface HypothesisAuditInput {
  claim?: string;
  professional_explanation?: string;
  plain_language_explanation?: string;
  candidate_explanations?: string[];
  evidence_for?: string[];
  evidence_against?: string[];
  reasoning_gap?: string;
  missing_evidence?: string[];
  invalidation_condition?: string;
  predictions?: Array<{
    window?: string;
    expected_outcome?: string;
    invalid_if?: string;
  }>;
}

const PROHIBITED_ABSOLUTE_LANGUAGE =
  /必涨|必跌|绝对|100%|保证|肯定能|板上钉钉|肯定是|绝对是|必然是|一定是|毫无疑问|毋庸置疑|铁定|guarantee|certainly|definitely|surely|without doubt/i;

const THIRTEEN_F_WITHOUT_DELAY =
  /13F/i;

const DELAY_CONTEXT = /季度|quarterly|延迟|delay|lag/i;

const TRADING_INSTRUCTION =
  /(?:建议|推荐|应当|应该)(?:立即|马上|现在)?(?:买入|卖出|做多|做空)|(?:立即|马上|现在)(?:买入|卖出|做多|做空)|(?:目标价|止损价|止盈价)\s*[:：]\s*[\d$]|\b(?:buy|sell)\s+(?:now|today|immediately)\b|\bgo\s+(?:long|short)\b(?:\s+(?:now|today))?|\btarget\s+price\s*[:@]?\s*\$?\d|\bstop[- ]loss\s*[:@]?\s*\$?\d/i;

const UNVERIFIED_COUNTERPARTY =
  /主力在|庄家在|机构正在|大户在|Smart Money 在|明显是|显然是/i;

const BULLISH_DIRECTION = /看多|看涨|bullish|买入/i;

const PRICE_CONFIRMATION = /确认|验证|confirm|verify|price.*action/i;

const RELATIVE_PERFORMANCE = /跑赢|跑输|outperform|underperform|强势|弱势/i;

const BENCHMARK = /QQQ|SPY|benchmark|基准|大盘|指数/i;

const LEVERAGED_OR_OPTIONS_TOPIC =
  /TSLL|ARKK|\bleveraged?\b|杠杆|\b(?:call|put)\s+(?:option|spread|flow)|\boptions?\b/i;

const RISK_WARNING = /损耗|decay|theta|波动.*风险|杠杆.*风险|时间.*风险/i;

function collectHypothesisText(h: HypothesisAuditInput): string {
  const parts: string[] = [];

  for (const value of [
    h.claim,
    h.professional_explanation,
    h.plain_language_explanation,
    h.reasoning_gap,
    h.invalidation_condition,
  ]) {
    if (typeof value === "string" && value.length > 0) {
      parts.push(value);
    }
  }

  for (const key of [
    "evidence_for",
    "evidence_against",
    "candidate_explanations",
    "missing_evidence",
  ] as const) {
    for (const value of h[key] ?? []) {
      if (typeof value === "string" && value.length > 0) {
        parts.push(value);
      }
    }
  }

  for (const prediction of h.predictions ?? []) {
    for (const value of [
      prediction.window,
      prediction.expected_outcome,
      prediction.invalid_if,
    ]) {
      if (typeof value === "string" && value.length > 0) {
        parts.push(value);
      }
    }
  }

  return parts.join(" ");
}

export function auditHypothesis(h: HypothesisAuditInput): AuditIssues {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const allText = collectHypothesisText(h);

  if (PROHIBITED_ABSOLUTE_LANGUAGE.test(allText)) {
    blockers.push("prohibited_absolute_language");
  }

  if (THIRTEEN_F_WITHOUT_DELAY.test(allText) && !DELAY_CONTEXT.test(allText)) {
    blockers.push("13f_without_delay_context");
  }

  if (TRADING_INSTRUCTION.test(allText)) {
    blockers.push("prohibited_trading_instruction");
  }

  const evidenceAgainst = h.evidence_against ?? [];
  const reasoningGap = h.reasoning_gap ?? "";
  if (evidenceAgainst.length === 0 && reasoningGap.length < 20) {
    warnings.push("no_counter_evidence_and_no_reasoning");
  }

  if (!h.invalidation_condition || h.invalidation_condition.length < 10) {
    warnings.push("missing_or_weak_invalidation_condition");
  }

  if (UNVERIFIED_COUNTERPARTY.test(allText)) {
    warnings.push("possible_unverified_counterparty_claim");
  }

  if (/call.*flow|call.*volume|call.*大增/i.test(allText) && BULLISH_DIRECTION.test(allText)) {
    if (!PRICE_CONFIRMATION.test(allText)) {
      warnings.push("call_flow_without_price_confirmation");
    }
  }

  if (/ARK.*(?:买入|buy|增持|加仓)/i.test(allText)) {
    if (!PRICE_CONFIRMATION.test(allText)) {
      warnings.push("ark_buy_without_price_confirmation");
    }
  }

  if (RELATIVE_PERFORMANCE.test(allText) && !BENCHMARK.test(allText)) {
    warnings.push("relative_claim_without_benchmark");
  }

  if (LEVERAGED_OR_OPTIONS_TOPIC.test(allText) && !RISK_WARNING.test(allText)) {
    warnings.push("leveraged_or_options_without_risk_warning");
  }

  return { blockers, warnings };
}
