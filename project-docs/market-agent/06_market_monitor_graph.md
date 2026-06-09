# 06. Market Monitor Graph

> **⚠️**: 写入目标表为 `model_decisions`（不是 `decision_memories`）。
> `DecisionEnvelope` 已存在 (`src/llm/decisionEnvelope.ts`)。
> 本 graph 可作为 `DecisionGraph` 的节点扩展，或独立为守护进程风格的定时 graph。
> 不直接调用 Longbridge/Alpha Vantage/yfinance，通过 `MarketDataService` 访问。

## 1. 文档目的

本文档定义 `Permanent Memory Market Agent` 的核心实时监控工作流：`MarketMonitorGraph`。

`MarketMonitorGraph` 负责把行情数据、数据质量检查、特征计算、市场状态识别、setup 检测、证据链构建、反方验证、风控门禁和决策输出串成一个可审计的 LangGraph 工作流。

它的核心产物是：

```text
DecisionEnvelope
```

系统后续的永久记忆、结果回标、规律学习和 CLI 上下文恢复，都围绕 `DecisionEnvelope` 展开。

---

## 2. 模块目标

`MarketMonitorGraph` 需要做到：

```text
1. 读取用户交易约束和 watchlist。
2. 调用 MarketDataService 获取行情。
3. 执行 DataQualityGate。
4. 数据质量失败时停止 setup detection。
5. 计算基础特征。
6. 判断市场状态。
7. 检测 MVP setup。
8. 构建支持证据和反方证据。
9. 生成失效条件和下一次检查条件。
10. 执行 RiskGate。
11. 生成 DecisionEnvelope。
12. 将 DecisionEnvelope 写入 decision_memories。
13. 必要时写入 setup_events / failure_memories。
```

---

## 3. 非目标

本模块不做：

```text
1. 不直接调用 Longbridge / Alpha Vantage / yfinance。
2. 不直接做数据源解析。
3. 不做复杂回测。
4. 不做 outcome labeling。
5. 不做 pattern 晋升。
6. 不做自动实盘下单。
7. 不绕过用户确认。
8. 不让 LLM 直接决定 setup 是否成立。
```

`MarketMonitorGraph` 只负责当前时点的监控判断，不负责长期评估。
长期评估由后续文档中的 `OutcomeGraph`、`EvaluationGraph` 和 `PatternMemory` 处理。

---

## 4. 上下游关系

### 4.1 上游模块

```text
TradingMandateStore
WatchlistStore
SessionContextPack
MarketDataService
PatternMemory
FailureMemory
```

---

### 4.2 下游模块

```text
DecisionMemory
OutcomeGraph
EvaluationGraph
InsightExplorationGraph
SessionContextBootstrap
Notification / CLI Output
```

---

### 4.3 总体链路（并行化后）

> **ⓘ 架构决策**: 14 节点串行 → 7 个阶段并行化。单 tick (5 symbols) 延迟从 ~8s 降至 ~2s（无 LLM）或 ~6s（含 LLM）。

```text
┌─ bootstrap (一次性) ─────────────────────────────────────────┐
│  load_mandate + load_watchlist + load_session_context         │
│  → state.symbols[], state.mandate, state.activePatterns       │
└────────────────────────────┬─────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │          ← LangGraph Send() fan-out
     ┌────▼────┐        ┌────▼────┐        ┌────▼────┐
     │ SPY     │        │ TSLA    │        │ QQQ ... │      ← 每个 symbol 独立并行
     │         │        │         │        │         │
     │ fetch ──┤        │ fetch ──┤        │ fetch ──┤
     │ quality │        │ quality │        │ quality │
     │ features│        │ features│        │ features│
     │ state   │        │ state   │        │ state   │
     │ setup   │        │ setup   │        │ setup   │
     │         │        │         │        │         │
     │ ┌───────┴──┐     │ ┌───────┴──┐     │ ┌───────┴──┐
     │ │evidence  │     │ │evidence  │     │ │evidence  │  ← evidence ∥ contra
     │ │  ∥      │     │ │  ∥      │     │ │  ∥      │
     │ │contra   │     │ │contra   │     │ │contra   │
     │ └────┬────┘     │ └────┬────┘     │ └────┬────┘
     │      │          │      │          │      │
     │ risk + envelope │ risk + envelope │ risk + envelope
     └────┬─┘          └────┬─┘          └────┬─┘
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
                   ┌────────▼────────┐
                   │  batch_persist  │  单事务批量写入
                   └────────┬────────┘
                            │
                   ┌────────▼────────┐
                   │  notify/alert   │  按告警级别路由
                   └─────────────────┘
```

