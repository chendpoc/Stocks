# 07. Decision Envelope

> **⚠️**: `DecisionEnvelope` 已实现: `apps/trader-workflows/src/llm/decisionEnvelope.ts`。
> 持久化到 `model_decisions` 表（不是 `decision_memories`）。
> 本阶段如需扩展字段，在现有类型上追加即可，不重新定义。

## 1. 文档目的

本文档定义 `Permanent Memory Market Agent` 的核心输出对象：`DecisionEnvelope`。

`DecisionEnvelope` 是系统对某个市场状态、setup、风险状态和后续观察计划的结构化表达。
它不是交易订单，也不是直接买卖建议，而是一个可审计、可落库、可回标、可学习的市场判断对象。

系统后续的永久记忆、结果回标、规律分析和 CLI 上下文恢复，都应围绕 `DecisionEnvelope` 展开。

---

## 2. 核心定位

`DecisionEnvelope` 的定位是：

```text
一次市场判断的完整证据包
```

它需要回答：

```text
1. 当前判断的是哪个标的？
2. 当前处于什么市场状态？
3. 触发了什么 setup？
4. 判断依据是什么？
5. 反方证据是什么？
6. 风险门禁结果是什么？
7. 当前推荐动作是什么？
8. 什么条件下判断成立？
9. 什么条件下判断失效？
10. 下一次应该检查什么？
11. 是否需要用户确认？
12. 后续结果如何回标？
```

---

## 3. 非目标

`DecisionEnvelope` 不做：

```text
1. 不直接下单。
2. 不承诺收益。
3. 不输出确定性预测。
4. 不绕过 RiskGate。
5. 不替代用户确认。
6. 不保存支付、券商密钥或敏感凭证。
7. 不把 LLM 的自然语言解释当成唯一依据。
8. 不允许缺少证据链的交易倾向输出。
```

MVP 阶段禁止输出：

```text
buy
sell
short
live_order
auto_order
```

---

## 4. 与其他模块的关系

```text
MarketMonitorGraph
  ↓
DecisionEnvelope
  ↓
model_decisions（概念名：decision_memories）
  ↓
OutcomeGraph
  ↓
decision_outcomes / insight_candidate_outcomes（概念名：outcome_memories）
  ↓
EvaluationGraph
  ↓
insight_candidates
  ↓
pattern_memories
  ↓
SessionContextBootstrap
  ↓
context_pack.md
```

`DecisionEnvelope` 是以下模块的核心输入：

| 下游模块                      | 用途            |
| ------------------------- | ------------- |
| `DecisionMemory`          | 永久保存每次判断      |
| `OutcomeGraph`            | 根据后续行情回标判断结果  |
| `EvaluationGraph`         | 聚合统计 setup 表现 |
| `InsightExplorationGraph` | 从判断与结果中生成规律候选 |
| `PatternMemory`           | 保存被验证的长期规律    |
| `FailureMemory`           | 保存失败教训        |
| `SessionContextBootstrap` | 加载近期决策和有效规律   |

---

## 5. 设计原则

### 5.1 所有判断都必须结构化

禁止只输出：

```text
TSLA 看起来不错，可以关注。
```

必须输出结构化对象：

```json
{
  "symbol": "TSLA",
  "setup": "VWAP_RECLAIM",
  "action": "watch",
  "supporting_evidence": [],
  "opposing_evidence": [],
  "invalidation_conditions": [],
  "risk_gate_status": "watch_only"
}
```

---

### 5.2 所有判断必须可回标

`DecisionEnvelope` 必须保留足够信息，让 `OutcomeGraph` 后续可以判断：

```text
1. 是否触发 entry condition
2. 是否触发 invalidation condition
3. 后续最大有利波动 MFE
4. 后续最大不利波动 MAE
5. 最终 outcome_label
```

---

### 5.3 所有判断必须可解释

每个非 `ignore` 判断都必须包含：

```text
1. supporting_evidence
2. opposing_evidence
3. risk_notes
4. invalidation_conditions
5. next_check
```

---

### 5.4 所有判断必须经过 RiskGate

