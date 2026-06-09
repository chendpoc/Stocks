# 08. Outcome and Evaluation

> **⚠️**: OutcomeGraph 和 EvaluationGraph 已实现:
> - `OutcomeGraph` → `apps/trader-workflows/src/graphs/01-outcome/`
> - `EvaluationGraph` → `apps/trader-workflows/src/graphs/02-evaluation/`
> 写入表: `decision_outcomes` / `insight_candidate_outcomes` / `evaluation_reports`（不是 `outcome_memories`）。

## 1. 文档目的

本文档定义 `Permanent Memory Market Agent` 的结果回标与评估系统：

```text
OutcomeGraph
EvaluationGraph
Insight Candidate Generation
```

`MarketMonitorGraph` 负责生成当前判断，`OutcomeGraph` 负责回答：

```text
这个判断之后，市场实际怎么走？
```

`EvaluationGraph` 负责回答：

```text
这一类 setup / pattern 长期表现如何？
```

系统只有完成结果回标和评估，才真正具备“学习”能力。否则它只是实时行情解释器。

---

## 2. 核心定位

`OutcomeGraph` 和 `EvaluationGraph` 是永久记忆闭环的第二阶段。

完整链路：

```text
MarketMonitorGraph
  ↓
DecisionEnvelope
  ↓
decision_memories
  ↓
OutcomeGraph
  ↓
outcome_memories
  ↓
EvaluationGraph
  ↓
insight_candidates
  ↓
PatternMemory
  ↓
SessionContextBootstrap
  ↓
context_pack.md
```

---

## 3. 模块目标

本模块需要做到：

```text
1. 读取未回标的 DecisionEnvelope。
2. 拉取 DecisionEnvelope 之后的行情窗口。
3. 计算 MFE / MAE / final_return。
4. 判断是否触发 entry_conditions。
5. 判断是否触发 invalidation_conditions。
6. 生成 outcome_label。
7. 将结果写入 outcome_memories。
8. 按 symbol / setup / market_state 聚合统计。
9. 发现表现较好的 setup 条件。
10. 发现表现衰退或失效的 setup / pattern。
11. 生成 insight_candidate。
12. 为 PatternMemory 晋升、降级、失效提供证据。
```

---

## 4. 非目标

本模块不做：

```text
1. 不生成实时交易判断。
2. 不直接修改 MarketMonitorGraph 规则。
3. 不自动把 insight_candidate 晋升为 active pattern。
4. 不自动实盘交易。
5. 不用 LLM 计算 MFE / MAE。
6. 不用 LLM 判断 hit_entry / hit_invalidation。
7. 不用 LLM 直接决定 pattern 是否有效。
```

LLM 可以参与：

```text
1. 复盘摘要。
2. 失败原因总结。
3. insight_candidate 的自然语言表述。
4. context_pack 中的经验压缩。
```

但所有关键指标必须由确定性代码计算。

---

## 5. 核心概念

## 5.1 DecisionEnvelope

`DecisionEnvelope` 是 OutcomeGraph 的输入。

它提供：

```text
symbol
timestamp
timeframe
setup
status
action
entry_conditions
invalidation_conditions
supporting_evidence
opposing_evidence
risk_gate_status
source_quality
```

---

## 5.2 Outcome Window

`outcome_window` 表示从 DecisionEnvelope 生成后，向后观察多长时间。

MVP 支持：

```text
30m
2h
1d
```

推荐含义：

| outcome_window | 用途              |
| -------------- | --------------- |
| `30m`          | 判断短线提示是否过早或过晚   |
| `2h`           | 判断日内 setup 是否有效 |
| `1d`           | 判断隔日或日线背景是否有延续  |

---

## 5.3 MFE

`MFE = Maximum Favorable Excursion`

表示判断之后，在观察窗口内最大有利波动。

对于看多 setup：

```text
MFE = (window_high - reference_price) / reference_price
```

对于看空 setup，后续可扩展：

```text
MFE = (reference_price - window_low) / reference_price
```

MVP 以看多 setup 为主。

---

## 5.4 MAE

`MAE = Maximum Adverse Excursion`

表示判断之后，在观察窗口内最大不利波动。

对于看多 setup：

```text
MAE = (window_low - reference_price) / reference_price
```