| 阶段 | 原串行 (5 symbols) | 并行后 | 瓶颈 |
|---|---|---|---|
| bootstrap | 500ms | 500ms | 一次性 |
| fetch (I/O) | 5×800ms = 4s | 800ms | API 并发 |
| quality+features+state+setup | 5×250ms = 1.3s | 250ms | 纯计算 |
| evidence ∥ contra (LLM) | 5×4s = 20s | 4s | LLM 最慢 |
| risk+envelope | 5×80ms = 400ms | 80ms | 纯计算 |
| batch_persist | 5×100ms = 500ms | 120ms | 单事务 |
| **合计 (无 LLM)** | **~4s** | **~2s** | |
| **合计 (含 LLM)** | **~26s** | **~6s** | **在 30s 目标内** |

---

## 5. Graph State 设计

### 5.1 `MarketMonitorState`

推荐使用一个明确的状态对象贯穿 LangGraph。

```python
from dataclasses import dataclass, field
from typing import Any

@dataclass
class MarketMonitorState:
    run_id: str
    symbols: list[str]
    timeframes: list[str]

    trading_mandate: dict[str, Any] | None = None
    watchlist: list[str] = field(default_factory=list)
    session_context: dict[str, Any] | None = None

    market_data: dict[str, Any] = field(default_factory=dict)
    quality_reports: dict[str, Any] = field(default_factory=dict)
    feature_snapshots: dict[str, Any] = field(default_factory=dict)
    market_states: dict[str, Any] = field(default_factory=dict)
    setup_events: dict[str, Any] = field(default_factory=dict)

    evidence_graphs: dict[str, Any] = field(default_factory=dict)
    contra_cases: dict[str, Any] = field(default_factory=dict)
    risk_results: dict[str, Any] = field(default_factory=dict)
    decision_envelopes: list[dict[str, Any]] = field(default_factory=list)

    failures: list[dict[str, Any]] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
```

---

### 5.2 State Key 约定

对于多标的、多周期数据，建议统一使用 key：

```text
{symbol}:{timeframe}
```

示例：

```text
TSLA:5m
TSLA:1d
NVDA:5m
SPY:1d
```

---

## 6. 节点总览

`MarketMonitorGraph` MVP 节点：

```text
1. load_trading_mandate
2. load_watchlist
3. load_session_context
4. fetch_market_data
5. validate_data_quality
6. compute_features
7. classify_market_state
8. detect_setups
9. build_evidence_graph
10. generate_contra_case
11. apply_risk_gate
12. generate_decision_envelope
13. persist_decision_memory
14. notify_or_silence
```

---

## 7. 节点 1：`load_trading_mandate`

### 7.1 目标

加载用户交易约束。

MVP 默认：

```yaml
mode: monitor_only
live_trading_enabled: false
paper_trading_requires_confirmation: true
watchlist:
  - SPY
  - QQQ
  - TSLA
  - NVDA
  - AAPL
timeframes:
  - 5m
  - 1d
setups:
  - VWAP_RECLAIM
  - RELATIVE_STRENGTH_PULLBACK
  - OPENING_RANGE_BREAKOUT
```

---

### 7.2 输出

写入 state：

```text
state.trading_mandate
```

---

### 7.3 失败处理

如果读取失败，使用安全默认值：

```text
mode = monitor_only
live_trading_enabled = false
paper_trading_requires_confirmation = true
```

不允许因为配置缺失而默认打开更高权限。

---

## 8. 节点 2：`load_watchlist`

### 8.1 目标

加载当前监控股票池。

