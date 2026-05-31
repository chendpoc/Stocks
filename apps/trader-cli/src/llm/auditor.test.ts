import assert from "node:assert/strict";
import test from "node:test";
import { auditHypothesis, type HypothesisAuditInput } from "./auditor.js";

const baseHypothesis: HypothesisAuditInput = {
  claim: "TSLL 可能形成更高低点",
  professional_explanation: "缩量回踩后高于前低，结构偏中性偏多。",
  plain_language_explanation: "价格回落后没有创新低，卖压可能在减弱。",
  evidence_for: ["5 日量能收缩", "低点抬高"],
  evidence_against: ["若波动率继续上升，结构可能失败"],
  reasoning_gap: "未发现直接反方证据，推导逻辑：缩量回踩+高于前低=卖压衰减",
  invalidation_condition: "若跌破前低并放量，则该结构失效",
  predictions: [
    {
      window: "3-5 交易日",
      expected_outcome: "维持 higher low 结构",
      invalid_if: "收盘跌破前低",
    },
  ],
};

function audit(input: Partial<HypothesisAuditInput>, base: HypothesisAuditInput = baseHypothesis) {
  return auditHypothesis({ ...base, ...input });
}

function auditOnly(input: HypothesisAuditInput) {
  return auditHypothesis(input);
}

test("clean hypothesis passes without blockers", () => {
  const result = audit({});
  assert.deepEqual(result.blockers, []);
});

test("reasoning_gap satisfies counter-evidence warning gate", () => {
  const result = audit({ evidence_against: [] });
  assert.ok(!result.warnings.includes("no_counter_evidence_and_no_reasoning"));
});

test("absolute language blockers", () => {
  const cases: Array<[Partial<HypothesisAuditInput>, string]> = [
    [{ claim: "TSLL 必涨" }, "claim"],
    [{ evidence_for: ["这票 definitely going up"] }, "evidence_for"],
    [{ claim: "结构偏多" }, "clean"],
    [{ plain_language_explanation: "绝对是板上钉钉的大机会" }, "plain_language"],
  ];

  assert.ok(audit(cases[0][0]).blockers.includes("prohibited_absolute_language"));
  assert.ok(audit(cases[1][0]).blockers.includes("prohibited_absolute_language"));
  assert.ok(!audit(cases[2][0]).blockers.includes("prohibited_absolute_language"));
  assert.ok(audit(cases[3][0]).blockers.includes("prohibited_absolute_language"));
});

test("13F delay context blockers", () => {
  assert.ok(
    audit({ claim: "13F 显示机构增持" }).blockers.includes("13f_without_delay_context"),
  );
  assert.ok(
    !audit({ claim: "13F 季度披露存在约 45 天 delay" }).blockers.includes(
      "13f_without_delay_context",
    ),
  );
});

test("trading instruction blockers", () => {
  assert.ok(
    audit({ claim: "建议立即买入 TSLA" }).blockers.includes("prohibited_trading_instruction"),
  );
  assert.ok(
    audit({ invalidation_condition: "目标价：350，跌破则失效" }).blockers.includes(
      "prohibited_trading_instruction",
    ),
  );
  assert.ok(
    !audit({
      plain_language_explanation: "仅供研究，不构成买入建议",
      claim: "若突破 320 则 setup forming",
    }).blockers.includes("prohibited_trading_instruction"),
  );
});

test("warning rules", () => {
  assert.ok(
    audit({
      evidence_against: [],
      reasoning_gap: "短",
      invalidation_condition: "失效",
    }).warnings.includes("no_counter_evidence_and_no_reasoning"),
  );
  assert.ok(
    audit({ invalidation_condition: "失效" }).warnings.includes(
      "missing_or_weak_invalidation_condition",
    ),
  );
  assert.ok(
    audit({ claim: "主力在吸筹" }).warnings.includes("possible_unverified_counterparty_claim"),
  );
  assert.ok(
    audit({
      claim: "call flow 大增，bullish 信号",
    }).warnings.includes("call_flow_without_price_confirmation"),
  );
  assert.ok(
    audit({
      claim: "call flow 大增，bullish，需 price action 确认",
    }).warnings.includes("call_flow_without_price_confirmation") === false,
  );
  assert.ok(
    audit({ claim: "ARK 增持 NVDA" }).warnings.includes("ark_buy_without_price_confirmation"),
  );
  assert.ok(
    auditOnly({ claim: "TSLL 表现强势" }).warnings.includes("relative_claim_without_benchmark"),
  );
  assert.ok(
    auditOnly({ claim: "TSLL 相对 SPY 强势" }).warnings.includes(
      "relative_claim_without_benchmark",
    ) === false,
  );
  assert.ok(
    auditOnly({ claim: "TSLL 杠杆 ETF" }).warnings.includes(
      "leveraged_or_options_without_risk_warning",
    ),
  );
  assert.ok(
    auditOnly({
      claim: "TSLL 杠杆 ETF，存在 decay 与波动风险",
    }).warnings.includes("leveraged_or_options_without_risk_warning") === false,
  );
});

test("leveraged rule does not false-positive on recall", () => {
  const result = audit({ claim: "需 recall 上次 lesson 中的失效条件" });
  assert.ok(!result.warnings.includes("leveraged_or_options_without_risk_warning"));
});