`DecisionEnvelope` 生成前必须经过 `RiskGate`。

如果 `RiskGate = blocked`：

```text
1. action 必须为 blocked 或 review。
2. 不允许生成 paper_trade_candidate。
3. 不允许生成 live_order。
4. 必须记录 blocked reason。
```

---

## 6. DecisionEnvelope Schema

## 6.1 完整结构

```python
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

DecisionAction = Literal[
    "ignore",
    "watch",
    "alert",
    "paper_trade_candidate",
    "blocked",
    "invalidated",
    "review",
]

DecisionStatus = Literal[
    "no_opportunity",
    "setup_forming",
    "setup_confirmed",
    "risk_blocked",
    "invalidated",
    "needs_review",
]

RiskGateStatus = Literal[
    "pass",
    "watch_only",
    "blocked",
    "requires_user_confirmation",
]

@dataclass
class DecisionEnvelope:
    id: str
    symbol: str
    timestamp: datetime
    timeframe: str

    market_state: str
    setup: str | None
    status: DecisionStatus
    confidence: float
    action: DecisionAction

    supporting_evidence: list[dict[str, Any]] = field(default_factory=list)
    opposing_evidence: list[dict[str, Any]] = field(default_factory=list)

    entry_conditions: list[dict[str, Any]] = field(default_factory=list)
    invalidation_conditions: list[dict[str, Any]] = field(default_factory=list)

    risk_notes: list[dict[str, Any]] = field(default_factory=list)
    risk_gate_status: RiskGateStatus = "watch_only"

    requires_user_confirmation: bool = True
    next_check: str | None = None

    source_quality: dict[str, Any] = field(default_factory=dict)
    feature_snapshot_id: str | None = None
    setup_event_id: str | None = None

    created_at: datetime | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
```

---

## 6.2 JSON 示例

```json
{
  "id": "dec_20260610_tsla_001",
  "symbol": "TSLA",
  "timestamp": "2026-06-10T09:45:00-04:00",
  "timeframe": "5m",
  "market_state": "pullback_reclaim_attempt",
  "setup": "VWAP_RECLAIM",
  "status": "setup_forming",
  "confidence": 0.64,
  "action": "watch",
  "supporting_evidence": [
    {
      "type": "price",
      "fact": "price reclaimed VWAP on 5m timeframe",
      "strength": 0.8,
      "source": "feature_snapshot"
    },
    {
      "type": "volume",
      "fact": "5m volume_ratio is 1.7",
      "strength": 0.7,
      "source": "feature_snapshot"
    }
  ],
  "opposing_evidence": [
    {
      "type": "market_context",
      "fact": "QQQ is still below VWAP",
      "risk": "market confirmation is weak",
      "severity": "medium"
    }
  ],
  "entry_conditions": [
    {
      "condition": "TSLA remains above VWAP for next 5m close",
      "type": "confirmation"
    },
    {
      "condition": "QQQ does not break intraday low",
      "type": "market_filter"
    }
  ],
  "invalidation_conditions": [
    {
      "condition": "two consecutive 5m closes below VWAP",
      "type": "price"
    },
    {
      "condition": "QQQ breaks intraday low",
      "type": "market_context"
    }
  ],
  "risk_notes": [
    {
      "type": "market_confirmation",
      "note": "Index confirmation is weak because QQQ is below VWAP",
      "severity": "medium"
    }
  ],
  "risk_gate_status": "watch_only",
  "requires_user_confirmation": true,
  "next_check": "next_5m_close",
  "source_quality": {
    "quality_status": "pass",
    "source": "longbridge",
    "latency_seconds": 4
  },
  "feature_snapshot_id": "feat_20260610_tsla_001",
  "setup_event_id": "setup_20260610_tsla_vwap_001",
  "created_at": "2026-06-10T09:45:05-04:00",
  "metadata": {
    "run_id": "run_20260610_001",
    "graph": "MarketMonitorGraph"
  }
}
```

---

## 7. 字段说明

## 7.1 `id`

唯一 ID。

推荐格式：