MVP 默认：

```text
SPY
QQQ
TSLA
NVDA
AAPL
```

---

### 8.2 输出

写入 state：

```text
state.watchlist
```

---

### 8.3 规则

如果用户传入 symbols 参数：

```text
1. 与 trading_mandate.watchlist 求交集。
2. 不在允许列表中的 symbol 需要显式确认。
3. MVP 阶段不自动扩展全市场扫描。
```

---

## 9. 节点 3：`load_session_context`

### 9.1 目标

加载 CLI 启动时生成的长期记忆上下文。

默认路径：

```text
.runtime/context/context_pack.md
```

---

### 9.2 内容

应解析或读取：

```text
1. Active Patterns
2. Degraded Patterns
3. Active Warnings
4. Recent Decisions
5. Required Behavior
```

---

### 9.3 输出

写入 state：

```text
state.session_context
```

---

### 9.4 失败处理

如果 context pack 不存在：

```text
1. 记录 warning。
2. 使用空 context。
3. 不阻塞 monitor_only 运行。
4. 提示后续应运行 trader memory bootstrap --profile default。
```

不允许因为 context 缺失而自动生成交易建议。

---

## 10. 节点 4：`fetch_market_data`

### 10.1 目标

调用 `MarketDataService` 获取行情数据。

---

### 10.2 输入

```text
state.watchlist
state.timeframes
state.trading_mandate
```

---

### 10.3 调用

对每个 symbol/timeframe 调用：

```python
MarketDataService.fetch(
    MarketDataRequest(
        symbol=symbol,
        timeframe=timeframe,
        mode="historical",
        allow_fallback=True,
    )
)
```

实时 snapshot 可扩展为：

```python
MarketDataRequest(
    symbol=symbol,
    timeframe="snapshot",
    mode="snapshot",
    allow_fallback=True,
)
```

---

### 10.4 输出

写入 state：

```text
state.market_data["TSLA:5m"] = MarketDataResponse
state.quality_reports["TSLA:5m"] = DataQualityReport
```

---

### 10.5 失败处理

如果单个 symbol 拉取失败：

```text
1. 不中断整个 graph。
2. 记录该 symbol 的 failure。
3. 后续该 symbol 不进入 setup detection。
4. 继续处理其他 symbol。
```

---

## 11. 节点 5：`validate_data_quality`

### 11.1 目标

统一检查所有行情数据质量。

虽然 `MarketDataService` 已经包含 `DataQualityGate`，本节点仍需二次聚合判断：

```text
1. 判断哪些 symbol/timeframe 可继续。
2. 判断是否存在关键指数数据缺失。
3. 判断是否需要全局 risk_off 或 data_quality_block。
```

---

### 11.2 关键规则

如果 SPY 或 QQQ 的关键周期数据失败：

```text
1. 个股 setup confidence 降低。
2. 如果无法判断大盘状态，禁止 setup_confirmed。
3. 只允许 watch / review，不允许 alert / paper_trade_candidate。
```

如果某个 symbol 的 5m 数据失败：

```text
1. 不检测该 symbol 的日内 setup。
2. 可保留 1d 背景分析。
3. 写入 failure_memory 候选。
```

---

### 11.3 输出

更新：

```text
state.quality_reports
state.failures
```

---

## 12. 节点 6：`compute_features`

### 12.1 目标

调用 `FeatureEngine` 计算特征快照。

---

### 12.2 MVP 特征

```text
current_price
previous_close
day_high
day_low
opening_range_high
opening_range_low
gap_pct
vwap
ema_9
ema_20
ema_50
atr
volume_ratio
relative_strength_spy
relative_strength_qqq
distance_to_vwap
price_above_vwap
```

---

### 12.3 输入

```text
state.market_data
state.quality_reports
```

---

### 12.4 输出

写入：

```text
state.feature_snapshots["TSLA:5m"]
```

并持久化：

```text
feature_snapshots
```

---

### 12.5 失败处理

如果数据质量为：

```text
failed
blocked
```

则不计算常规特征。

如果数据质量为：

```text
warning
```

