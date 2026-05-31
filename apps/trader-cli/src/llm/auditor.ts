export interface AuditIssues {
  blockers: string[];
  warnings: string[];
}

export function auditHypothesis(h: Record<string, any>): AuditIssues {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const allText = `${h.claim || ""} ${h.professional_explanation || ""} ${h.plain_language_explanation || ""}`;

  if (/必涨|必跌|绝对|100%|保证|肯定能|板上钉钉|guarantee|certainly|definitely/i.test(allText)) {
    blockers.push("prohibited_absolute_language");
  }

  if (/13F/i.test(allText) && !/季度|quarterly|延迟|delay|lag/i.test(allText)) {
    blockers.push("13f_without_delay_context");
  }

  const evidenceAgainst = h.evidence_against || [];
  const reasoningGap = h.reasoning_gap || "";
  if (evidenceAgainst.length === 0 && reasoningGap.length < 20) {
    warnings.push("no_counter_evidence_and_no_reasoning");
  }

  if (!h.invalidation_condition || h.invalidation_condition.length < 10) {
    warnings.push("missing_or_weak_invalidation_condition");
  }

  if (/主力在|庄家在|机构正在|大户在|Smart Money 在|明显是|显然是/i.test(allText)) {
    warnings.push("possible_unverified_counterparty_claim");
  }

  if (/call.*flow|call.*volume|call.*大增/i.test(allText) && /看多|看涨|bullish|买入/i.test(allText)) {
    if (!/确认|验证|confirm|verify|price.*action/i.test(allText)) {
      warnings.push("call_flow_without_price_confirmation");
    }
  }

  if (/ARK.*(?:买入|buy|增持|加仓)/i.test(allText)) {
    if (!/确认|验证|confirm|verify|price.*action/i.test(allText)) {
      warnings.push("ark_buy_without_price_confirmation");
    }
  }

  if (/肯定是|绝对是|必然是|一定是|毫无疑问|毋庸置疑|铁定/i.test(allText)) {
    warnings.push("colloquial_as_fact");
  }

  if (/跑赢|跑输|outperform|underperform|强势|弱势/i.test(allText)) {
    if (!/QQQ|SPY|benchmark|基准|大盘|指数/i.test(allText)) {
      warnings.push("relative_claim_without_benchmark");
    }
  }

  if (/TSLL|ARKK|leveraged?|杠杆|call|put|option/i.test(allText)) {
    if (!/损耗|decay|theta|波动.*风险|杠杆.*风险|时间.*风险/i.test(allText)) {
      warnings.push("leveraged_or_options_without_risk_warning");
    }
  }

  return { blockers, warnings };
}