```text
dec_{YYYYMMDD}_{symbol}_{sequence}
```

示例：

```text
dec_20260610_tsla_001
```

要求：

```text
1. 全局唯一。
2. 可用于 `model_decisions` 主键（概念名：decision_memories）。
3. 可被 `decision_outcomes` / `insight_candidate_outcomes` 外键引用（概念名：outcome_memories）。
```

---

## 7.2 `symbol`

股票代码。

要求：

```text
1. 必须大写。
2. 必须与 watchlist 中的 symbol 一致。
3. 不允许为空。
```

示例：

```text
TSLA
NVDA
AAPL
SPY
QQQ
```

---

## 7.3 `timestamp`

判断对应的市场时间。

要求：

```text
1. 使用 ISO 8601。
2. 必须带时区。
3. 应对应触发判断的行情 bar 时间，而不是 LLM 生成时间。
```

---

## 7.4 `timeframe`

判断所基于的主要周期。

MVP 支持：

```text
5m
1d
```

后续可扩展：

```text
1m
15m
1h
```

---

## 7.5 `market_state`

市场状态。

枚举参考：

```text
trend_up
trend_down
range_bound
pullback
breakout_attempt
failed_breakout
gap_up_hold
gap_up_fade
gap_down_reclaim
high_volatility
liquidity_thin
risk_off
unknown
```

---

## 7.6 `setup`

触发的 setup。

MVP 支持：

```text
VWAP_RECLAIM
RELATIVE_STRENGTH_PULLBACK
OPENING_RANGE_BREAKOUT
```

如果没有 setup：

```json
"setup": null
```

---

## 7.7 `status`

判断状态。

枚举：

```text
no_opportunity
setup_forming
setup_confirmed
risk_blocked
invalidated
needs_review
```

含义：

| status            | 含义               |
| ----------------- | ---------------- |
| `no_opportunity`  | 当前没有有效 setup     |
| `setup_forming`   | setup 正在形成，但尚未确认 |
| `setup_confirmed` | setup 条件确认       |
| `risk_blocked`    | setup 存在，但被风控阻断  |
| `invalidated`     | setup 已失效        |
| `needs_review`    | 信息不足，需要人工复核      |

---

## 7.8 `confidence`

系统对该判断的置信度。

范围：

```text
0.0 - 1.0
```

建议分层：

| 区间            | 含义             |
| ------------- | -------------- |
| `0.00 - 0.30` | 低置信，仅记录        |
| `0.30 - 0.55` | 观察             |
| `0.55 - 0.75` | 中等置信，可 alert   |
| `0.75 - 0.90` | 高置信，但仍需风控      |
| `0.90 - 1.00` | 极高置信，MVP 不建议使用 |

MVP 建议限制：

```text
confidence 不应超过 0.85
```

原因：

```text
金融判断存在数据噪声、市场突变和 regime drift，避免系统过度自信。
```

---

## 7.9 `action`

系统建议动作。

MVP 枚举：

```text
ignore
watch
alert
paper_trade_candidate
blocked
invalidated
review
```

含义：

| action                  | 含义         |
| ----------------------- | ---------- |
| `ignore`                | 没有机会，静默或记录 |
| `watch`                 | 进入观察       |
| `alert`                 | 提醒用户关注     |
| `paper_trade_candidate` | 纸交易候选，需要确认 |
| `blocked`               | 风控阻断       |
| `invalidated`           | setup 失效   |
| `review`                | 需要人工复核     |

MVP 禁止：

```text
buy
sell
short
live_order
auto_order
```

---

## 8. Evidence 字段规范

## 8.1 `supporting_evidence`

支持证据。

每条 evidence 建议结构：

```json
{
  "type": "price",
  "fact": "price reclaimed VWAP on 5m timeframe",
  "strength": 0.8,
  "source": "feature_snapshot"
}
```

字段说明：

| 字段         | 说明                                                                         |
| ---------- | -------------------------------------------------------------------------- |
| `type`     | price / volume / trend / relative_strength / market_context / data_quality |
| `fact`     | 结构化事实的自然语言表达                                                               |
| `strength` | 0.0 - 1.0                                                                  |
| `source`   | feature_snapshot / market_data / pattern_memory / failure_memory           |