则允许计算，但必须在 feature snapshot 中标记：

```json
{
  "quality_warning": true
}
```

---

## 13. 节点 7：`classify_market_state`

### 13.1 目标

识别市场状态。

---

### 13.2 状态枚举

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

### 13.3 规则优先

本节点优先使用确定性规则。

示例：

```text
SPY below VWAP
QQQ below VWAP
SPY breaks intraday low
QQQ breaks intraday low

=> market_state = risk_off
```

示例：

```text
price_above_vwap = true
ema_9 > ema_20
relative_strength_qqq > 0
volume_ratio > 1.2

=> market_state = trend_up / reclaim_attempt
```

---

### 13.4 输出

写入：

```text
state.market_states["TSLA:5m"]
```

---

## 14. 节点 8：`detect_setups`

### 14.1 目标

检测 MVP setup 是否出现。

---

### 14.2 MVP Setup

```text
VWAP_RECLAIM
RELATIVE_STRENGTH_PULLBACK
OPENING_RANGE_BREAKOUT
```

---

### 14.3 Setup 状态

```text
not_present
forming
confirmed
blocked
invalidated
```

---

### 14.4 输入

```text
feature_snapshot
market_state
quality_report
session_context
active_patterns
degraded_patterns
active_warnings
```

---

### 14.5 输出

写入：

```text
state.setup_events["TSLA:5m"]
```

并持久化：

```text
setup_events
```

---

## 15. Setup 规则：`VWAP_RECLAIM`

### 15.1 forming 条件

```text
1. price 曾在 VWAP 下方。
2. 当前 close > vwap。
3. price_crossed_above_vwap = true。
4. volume_ratio_5m > 1.3。
5. QQQ 未处于明确 risk_off。
6. quality_status != failed / blocked。
```

---

### 15.2 confirmed 条件

```text
1. 连续 1-2 根 5m K 线收在 VWAP 上方。
2. volume_ratio 保持 > 1.0。
3. QQQ 或 SPY 未跌破日内低点。
4. 不存在 active_warning 冲突。
```

---

### 15.3 invalidated 条件

```text
1. 连续 2 根 5m K 线收在 VWAP 下方。
2. QQQ 跌破日内低点。
3. volume_ratio 快速降至 0.8 以下。
```

---

## 16. Setup 规则：`RELATIVE_STRENGTH_PULLBACK`

### 16.1 forming 条件

```text
1. SPY 或 QQQ 正在回调。
2. 个股跌幅小于 SPY / QQQ。
3. relative_strength_spy > 0 或 relative_strength_qqq > 0。
4. 个股仍在 VWAP 上方或关键支撑上方。
5. 下跌阶段 volume_ratio 没有显著放大。
```

---

### 16.2 confirmed 条件

```text
1. 个股相对强度持续为正。
2. 回踩后重新走高。
3. QQQ 未继续破位。
4. 个股未跌破关键支撑。
```

---

### 16.3 invalidated 条件

```text
1. 个股补跌。
2. 个股跌破 VWAP 或关键低点。
3. 相对强度转负。
```

---

## 17. Setup 规则：`OPENING_RANGE_BREAKOUT`

### 17.1 forming 条件

```text
1. 已形成开盘区间。
2. 当前价格接近 opening_range_high。
3. volume_ratio > 1.2。
4. QQQ / SPY 不处于明显 risk_off。
```

---

### 17.2 confirmed 条件

```text
1. 当前价格突破 opening_range_high。
2. volume_ratio > 1.5。
3. 突破后不快速跌回 opening range。
4. 大盘不反向破位。
```

---

### 17.3 invalidated 条件

```text
1. 跌回 opening_range_high 下方。
2. 假突破后放量下跌。
3. 大盘跌破日内低点。
```

---

## 18. 节点 9：`build_evidence_graph`

### 18.1 目标

把 setup 结果转化成结构化证据链。

---

### 18.2 输入

```text
setup_event
feature_snapshot
market_state
quality_report
active_patterns
degraded_patterns
failure_memories
```

---

### 18.3 输出