对于看空 setup，后续可扩展：

```text
MAE = (reference_price - window_high) / reference_price
```

MVP 以看多 setup 为主。

---

## 5.5 final_return

`final_return` 表示观察窗口结束时的收益变化。

对于看多 setup：

```text
final_return = (window_last_close - reference_price) / reference_price
```

MVP 默认使用 DecisionEnvelope 对应 bar 的 close 作为 `reference_price`。

---

## 6. OutcomeGraph 总体流程

```text
load_unlabeled_decisions
  ↓
resolve_outcome_window
  ↓
fetch_future_price_window
  ↓
compute_reference_price
  ↓
check_entry_hit
  ↓
check_invalidation_hit
  ↓
compute_mfe_mae
  ↓
assign_outcome_label
  ↓
persist_outcome_memory
  ↓
emit_evaluation_event
```

---

## 7. OutcomeGraph State 设计

```python
from dataclasses import dataclass, field
from typing import Any

@dataclass
class OutcomeGraphState:
    run_id: str
    outcome_window: str

    decisions: list[dict[str, Any]] = field(default_factory=list)
    price_windows: dict[str, Any] = field(default_factory=dict)
    outcome_results: list[dict[str, Any]] = field(default_factory=list)

    failures: list[dict[str, Any]] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
```

---

## 8. 节点 1：`load_unlabeled_decisions`

### 8.1 目标

读取尚未被指定窗口回标的 `decision_memories`。

---

### 8.2 输入

```text
outcome_window
limit
symbols
setup_name
```

---

### 8.3 查询逻辑

伪 SQL：

```sql
SELECT *
FROM decision_memories d
WHERE NOT EXISTS (
  SELECT 1
  FROM outcome_memories o
  WHERE o.decision_id = d.id
    AND o.outcome_window = :outcome_window
)
ORDER BY d.timestamp ASC
LIMIT :limit;
```

---

### 8.4 跳过规则

以下 decision 可以跳过，或只做特殊回标：

```text
1. action = ignore
2. source_quality.quality_status = failed
3. source_quality.quality_status = blocked
```

建议 MVP 仍然回标 `ignore`，因为它可以用于评估 missed opportunity。

---

## 9. 节点 2：`resolve_outcome_window`

### 9.1 目标

根据 `outcome_window` 计算后续价格窗口的起止时间。

---

### 9.2 规则

```text
30m：decision.timestamp → decision.timestamp + 30 minutes
2h：decision.timestamp → decision.timestamp + 2 hours
1d：decision.timestamp → next regular session close 或 +1 trading day
```

---

### 9.3 注意事项

必须考虑：

```text
1. 美股交易日。
2. 盘前 / 盘中 / 盘后。
3. 周末和节假日。
4. 半日交易。
5. 数据源是否支持对应时间窗口。
```

MVP 可以先简化：

```text
1. 只处理 regular session 内的 30m / 2h。
2. 1d 先按下一个交易日 close 处理。
3. 无法解析交易日时标记 unknown。
```

---

## 10. 节点 3：`fetch_future_price_window`

### 10.1 目标

调用 `MarketDataService` 获取 decision 之后的行情窗口。

---

### 10.2 输入

```text
symbol
timeframe
window_start
window_end
```

---

### 10.3 调用示例

```python
MarketDataService.fetch(
    MarketDataRequest(
        symbol=decision.symbol,
        timeframe=decision.timeframe,
        mode="historical",
        start=window_start,
        end=window_end,
        allow_fallback=True,
    )
)
```

---

### 10.4 失败处理

如果未来价格窗口拉取失败：

```text
1. 写入 outcome_label = unknown。
2. notes 中记录 data_fetch_failed。
3. 不生成 insight_candidate。
4. 写入 failure_memory 候选。
```

---

## 11. 节点 4：`compute_reference_price`

### 11.1 目标

确定 outcome 计算的参考价格。

---

### 11.2 默认规则

MVP 默认：

```text
reference_price = DecisionEnvelope timestamp 对应 bar 的 close
```

如果无法找到对应 bar：

```text
reference_price = 未来窗口第一根 bar 的 open
```

如果仍然无法确定：

```text
outcome_label = unknown
```

---

### 11.3 后续扩展