---

## 8.2 `opposing_evidence`

反方证据。

每条 opposing evidence 建议结构：

```json
{
  "type": "market_context",
  "fact": "QQQ is still below VWAP",
  "risk": "market confirmation is weak",
  "severity": "medium"
}
```

字段说明：

| 字段         | 说明                  |
| ---------- | ------------------- |
| `type`     | 风险类型                |
| `fact`     | 反方事实                |
| `risk`     | 为什么它削弱当前判断          |
| `severity` | low / medium / high |

---

## 8.3 Evidence 类型枚举

```text
price
volume
trend
relative_strength
market_context
volatility
event
risk
data_quality
pattern_memory
failure_memory
```

---

## 8.4 Evidence 要求

对于非 `ignore` 的 DecisionEnvelope：

```text
1. 至少 1 条 supporting_evidence。
2. 至少 1 条 opposing_evidence，或明确标记 no_obvious_opposing_evidence。
3. 每条 evidence 必须来自结构化输入。
4. LLM 不能凭空生成 evidence。
```

---

## 9. Entry Conditions 规范

`entry_conditions` 表示该 setup 后续要真正成立，还需要满足什么条件。

示例：

```json
[
  {
    "condition": "TSLA remains above VWAP for next 5m close",
    "type": "confirmation",
    "source": "setup_rule"
  },
  {
    "condition": "QQQ does not break intraday low",
    "type": "market_filter",
    "source": "risk_gate"
  }
]
```

MVP 中，`entry_conditions` 不是自动下单条件，只是观察条件。

---

## 10. Invalidation Conditions 规范

`invalidation_conditions` 表示判断失效条件。

示例：

```json
[
  {
    "condition": "two consecutive 5m closes below VWAP",
    "type": "price",
    "source": "setup_rule"
  },
  {
    "condition": "QQQ breaks intraday low",
    "type": "market_context",
    "source": "setup_rule"
  }
]
```

要求：

```text
1. 每个非 ignore 判断必须有 invalidation_conditions。
2. invalidation_conditions 必须能被 OutcomeGraph 后续检查。
3. 不允许只写模糊条件，例如“走势变差”。
```

---

## 11. Risk Notes 规范

`risk_notes` 表示风险门禁和风险解释。

示例：

```json
[
  {
    "type": "market_confirmation",
    "note": "Index confirmation is weak because QQQ is below VWAP",
    "severity": "medium",
    "source": "risk_gate"
  },
  {
    "type": "degraded_pattern",
    "note": "Similar ORB patterns recently had increased false positives",
    "severity": "high",
    "source": "pattern_memory"
  }
]
```

---

## 12. RiskGate Status 规范

枚举：

```text
pass
watch_only
blocked
requires_user_confirmation
```

含义：

| risk_gate_status             | 含义             |
| ---------------------------- | -------------- |
| `pass`                       | 风险门禁通过         |
| `watch_only`                 | 只允许观察          |
| `blocked`                    | 阻断，不允许进入交易候选   |
| `requires_user_confirmation` | 需要用户确认后才能进入下一步 |

MVP 默认：

```text
monitor_only 模式下，即使 setup_confirmed，也不允许超过 alert。
```

---

## 13. requires_user_confirmation

布尔值。

以下情况必须为 `true`：

```text
1. action = paper_trade_candidate
2. risk_gate_status = requires_user_confirmation
3. 交易权限涉及升级
4. setup 使用 degraded pattern
5. 数据质量为 warning
6. 用户风险约束不完整
```

MVP 建议：

```text
requires_user_confirmation 默认 true
```

---

## 14. next_check

表示下一次应该检查什么。

示例：

```text
next_5m_close
next_15m_close
when_price_retests_vwap
when_qqq_reclaims_vwap
market_close
```

要求：

```text
1. 必须具体。
2. 不能写“稍后再看”。
3. 应能被后续 monitor loop 理解。
```

---