```json
{
  "claim": "TSLA is forming a VWAP reclaim setup",
  "supporting_evidence": [
    {
      "type": "price",
      "fact": "price reclaimed VWAP on 5m timeframe",
      "strength": 0.8
    },
    {
      "type": "volume",
      "fact": "5m volume_ratio is 1.7",
      "strength": 0.7
    }
  ],
  "opposing_evidence": [
    {
      "type": "market_context",
      "fact": "QQQ is still below VWAP",
      "risk": "market confirmation is weak"
    }
  ]
}
```

---

### 18.4 要求

每个非 `not_present` setup 至少包含：

```text
1. claim
2. supporting_evidence
3. opposing_evidence 或明确写暂无明显反方证据
4. invalidation_conditions
```

---

## 19. 节点 10：`generate_contra_case`

### 19.1 目标

生成反方验证。

---

### 19.2 输出内容

```text
1. 当前判断为什么可能失败。
2. 哪些条件说明 setup 过早。
3. 哪些市场环境会削弱该 setup。
4. 出现什么情况必须 invalidated。
```

---

### 19.3 LLM 使用边界

本节点可以使用 LLM，但必须基于结构化输入。

允许：

```text
基于 evidence_json 总结反方
基于 degraded_patterns 提醒风险
基于 failure_memories 生成警告
```

禁止：

```text
凭空编造新闻
凭空预测目标价
凭空输出收益承诺
凭空制造市场叙事
```

---

## 20. 节点 11：`apply_risk_gate`

### 20.1 目标

对 setup 和 evidence 执行风控门禁。

---

### 20.2 风控检查项

```text
1. 数据质量是否 pass / warning。
2. 是否存在 source_conflict。
3. SPY / QQQ 是否处于 risk_off。
4. setup 是否已经错过最佳风险收益位置。
5. 是否与 degraded pattern 冲突。
6. 是否临近重大事件。
7. 是否需要用户确认。
8. 当前运行模式是否 monitor_only。
```

---

### 20.3 风控状态

```text
pass
watch_only
blocked
requires_user_confirmation
```

---

### 20.4 默认规则

MVP 默认：

```text
mode = monitor_only
```

因此即使 setup confirmed，最终 action 也不能超过：

```text
alert
watch
review
```

不能生成：

```text
live_order
```

---

### 20.5 输出示例

```json
{
  "risk_gate": "watch_only",
  "reason": "QQQ is below VWAP, market confirmation is weak",
  "allowed_actions": ["monitor", "wait_for_confirmation"],
  "blocked_actions": ["live_order", "auto_order"]
}
```

---

## 21. 节点 12：`generate_decision_envelope`

### 21.1 目标

生成系统核心输出对象 `DecisionEnvelope`。

---

### 21.2 输入

```text
setup_event
market_state
evidence_graph
contra_case
risk_result
quality_report
feature_snapshot
```

---