后续可支持：

```text
1. setup confirmed price
2. entry condition hit price
3. user-confirmed paper trade entry price
4. live order fill price
```

---

## 12. 节点 5：`check_entry_hit`

### 12.1 目标

判断 DecisionEnvelope 中的 entry conditions 是否在窗口内触发。

---

### 12.2 MVP 简化

MVP 可以先支持以下条件类型：

```text
price_above_vwap
price_breaks_opening_range_high
price_holds_vwap_for_n_bars
qqq_not_break_intraday_low
```

---

### 12.3 输出

```json
{
  "hit_entry": true,
  "entry_hit_at": "2026-06-10T10:00:00-04:00",
  "entry_hit_price": 185.70
}
```

---

### 12.4 失败处理

如果 entry condition 无法被机器解析：

```text
1. hit_entry = null
2. notes 记录 unparseable_entry_condition
3. outcome_label 不直接判定为 unknown
4. 仍然计算 MFE / MAE / final_return
```

---

## 13. 节点 6：`check_invalidation_hit`

### 13.1 目标

判断 DecisionEnvelope 中的 invalidation conditions 是否在窗口内触发。

---

### 13.2 MVP 支持

MVP 支持以下失效条件：

```text
two_5m_closes_below_vwap
price_falls_below_vwap
price_falls_below_opening_range_high
qqq_breaks_intraday_low
relative_strength_turns_negative
```

---

### 13.3 输出

```json
{
  "hit_invalidation": false,
  "invalidation_hit_at": null,
  "invalidation_reason": null
}
```

或：

```json
{
  "hit_invalidation": true,
  "invalidation_hit_at": "2026-06-10T10:15:00-04:00",
  "invalidation_reason": "two_5m_closes_below_vwap"
}
```

---

## 14. 节点 7：`compute_mfe_mae`

### 14.1 目标

计算观察窗口内最大有利波动和最大不利波动。

---

### 14.2 输入

```text
reference_price
future_price_window
direction
```

MVP 默认：

```text
direction = long_bias
```

---

### 14.3 计算规则

对于 long_bias：

```python
window_high = max(bar.high for bar in bars)
window_low = min(bar.low for bar in bars)
window_last_close = bars[-1].close

mfe = (window_high - reference_price) / reference_price
mae = (window_low - reference_price) / reference_price
final_return = (window_last_close - reference_price) / reference_price
```

---

### 14.4 输出

```json
{
  "mfe": 0.018,
  "mae": -0.006,
  "final_return": 0.011,
  "time_to_mfe_seconds": 3600,
  "time_to_invalidation_seconds": null
}
```

---

## 15. 节点 8：`assign_outcome_label`

### 15.1 目标

根据 entry、invalidation、MFE、MAE、final_return 生成 outcome label。

---

### 15.2 Outcome Label 枚举

```text
good_watch_signal
late_signal
false_positive
invalidated_quickly
blocked_correctly
missed_opportunity
data_quality_invalid
unknown
```

---

### 15.3 默认规则

#### good_watch_signal

满足：

```text
1. hit_invalidation = false
2. mfe >= positive_threshold
3. mae > max_adverse_threshold
```

建议阈值：

```text
positive_threshold = 0.008
max_adverse_threshold = -0.006
```

---

#### late_signal

满足：

```text
1. MFE 不高
2. MAE 较大
3. decision timestamp 已接近窗口内高点
```

MVP 简化：

```text
mfe < 0.004 且 mae <= -0.006
```

---

#### false_positive

满足：

```text
1. hit_entry = false 或 setup 未延续
2. final_return <= 0
3. mfe < positive_threshold
```

---

#### invalidated_quickly

满足：

```text
1. hit_invalidation = true
2. time_to_invalidation_seconds <= 1800
```

---

#### blocked_correctly

适用于 action = blocked：

```text
1. 后续走势触发 invalidation
2. 或 final_return 明显不利
3. 或 MAE 显著大于 MFE
```

---

#### missed_opportunity

适用于 action = ignore / blocked / review：

```text
1. 后续 MFE 显著为正
2. MAE 较小
3. 未触发 invalidation
```

---

#### data_quality_invalid

满足：

```text
source_quality.quality_status = failed / blocked
```

---

#### unknown