## 15. source_quality

记录数据质量信息。

示例：

```json
{
  "quality_status": "pass",
  "source": "longbridge",
  "latency_seconds": 4,
  "missing_bars": 0,
  "source_conflict": false,
  "warnings": []
}
```

如果数据质量存在 warning：

```json
{
  "quality_status": "warning",
  "source": "yfinance",
  "warnings": [
    "yfinance_used_as_realtime_fallback"
  ]
}
```

---

## 16. Action 决策规则

## 16.1 基础规则表

| 输入条件                            | status            | risk_gate_status             | action                  |
| ------------------------------- | ----------------- | ---------------------------- | ----------------------- |
| 无 setup                         | `no_opportunity`  | `pass`                       | `ignore`                |
| setup forming                   | `setup_forming`   | `watch_only`                 | `watch`                 |
| setup confirmed                 | `setup_confirmed` | `pass`                       | `alert`                 |
| setup confirmed                 | `setup_confirmed` | `requires_user_confirmation` | `alert`                 |
| setup confirmed + paper enabled | `setup_confirmed` | `pass`                       | `paper_trade_candidate` |
| 风控阻断                            | `risk_blocked`    | `blocked`                    | `blocked`               |
| setup 失效                        | `invalidated`     | `pass`                       | `invalidated`           |
| 数据不足                            | `needs_review`    | `watch_only`                 | `review`                |

---

## 16.2 monitor_only 模式限制

如果：

```text
mode = monitor_only
```

则 action 只能是：

```text
ignore
watch
alert
blocked
invalidated
review
```

不能是：

```text
paper_trade_candidate
live_order
```

---

## 16.3 paper trading 模式限制

如果：

```text
mode = paper_trading
```

则 `paper_trade_candidate` 必须满足：

```text
1. setup_confirmed
2. risk_gate_status = pass
3. data_quality = pass
4. not degraded_pattern_conflict
5. user confirmation required
```

---

## 16.4 live trading 禁止规则

MVP 阶段不实现 live trading。

即使未来实现，也必须满足：

```text
1. 用户显式开启 live_trading_enabled。
2. 用户确认标的、方向、数量、价格、止损、止盈。
3. RiskGate = pass。
4. 数据质量 = pass。
5. 不存在 source_conflict。
6. 不存在 active warning 阻断。
```

---

## 17. DecisionEnvelope 落库规则

每个 `DecisionEnvelope` 必须写入：

```text
model_decisions（概念名：decision_memories）
```

对应字段：

| DecisionEnvelope 字段               | model_decisions 字段        |
| --------------------------------- | ------------------------ |
| `id`                              | `id`                     |
| `symbol`                          | `symbol`                 |
| `timestamp`                       | `timestamp`              |
| `timeframe`                       | `timeframe`              |
| `market_state`                    | `market_state`           |
| `setup`                           | `setup_name`             |
| `action`                          | `action`                 |
| `confidence`                      | `confidence`             |
| `supporting_evidence`             | `evidence_json`          |
| `opposing_evidence`               | `contra_json`            |
| `risk_notes` + `risk_gate_status` | `risk_json`              |
| full object                       | `decision_envelope_json` |
| `setup_event_id`                  | `setup_event_id`         |
| `created_at`                      | `created_at`             |

---

## 18. OutcomeGraph 关联规则

`OutcomeGraph` 后续通过以下字段进行回标：

```text
decision_id
symbol
timestamp
timeframe
entry_conditions
invalidation_conditions
```

`OutcomeGraph` 至少应计算：

```text
1. hit_entry
2. hit_invalidation
3. MFE
4. MAE
5. final_return
6. time_to_mfe
7. time_to_invalidation
8. outcome_label
```

---

## 19. FailureMemory 关联规则

以下情况应由 `DecisionEnvelope` 触发 failure memory：

```text
1. action = blocked 且 reason = data_quality_failed
2. action = invalidated
3. risk_gate_status = blocked
4. source_quality.source_conflict = true
5. opposing_evidence 中存在 high severity 风险
6. OutcomeGraph 后续标记 false_positive
7. OutcomeGraph 后续标记 invalidated_quickly
```