### 21.3 输出

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
  "supporting_evidence": [],
  "opposing_evidence": [],
  "entry_conditions": [],
  "invalidation_conditions": [],
  "risk_notes": [],
  "risk_gate_status": "watch_only",
  "requires_user_confirmation": true,
  "next_check": "next_5m_close",
  "source_quality": {},
  "created_at": "2026-06-10T09:45:05-04:00"
}
```

---

### 21.4 Action 决策规则

| 条件                                          | Action                  |
| ------------------------------------------- | ----------------------- |
| setup not_present                           | `ignore`                |
| setup forming + risk watch_only             | `watch`                 |
| setup confirmed + risk pass + monitor_only  | `alert`                 |
| setup confirmed + risk pass + paper enabled | `paper_trade_candidate` |
| risk blocked                                | `blocked`               |
| setup invalidated                           | `invalidated`           |
| 数据不足                                        | `review`                |

---

### 21.5 重要限制

MVP 不允许输出：

```text
buy
sell
short
live_order
```

---

## 22. 节点 13：`persist_decision_memory`

### 22.1 目标

将 `DecisionEnvelope` 写入长期记忆。

---

### 22.2 写入表

```text
decision_memories
```

同时可写入：

```text
setup_events
failure_memories
```

---

### 22.3 写入规则

所有 `DecisionEnvelope` 都必须写入，即使 action 是：

```text
ignore
blocked
invalidated
review
```

原因：

```text
1. ignore 可用于 missed opportunity 分析。
2. blocked 可用于评估风控是否正确。
3. invalidated 可用于失败学习。
4. review 可用于人工复盘。
```

---

## 23. 节点 14：`notify_or_silence`

### 23.1 目标

决定是否向用户或 CLI 输出结果。

---

### 23.2 输出规则

默认输出：

```text
alert
paper_trade_candidate
blocked
invalidated
review
```

可静默：

```text
ignore
低置信 watch
重复 watch
```

---

### 23.3 去重规则

同一 symbol / setup / timeframe 在短时间内不应重复刷屏。

建议：

```text
同一 symbol + setup + status，15 分钟内只提示一次。
状态变化除外。
```

状态变化包括：

```text
forming → confirmed
forming → invalidated
confirmed → invalidated
watch_only → blocked
```

---

## 24. Graph 路由逻辑

### 24.1 正常路径

```text
load_trading_mandate
  → load_watchlist
  → load_session_context
  → fetch_market_data
  → validate_data_quality
  → compute_features
  → classify_market_state
  → detect_setups
  → build_evidence_graph
  → generate_contra_case
  → apply_risk_gate
  → generate_decision_envelope
  → persist_decision_memory
  → notify_or_silence
```

---

### 24.2 数据失败路径

```text
fetch_market_data
  → validate_data_quality
  → generate_data_quality_failure
  → persist_failure_memory
  → notify_or_silence
```

---

### 24.3 无 setup 路径

```text
detect_setups
  → generate_decision_envelope(action=ignore)
  → persist_decision_memory
  → silence
```

---

### 24.4 风控阻断路径

```text
apply_risk_gate
  → generate_decision_envelope(action=blocked)
  → persist_decision_memory
  → notify
```

---

## 25. Graph 伪代码

```python
def build_market_monitor_graph():
    graph = StateGraph(MarketMonitorState)

    graph.add_node("load_trading_mandate", load_trading_mandate)
    graph.add_node("load_watchlist", load_watchlist)
    graph.add_node("load_session_context", load_session_context)
    graph.add_node("fetch_market_data", fetch_market_data)
    graph.add_node("validate_data_quality", validate_data_quality)
    graph.add_node("compute_features", compute_features)
    graph.add_node("classify_market_state", classify_market_state)
    graph.add_node("detect_setups", detect_setups)
    graph.add_node("build_evidence_graph", build_evidence_graph)
    graph.add_node("generate_contra_case", generate_contra_case)
    graph.add_node("apply_risk_gate", apply_risk_gate)
    graph.add_node("generate_decision_envelope", generate_decision_envelope)
    graph.add_node("persist_decision_memory", persist_decision_memory)
    graph.add_node("notify_or_silence", notify_or_silence)

    graph.set_entry_point("load_trading_mandate")

    graph.add_edge("load_trading_mandate", "load_watchlist")
    graph.add_edge("load_watchlist", "load_session_context")
    graph.add_edge("load_session_context", "fetch_market_data")
    graph.add_edge("fetch_market_data", "validate_data_quality")
    graph.add_edge("validate_data_quality", "compute_features")
    graph.add_edge("compute_features", "classify_market_state")
    graph.add_edge("classify_market_state", "detect_setups")
    graph.add_edge("detect_setups", "build_evidence_graph")
    graph.add_edge("build_evidence_graph", "generate_contra_case")
    graph.add_edge("generate_contra_case", "apply_risk_gate")
    graph.add_edge("apply_risk_gate", "generate_decision_envelope")
    graph.add_edge("generate_decision_envelope", "persist_decision_memory")
    graph.add_edge("persist_decision_memory", "notify_or_silence")

    graph.set_finish_point("notify_or_silence")

    return graph.compile()