满足：

```text
1. 无法获取后续价格窗口。
2. reference_price 缺失。
3. 数据不足。
```

---

## 16. 节点 9：`persist_outcome_memory`

### 16.1 目标

将 outcome 结果写入：

```text
outcome_memories
```

---

### 16.2 写入字段

```text
id
decision_id
outcome_window
hit_entry
hit_invalidation
mfe
mae
final_return
time_to_mfe_seconds
time_to_invalidation_seconds
outcome_label
notes
created_at
```

---

### 16.3 写入规则

每个 decision / outcome_window 只能有一条 outcome。

建议添加幂等逻辑：

```text
如果已存在同 decision_id + outcome_window，则跳过或 update。
```

MVP 推荐：

```text
默认跳过已存在 outcome。
```

---

## 17. EvaluationGraph 总体流程

`EvaluationGraph` 负责把多个 outcome 聚合成统计结果。

流程：

```text
load_outcomes
  ↓
group_by_dimension
  ↓
compute_metrics
  ↓
detect_degradation
  ↓
generate_insight_candidates
  ↓
persist_insight_candidates
```

---

## 18. 聚合维度

MVP 支持：

```text
symbol
setup_name
timeframe
market_state
action
risk_gate_status
outcome_window
```

后续扩展：

```text
pattern_id
session
market_regime
data_source
volatility_regime
```

---

## 19. 评估指标

### 19.1 基础指标

```text
sample_size
good_signal_count
false_positive_count
invalidated_quickly_count
missed_opportunity_count
unknown_count
```

---

### 19.2 比率指标

```text
good_signal_rate
false_positive_rate
invalidation_rate
missed_opportunity_rate
unknown_rate
```

---

### 19.3 收益结构指标

```text
median_mfe
median_mae
median_final_return
mean_mfe
mean_mae
mean_final_return
expectancy
```

MVP 中 `expectancy` 可先定义为：

```text
expectancy = mean_final_return
```

后续可扩展为基于止盈止损规则的期望值。

---

## 20. EvaluationResult Schema

```python
from dataclasses import dataclass
from typing import Any

@dataclass
class EvaluationResult:
    group_key: dict[str, Any]
    sample_size: int

    good_signal_rate: float
    false_positive_rate: float
    invalidation_rate: float
    missed_opportunity_rate: float
    unknown_rate: float

    median_mfe: float | None
    median_mae: float | None
    median_final_return: float | None

    mean_mfe: float | None
    mean_mae: float | None
    mean_final_return: float | None

    expectancy: float | None
    recent_degradation: bool
    notes: list[str]
```

---

## 21. Degradation Detection

### 21.1 目标

识别已经衰退的 setup / pattern。

---

### 21.2 MVP 规则

当某组样本满足以下条件时，标记 `recent_degradation = true`：

```text
1. sample_size >= 20
2. 最近 10 次 false_positive_rate 高于历史平均
3. 最近 10 次 invalidated_quickly_rate 高于历史平均
4. 最近 10 次 mean_final_return 明显低于历史平均
```

---

### 21.3 处理方式

发现 degradation 后：

```text
1. 生成 insight_candidate 或 failure_memory。
2. 如果关联 active pattern，则建议 active → degraded。
3. 不自动删除 pattern。
4. 在 context_pack 中显示 warning。
```

---

## 22. Insight Candidate 生成

### 22.1 目标

从 EvaluationResult 中生成规律候选。

---

### 22.2 生成条件

可以生成正向 insight：

```text
1. sample_size >= 最小样本量
2. good_signal_rate 高于 baseline
3. median_mfe 明显大于 abs(median_mae)
4. false_positive_rate 可接受
```

也可以生成负向 insight：

```text
1. false_positive_rate 较高
2. invalidated_quickly_rate 较高
3. 特定 market_state 下表现恶化
4. 特定风险条件反复出现
```

---

### 22.3 MVP 最小样本量

MVP 建议：

```text
sample_size >= 20：允许生成 candidate
sample_size >= 50：允许进入 testing
sample_size >= 100：可考虑 active，但仍需用户确认
```

如果样本量不足：

```text
1. 允许记录 observation。
2. 不允许晋升 active pattern。
```

---

### 22.4 InsightCandidate 示例

