# Rule Discovery Lite Backtest Decision

Status: accepted for v1 planning.  
Scope: Agent Core Backend self-learning boundary.  
Date: 2026-05-25.

## Decision

Agent Core v1 的“自我进化”不止停留在提出候选规则。一个新的候选机制必须完成简版回测，并生成一份精简说明报告，才算进入系统记录。

通过简版回测不代表规则可自动上线，也不代表可以自动交易。v1 的完成状态是：

```text
rule_candidate
  -> rule_candidate_evidence_requirements
  -> lite_backtest_report
  -> needs_more_data | rejected | pending_shadow_tracking | pending_manual_approval
```

## First Principles

市场规律不是静态知识，而是可失效假设。Agent 可以自动发现假设、整理证据、跑简版验证和写报告，但不能自动把候选规则升级为 active RulePack。

因此 v1 需要的是受控研究闭环：

- 先验证事实来源，再讨论机会。
- 先定义触发条件和失效条件，再做回测。
- 先扣除交易成本、滑点和流动性约束，再评价结果。
- 先输出可审计报告，再进入纸上跟踪或人工审批。

## In Scope

- 从赵哥语料、市场结构变化、新闻公告、行情异动中生成 `RuleCandidate`。
- 为候选规则生成证据需求清单。
- 执行轻量事件研究或简版回测。
- 记录 `LiteBacktestReport`。
- 给出 RuleCandidate 状态：`draft`、`evidence_required`、`backtest_pending`、`backtested`、`needs_more_data`、`rejected`、`pending_shadow_tracking`、`pending_manual_approval`、`manually_approved`、`versioned`、`archived`。
- `observe`、`waiting_trigger`、`invalidated` 属于 SignalCandidate 状态，不属于 RuleCandidate 状态。
- 保留人工审批边界。

## Out Of Scope

- 不做自动实盘下单。
- 不自动上线新规则。
- 不自动扩大可交易股票池。
- 不做组合级资金管理优化。
- 不承诺统计显著性达到机构级策略研究标准。
- 不把单个案例解释为长期有效规律。

## Candidate Rule Input

```json
{
  "candidate_id": "uuid",
  "source": "zhao_corpus | market_structure | news | filing | anomaly",
  "hypothesis": "string",
  "symbols": ["SPY"],
  "trigger_definition": "string",
  "entry_condition": "string",
  "exit_condition": "string",
  "invalidation": "string",
  "data_requirements": ["quotes", "volume", "news", "filings"],
  "risk_notes": ["liquidity", "spread", "event_gap"],
  "created_at": "iso-8601"
}
```

## Lite Backtest Minimum Standard

简版回测只回答一个问题：这个候选机制是否值得继续纸上跟踪。

最低要求：

1. 明确样本窗口和筛选条件。
2. 明确入场、退出、失效规则。
3. 禁止使用未来信息。
4. 至少记录触发次数、胜率、平均收益、中位收益、最大不利波动、最大有利波动。
5. 扣除估算交易成本、滑点和买卖价差。
6. 标记样本不足、数据缺口和不可成交风险。
7. 输出结论只能是继续观察、进入纸上跟踪、拒绝、需要人工确认。

## Lite Backtest Report

报告必须短，但要可审计：

```json
{
  "report_id": "uuid",
  "candidate_id": "uuid",
  "hypothesis": "string",
  "data_window": "string",
  "sample_size": 24,
  "metrics": {
    "win_rate": 0.54,
    "avg_return": 0.012,
    "median_return": 0.006,
    "max_adverse_excursion": -0.034,
    "max_favorable_excursion": 0.041
  },
  "cost_model": {
    "commission": "string",
    "spread_assumption": "string",
    "slippage_assumption": "string"
  },
  "evidence_gaps": ["string"],
  "decision": "pending_shadow_tracking",
  "reason": "string",
  "next_review_trigger": "string"
}
```

## Example Boundary

如果系统发现“SPY 相关期权交易时段变化可能创造尾盘到盘后的机会”，v1 不能直接生成交易动作。它必须先：

1. 验证交易时段变化的正式来源。
2. 收集对应时段的期权报价、成交、价差和流动性。
3. 定义尾盘触发条件和盘后退出条件。
4. 回测扣除价差和滑点后的结果。
5. 输出简报，说明是否进入纸上跟踪。

## Acceptance Criteria

- 每个新候选规则都有 `RuleCandidate` 记录。
- 每个进入下一阶段的候选规则都有 `LiteBacktestReport`。
- 报告包含触发条件、失效条件、样本窗口、核心指标、成本假设、证据缺口和结论。
- 简版回测失败时，规则状态为 `rejected` 或 `needs_more_data`。
- 简版回测通过时，规则状态最多进入 `pending_shadow_tracking` 或 `pending_manual_approval`。
- 没有人工审批时，候选规则不能写入 active RulePack。