```

---

## 26. CLI 命令建议

### 26.1 运行监控

```bash
trader monitor run --symbols SPY,QQQ,TSLA,NVDA,AAPL --timeframes 5m,1d
```

---

### 26.2 只监控单个标的

```bash
trader monitor run --symbols TSLA --timeframes 5m,1d
```

---

### 26.3 dry run

```bash
trader monitor run --symbols TSLA --timeframes 5m --dry-run
```

---

### 26.4 输出最近决策

```bash
trader memory decisions --symbol TSLA --limit 20
```

---

## 27. FastAPI 接口建议

### 27.1 运行 MarketMonitorGraph

```http
POST /api/market-monitor/run
```

请求：

```json
{
  "symbols": ["SPY", "QQQ", "TSLA", "NVDA", "AAPL"],
  "timeframes": ["5m", "1d"],
  "mode": "monitor_only"
}
```

响应：

```json
{
  "run_id": "run_20260610_001",
  "decisions": [],
  "quality_reports": [],
  "failures": [],
  "created_at": "2026-06-10T09:45:00-04:00"
}
```

---

## 28. 测试计划

### 28.1 单元测试

必须覆盖：

```text
test_market_monitor_load_default_mandate
test_market_monitor_load_watchlist
test_market_monitor_handles_missing_context_pack
test_market_monitor_blocks_on_data_quality_failed
test_market_monitor_computes_features_on_warning_quality
test_market_monitor_detects_vwap_reclaim_forming
test_market_monitor_detects_orb_confirmed
test_market_monitor_generates_evidence_graph
test_market_monitor_applies_risk_gate_blocked
test_market_monitor_generates_decision_envelope
test_market_monitor_persists_decision_memory
```

---

### 28.2 集成测试

必须覆盖：

```text
MarketMonitorGraph
  ↓
MarketDataService
  ↓
DataQualityGate
  ↓
FeatureEngine
  ↓
SetupDetector
  ↓
RiskGate
  ↓
DecisionEnvelope
  ↓
decision_memories
```

---

### 28.3 Mock 数据要求

测试中应构造固定行情数据，不依赖实时 API。

至少准备：

```text
1. TSLA VWAP reclaim forming case
2. TSLA VWAP reclaim invalidated case
3. NVDA relative strength pullback case
4. AAPL opening range breakout case
5. QQQ risk_off case
6. data_quality_failed case
7. source_conflict case
```

---

## 29. Task 003：MarketMonitorGraph MVP

### 29.1 目标

实现 `MarketMonitorGraph` MVP，串联行情、质量检查、特征、setup、证据、风控和决策落库。

---

### 29.2 范围

必须实现：

```text
1. MarketMonitorState
2. load_trading_mandate
3. load_watchlist
4. load_session_context
5. fetch_market_data
6. validate_data_quality
7. compute_features
8. classify_market_state
9. detect_setups
10. build_evidence_graph
11. generate_contra_case
12. apply_risk_gate
13. generate_decision_envelope
14. persist_decision_memory
15. notify_or_silence
```

---

### 29.3 不做

本任务不做：

```text
1. 不做 OutcomeGraph。
2. 不做 PatternMemory 晋升。
3. 不做 live trading。
4. 不做复杂期权分析。
5. 不做全市场扫描。
6. 不接入新数据源。
```

---

### 29.4 验收标准

Task 003 完成后必须满足：

```text
1. CLI 可以运行 trader monitor run。
2. 可以处理 SPY / QQQ / TSLA / NVDA / AAPL。
3. 数据质量 failed / blocked 时不进入 setup detection。
4. 可以生成 feature snapshot。
5. 可以识别 3 类 MVP setup。
6. 可以生成 evidence graph。
7. 可以生成 contra case。
8. 可以执行 risk gate。
9. 可以生成 DecisionEnvelope。
10. 所有 DecisionEnvelope 都写入 decision_memories。
11. 不输出 live_order。
12. 单元测试和集成测试通过。
```

---

## 30. 下一步

阅读并实现：

```text
07_decision_envelope.md
```

重点完成：

```text
1. DecisionEnvelope schema
2. action/status 枚举
3. evidence / contra / risk 字段规范
4. 决策输出格式
5. 决策落库和后续 outcome 关联规则
```