```json
{
  "source": "evaluation_graph",
  "hypothesis": "TSLA VWAP_RECLAIM performs better when QQQ is above VWAP and volume_ratio exceeds 1.5.",
  "scope_json": {
    "symbol": "TSLA",
    "setup_name": "VWAP_RECLAIM",
    "timeframe": "5m",
    "market_state": "pullback_reclaim_attempt"
  },
  "evidence_json": {
    "sample_size": 42,
    "good_signal_rate": 0.62,
    "false_positive_rate": 0.21,
    "median_mfe": 0.014,
    "median_mae": -0.006
  },
  "status": "new"
}
```

---

## 23. FailureMemory 生成

### 23.1 触发条件

以下情况应生成 failure memory 候选：

```text
1. outcome_label = false_positive
2. outcome_label = invalidated_quickly
3. action = alert 但后续表现差
4. risk_gate_status = pass 但后续快速 invalidated
5. source_quality 存在 warning 且 outcome 差
6. degraded pattern 被再次误用
```

---

### 23.2 示例

```json
{
  "failure_type": "false_breakout",
  "symbol": "TSLA",
  "setup_name": "OPENING_RANGE_BREAKOUT",
  "root_cause": "QQQ was below VWAP and volume faded after breakout",
  "lesson": "Do not confirm ORB when index confirmation is absent.",
  "affected_patterns_json": ["pat_orb_001"],
  "status": "active_warning"
}
```

---

## 24. LLM 使用边界

## 24.1 不允许 LLM 参与

```text
1. MFE 计算
2. MAE 计算
3. final_return 计算
4. hit_entry 判定
5. hit_invalidation 判定
6. sample_size 统计
7. false_positive_rate 统计
8. pattern degradation 硬规则判断
```

---

## 24.2 允许 LLM 参与

```text
1. outcome notes 摘要
2. failure root_cause 初稿
3. insight_candidate hypothesis 初稿
4. evaluation report 自然语言摘要
```

要求：

```text
LLM 输出必须引用 EvaluationResult 或 OutcomeMemory 中的结构化字段。
```

---

## 25. CLI 命令建议

### 25.1 回标结果

```bash
trader memory label-outcomes --window 2h
```

---

### 25.2 回标指定标的

```bash
trader memory label-outcomes --symbol TSLA --window 2h
```

---

### 25.3 查看 outcome

```bash
trader memory outcomes --symbol TSLA --limit 20
```

---

### 25.4 运行评估

```bash
trader memory evaluate --setup VWAP_RECLAIM --window 2h
```

---

### 25.5 生成 insight candidate

```bash
trader memory generate-insights --setup VWAP_RECLAIM --symbol TSLA
```

---

## 26. FastAPI 接口建议

### 26.1 回标结果

```http
POST /api/memory/outcomes/label
```

请求：

```json
{
  "decision_id": "dec_20260610_tsla_001",
  "outcome_window": "2h"
}
```

响应：

```json
{
  "decision_id": "dec_20260610_tsla_001",
  "outcome_window": "2h",
  "outcome_label": "good_watch_signal",
  "mfe": 0.018,
  "mae": -0.006,
  "final_return": 0.011
}
```

---

### 26.2 批量回标

```http
POST /api/memory/outcomes/label-batch
```

请求：

```json
{
  "symbols": ["TSLA", "NVDA"],
  "outcome_window": "2h",
  "limit": 100
}
```

---

### 26.3 运行评估

```http
POST /api/memory/evaluate
```

请求：

```json
{
  "symbols": ["TSLA"],
  "setup_name": "VWAP_RECLAIM",
  "outcome_window": "2h"
}
```

响应：

```json
{
  "group_key": {
    "symbol": "TSLA",
    "setup_name": "VWAP_RECLAIM",
    "outcome_window": "2h"
  },
  "sample_size": 42,
  "good_signal_rate": 0.62,
  "false_positive_rate": 0.21,
  "median_mfe": 0.014,
  "median_mae": -0.006,
  "recent_degradation": false
}
```

---

## 27. 测试计划

### 27.1 OutcomeGraph 单元测试

必须覆盖：