---

## 20. CLI 输出格式

CLI 中不应直接打印完整 JSON，除非用户请求 debug。

默认人类可读输出：

```text
[WATCH] TSLA 5m — VWAP_RECLAIM forming

Market State:
- pullback_reclaim_attempt

Supporting Evidence:
- Price reclaimed VWAP on 5m timeframe.
- 5m volume_ratio is 1.7.

Opposing Evidence:
- QQQ is still below VWAP; market confirmation is weak.

Risk:
- watch_only
- Live order is blocked.

Invalidation:
- Two 5m closes below VWAP.
- QQQ breaks intraday low.

Next Check:
- next_5m_close
```

Debug 输出：

```bash
npm run workflows -- decisions list --symbol TSLA --limit 1 --json
```

---

## 21. API 输出格式

FastAPI 返回可包含完整 `DecisionEnvelope` JSON。

示例：

```json
{
  "run_id": "run_20260610_001",
  "decisions": [
    {
      "id": "dec_20260610_tsla_001",
      "symbol": "TSLA",
      "timeframe": "5m",
      "setup": "VWAP_RECLAIM",
      "status": "setup_forming",
      "action": "watch",
      "risk_gate_status": "watch_only"
    }
  ]
}
```

---

## 22. 验证规则

生成 `DecisionEnvelope` 前必须校验：

```text
1. id 不为空。
2. symbol 不为空。
3. timestamp 不为空。
4. timeframe 不为空。
5. status 属于枚举。
6. action 属于枚举。
7. risk_gate_status 属于枚举。
8. confidence 在 0.0 - 1.0。
9. 非 ignore action 必须有 supporting_evidence。
10. 非 ignore action 必须有 invalidation_conditions。
11. blocked action 必须有 risk_notes。
12. source_quality 必须存在。
```

---

## 23. 单元测试计划

必须覆盖：

```text
test_decision_envelope_valid_watch
test_decision_envelope_valid_alert
test_decision_envelope_blocks_live_order_in_mvp
test_decision_envelope_requires_evidence_for_watch
test_decision_envelope_requires_invalidation_for_non_ignore
test_decision_envelope_confidence_range
test_decision_envelope_action_enum
test_decision_envelope_status_enum
test_decision_envelope_maps_to_decision_memory
test_decision_envelope_monitor_only_action_limit
```

---

## 24. Task 004：DecisionEnvelope Schema & Validation

### 24.1 目标

实现 `DecisionEnvelope` 的 schema、枚举、校验逻辑和数据库映射。

---

### 24.2 范围

必须实现：

```text
1. DecisionEnvelope dataclass / Pydantic model
2. DecisionAction enum
3. DecisionStatus enum
4. RiskGateStatus enum
5. Evidence schema
6. Condition schema
7. RiskNote schema
8. source_quality schema
9. validation logic
10. model_decisions mapping（概念名：decision_memories）
```

---

### 24.3 不做

本任务不做：

```text
1. 不做行情获取。
2. 不做 setup detection。
3. 不做 OutcomeGraph。
4. 不做 PatternMemory。
5. 不做 live trading。
```

---

### 24.4 验收标准

Task 004 完成后必须满足：

```text
1. 可以创建合法 DecisionEnvelope。
2. 非 ignore 判断缺少 evidence 时校验失败。
3. 非 ignore 判断缺少 invalidation_conditions 时校验失败。
4. confidence 超出 0-1 时校验失败。
5. monitor_only 模式下不能输出 paper_trade_candidate / live_order。
6. DecisionEnvelope 可以映射为 `model_decisions` row（概念名：decision_memories）。
7. DecisionEnvelope 可以被 JSON 序列化。
8. 单元测试通过。
```

---

## 25. 下一步

阅读并实现：

```text
08_outcome_and_evaluation.md
```

重点完成：

```text
1. OutcomeGraph
2. MFE / MAE 计算
3. outcome_label 规则
4. EvaluationGraph 聚合统计
5. insight_candidate 生成入口
```