```text
test_outcome_load_unlabeled_decisions
test_outcome_resolve_30m_window
test_outcome_resolve_2h_window
test_outcome_fetch_future_price_window
test_outcome_compute_reference_price
test_outcome_compute_mfe_mae_long_bias
test_outcome_hit_entry_true
test_outcome_hit_invalidation_true
test_outcome_label_good_watch_signal
test_outcome_label_false_positive
test_outcome_label_invalidated_quickly
test_outcome_label_unknown_on_missing_data
test_outcome_persist_memory
```

---

### 27.2 EvaluationGraph 单元测试

必须覆盖：

```text
test_evaluation_group_by_symbol_setup
test_evaluation_compute_sample_size
test_evaluation_compute_good_signal_rate
test_evaluation_compute_false_positive_rate
test_evaluation_compute_median_mfe_mae
test_evaluation_detect_recent_degradation
test_evaluation_generate_positive_insight_candidate
test_evaluation_generate_negative_insight_candidate
```

---

### 27.3 集成测试

必须覆盖：

```text
DecisionEnvelope
  ↓
decision_memories
  ↓
OutcomeGraph
  ↓
outcome_memories
  ↓
EvaluationGraph
  ↓
insight_candidates
```

---

## 28. Mock 数据要求

至少准备以下测试场景：

```text
1. VWAP reclaim 后续上涨，标记 good_watch_signal。
2. VWAP reclaim 快速跌回 VWAP 下方，标记 invalidated_quickly。
3. ORB 突破失败，标记 false_positive。
4. RiskGate blocked 后市场下跌，标记 blocked_correctly。
5. ignore 后市场大涨，标记 missed_opportunity。
6. 数据缺失，标记 unknown。
7. 最近 10 次表现变差，触发 recent_degradation。
```

---

## 29. Task 005：OutcomeGraph MVP

### 29.1 目标

实现 `OutcomeGraph` MVP，对历史 `DecisionEnvelope` 进行结果回标。

---

### 29.2 范围

必须实现：

```text
1. load_unlabeled_decisions
2. resolve_outcome_window
3. fetch_future_price_window
4. compute_reference_price
5. check_entry_hit
6. check_invalidation_hit
7. compute_mfe_mae
8. assign_outcome_label
9. persist_outcome_memory
```

---

### 29.3 不做

本任务不做：

```text
1. 不做 PatternMemory 晋升。
2. 不做 live trading。
3. 不做复杂回测引擎。
4. 不做全市场扫描。
5. 不做深度学习训练。
```

---

### 29.4 验收标准

Task 005 完成后必须满足：

```text
1. 可以读取未回标的 decision_memories。
2. 可以对 30m / 2h / 1d 进行 outcome window 解析。
3. 可以拉取后续价格窗口。
4. 可以计算 MFE / MAE / final_return。
5. 可以判断 hit_entry / hit_invalidation。
6. 可以生成 outcome_label。
7. 可以写入 outcome_memories。
8. 缺数据时 outcome_label = unknown。
9. 所有计算不依赖 LLM。
10. 单元测试通过。
```

---

## 30. Task 006：EvaluationGraph MVP

### 30.1 目标

实现 `EvaluationGraph` MVP，对 outcome 结果进行聚合统计并生成 insight_candidate。

---

### 30.2 范围

必须实现：

```text
1. load_outcomes
2. group_by_dimension
3. compute_metrics
4. detect_degradation
5. generate_insight_candidates
6. persist_insight_candidates
```

---

### 30.3 验收标准

Task 006 完成后必须满足：

```text
1. 可以按 symbol / setup_name / timeframe / outcome_window 聚合。
2. 可以计算 sample_size。
3. 可以计算 good_signal_rate。
4. 可以计算 false_positive_rate。
5. 可以计算 invalidation_rate。
6. 可以计算 median_mfe / median_mae / median_final_return。
7. 可以识别 recent_degradation。
8. 可以生成 insight_candidate。
9. insight_candidate 默认 status = new。
10. 不自动晋升 active pattern。
```

---

## 31. 下一步

阅读并实现：

```text
09_pattern_memory_and_learning.md
```

重点完成：

```text
1. PatternMemory 状态机
2. insight_candidate → pattern_memory
3. active / degraded / invalidated / archived 规则
4. pattern 晋升确认门禁
5. pattern 与 context_pack 的关系
```