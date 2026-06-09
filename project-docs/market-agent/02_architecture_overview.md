# 02. Architecture Overview

## 1. 文档目的

本文档定义 `Permanent Memory Market Agent` 的总体架构、模块边界、数据流、Graph 关系和运行链路。

本系统采用分层架构：

```text
数据源层
  ↓
数据服务层
  ↓
质量检查层
  ↓
特征计算层
  ↓
市场监控层
  ↓
决策输出层
  ↓
永久记忆层
  ↓
结果回标层
  ↓
规律学习层
  ↓
CLI 上下文恢复层
```

本文档只描述架构和模块关系，不展开数据库表结构、具体 API、CLI 命令和测试用例。
这些内容分别在后续文档中定义。

---

## 2. 架构目标

系统架构需要满足以下目标：

```text
1. 数据源可替换。
2. 数据质量可审计。
3. 特征计算可测试。
4. Setup 检测可复现。
5. 决策输出可结构化落库。
6. 后续结果可回标。
7. 规律记忆可版本化。
8. 失败教训可恢复。
9. 每次 CLI 启动可加载长期记忆。
10. 系统不依赖聊天历史延续状态。
```

核心判断：

> 本系统不是“LLM 直接分析股票”，而是“结构化数据管线 + Graph 工作流 + 永久记忆系统 + LLM 辅助解释”。

---

## 3. 总体架构图

```text
External Data Sources
  ├─ Longbridge CLI / SDK
  ├─ Alpha Vantage
  └─ yfinance
        ↓
MarketDataService
        ↓
DataQualityGate
        ↓
FeatureEngine
        ↓
MarketStateClassifier
        ↓
SetupDetector
        ↓
EvidenceGraphBuilder
        ↓
ContraCaseGenerator
        ↓
RiskGate
        ↓
DecisionEnvelope
        ↓
MemoryGraph
        ├─ DecisionMemory
        ├─ OutcomeMemory
        ├─ PatternMemory
        ├─ FailureMemory
        └─ SessionContextPacks
        ↓
OutcomeGraph
        ↓
EvaluationGraph
        ↓
InsightExplorationGraph
        ↓
SessionContextBootstrap
        ↓
.runtime/context/context_pack.md
        ↓
CLI Agent
```

---

## 4. 核心模块清单

| 模块                        | 职责                                               |
| ------------------------- | ------------------------------------------------ |
| `MarketDataService`       | 统一行情访问入口，屏蔽 Longbridge、Alpha Vantage、yfinance 差异 |
| `SourceRouter`            | 根据数据类型、周期、优先级选择数据源                               |
| `DataNormalizer`          | 将不同数据源返回值标准化为统一 OHLCV / Snapshot                 |
| `DataQualityGate`         | 检查数据延迟、缺失、冲突、异常                                  |
| `FeatureEngine`           | 计算 VWAP、EMA、ATR、volume_ratio、relative_strength 等 |
| `MarketStateClassifier`   | 判断 trend、range、pullback、risk_off 等市场状态           |
| `SetupDetector`           | 检测 VWAP_RECLAIM、RS_PULLBACK、ORB 等 setup          |
| `EvidenceGraphBuilder`    | 构建支持证据和反方证据                                      |
| `ContraCaseGenerator`     | 生成反方验证和失效路径                                      |
| `RiskGate`                | 风险门禁，决定是否允许生成 alert / paper candidate            |
| `DecisionEnvelope`        | 系统核心输出对象                                         |
| `MemoryGraph`             | 长期记忆写入、读取、更新、降级                                  |
| `OutcomeGraph`            | 对历史判断进行结果回标                                      |
| `EvaluationGraph`         | 统计 setup / pattern 表现                            |
| `InsightExplorationGraph` | 生成规律候选                                           |
| `SessionContextBootstrap` | CLI 启动时生成上下文包                                    |

---

## 5. 数据源层

### 5.1 数据源职责

| 数据源           | MVP 职责           | 备注             |
| ------------- | ---------------- | -------------- |
| Longbridge    | 实时行情、当前报价、交易相关状态 | 优先用于实时链路       |
| Alpha Vantage | 日线、分钟线、技术指标补充    | 适合补充历史和指标      |
| yfinance      | 原型、历史补全、非关键分析    | 不作为真实交易前最终报价依据 |

---

### 5.2 数据源访问原则

Agent 不允许直接调用具体数据源。

错误链路：

```text
Agent → yfinance
Agent → Alpha Vantage
Agent → Longbridge
```

正确链路：

```text
Agent
  ↓
MarketDataService
  ↓
SourceRouter
  ↓
LongbridgeAdapter / AlphaVantageAdapter / YFinanceAdapter
```

这样可以统一处理：

```text
1. source priority
2. fallback
3. normalization
4. quality report
5. source conflict
6. cache
7. error handling
```

---

## 6. 数据服务层：MarketDataService

### 6.1 模块职责

`MarketDataService` 是系统唯一行情数据入口。

职责：

```text
1. 接收标准化 MarketDataRequest。
2. 根据 mode / timeframe / symbol 选择数据源。
3. 调用对应 adapter。
4. 将不同数据源返回值标准化为 OHLCV。
5. 生成 DataQualityReport。
6. 必要时进行 fallback。
7. 返回 MarketDataResponse。
```

---

### 6.2 标准调用链路

```text
MarketMonitorGraph
  ↓
MarketDataService.fetch()
  ↓
SourceRouter.select_source()
  ↓
LongbridgeAdapter / AlphaVantageAdapter / YFinanceAdapter
  ↓
DataNormalizer
  ↓
DataQualityGate
  ↓
MarketDataResponse
```

---

### 6.3 标准输入对象

```python
class MarketDataRequest:
    symbol: str
    timeframe: str
    start: datetime | None
    end: datetime | None
    mode: Literal["realtime", "historical", "snapshot"]
    preferred_source: str | None
```

---

### 6.4 标准输出对象

```python
class MarketDataResponse:
    symbol: str
    timeframe: str
    source: str
    bars: list[OHLCVBar]
    quality: DataQualityReport
    fetched_at: datetime
```

---

## 7. 质量检查层：DataQualityGate

### 7.1 模块职责

在任何 setup 检测之前，必须先通过数据质量检查。

检查项：

```text
1. empty bars
2. missing bars
3. duplicate timestamp
4. out-of-order timestamp
5. abnormal OHLC
6. zero volume
7. source conflict
8. stale data
9. timezone mismatch
10. session mismatch
```

---

### 7.2 质量状态

```text
pass
warning
failed
blocked
```

规则：

```text
pass：允许继续
warning：允许继续，但降低 confidence
failed：停止 setup detection
blocked：停止所有交易判断
```

---

### 7.3 门禁原则

如果数据质量为 `failed` 或 `blocked`：

```text
1. 不进入 FeatureEngine。
2. 不进入 SetupDetector。
3. 不生成交易倾向。
4. 只允许生成 data_quality_report。
5. 必须写入 failure_memory。
```

---

## 8. 特征计算层：FeatureEngine

### 8.1 模块职责

把 OHLCV 数据转成可用于 setup 检测和证据构建的结构化特征。

---

### 8.2 MVP 特征

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

### 8.3 输出原则

所有特征必须结构化保存。

输出对象：

```text
FeatureSnapshot
```

写入表：

```text
feature_snapshots
```

LLM 不参与特征计算。

---

## 9. 市场状态层：MarketStateClassifier

### 9.1 模块职责

根据特征和市场上下文判断标的当前市场状态。

---

### 9.2 状态枚举

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

### 9.3 设计原则

市场状态优先由规则判断。
LLM 可以解释状态，但不能替代底层规则。

---

### 9.4 示例

```text
price_above_vwap = true
ema_9 > ema_20
relative_strength_qqq > 0
volume_ratio > 1.2

=> market_state = trend_up / reclaim_attempt
```

---

## 10. Setup 检测层：SetupDetector

### 10.1 模块职责

识别指定 setup 是否正在形成、确认或失效。

---

### 10.2 MVP Setup

```text
VWAP_RECLAIM
RELATIVE_STRENGTH_PULLBACK
OPENING_RANGE_BREAKOUT
```

---

### 10.3 Setup 状态

```text
not_present
forming
confirmed
blocked
invalidated
```

---

### 10.4 输出对象

```text
SetupEvent
```

必须包含：

```text
symbol
timestamp
timeframe
setup_name
setup_status
confidence
conditions
invalidations
evidence_seed
feature_snapshot_id
```

---

## 11. 证据层：EvidenceGraphBuilder

### 11.1 模块职责

把 setup 条件转换成可审计证据链。

---

### 11.2 证据类型

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
```

---

### 11.3 输出结构

```json
{
  "claim": "TSLA is forming a VWAP reclaim setup",
  "supporting_evidence": [
    {
      "type": "price",
      "fact": "price reclaimed VWAP on 5m timeframe",
      "strength": 0.8
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

## 12. 反方验证层：ContraCaseGenerator

### 12.1 模块职责

每个 setup 判断都必须生成反方验证。

输出内容：

```text
1. 当前判断为什么可能失败。
2. 哪些信号说明 setup 过早。
3. 哪些市场环境会削弱该 setup。
4. 出现什么情况必须 invalidated。
```

---

### 12.2 LLM 使用边界

LLM 可以参与此节点，但必须基于结构化输入。

禁止：

```text
凭空编造新闻
凭空预测目标价
凭空制造市场叙事
```

---

## 13. 风控层：RiskGate

### 13.1 模块职责

在系统输出高优先级提示前，进行风险门禁。

---

### 13.2 MVP 风控项

```text
1. 数据质量是否通过
2. 是否存在 source_conflict
3. 是否大盘处于 risk_off
4. setup 是否已经错过最佳风险收益位置
5. 是否与 degraded pattern 冲突
6. 是否临近重大事件
7. 是否需要用户确认
```

---

### 13.3 风控状态

```text
pass
watch_only
blocked
requires_user_confirmation
```

---

### 13.4 输出示例

```json
{
  "risk_gate": "watch_only",
  "reason": "QQQ is below VWAP, market confirmation is weak",
  "allowed_actions": ["monitor", "wait_for_confirmation"],
  "blocked_actions": ["live_order"]
}
```

---

## 14. 决策输出层：DecisionEnvelope

### 14.1 模块职责

`DecisionEnvelope` 是系统核心输出对象。

所有 alert、观察、复盘、规律学习都必须以它为基础。

---

### 14.2 输出原则

系统不输出：

```text
直接买入
直接卖出
收益承诺
确定性预测
```

系统输出：

```text
ignore
watch
alert
paper_trade_candidate
blocked
invalidated
review
```

---

### 14.3 最小结构

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

## 15. 永久记忆层：MemoryGraph

### 15.1 模块职责

负责所有长期记忆的写入、读取、降级、晋升和上下文生成。

---

### 15.2 记忆类型

```text
DecisionMemory
OutcomeMemory
InsightCandidate
PatternMemory
FailureMemory
SessionContextPack
```

---

### 15.3 MemoryGraph 核心节点

```text
record_decision_memory
record_outcome_memory
evaluate_pattern_performance
generate_insight_candidate
validate_insight_candidate
promote_to_pattern_memory
degrade_or_invalidate_pattern
build_cli_context_pack
```

---

## 16. 结果回标层：OutcomeGraph

### 16.1 模块职责

对历史 `DecisionEnvelope` 进行后续结果回标。

---

### 16.2 Outcome Window

MVP 支持：

```text
30m
2h
1d
```

---

### 16.3 核心指标

```text
hit_entry
hit_invalidation
MFE
MAE
final_return
time_to_mfe
time_to_invalidation
outcome_label
```

---

## 17. 评估层：EvaluationGraph

### 17.1 模块职责

统计不同 setup、symbol、market_state 下的表现。

---

### 17.2 聚合维度

```text
symbol
setup_name
timeframe
market_state
session
pattern_id
```

---

### 17.3 输出指标

```text
sample_size
win_rate
median_mfe
median_mae
expectancy
false_positive_rate
invalidation_rate
recent_degradation
```

---

## 18. 规律学习层：InsightExplorationGraph

### 18.1 模块职责

根据 outcome 统计生成规律候选。

---

### 18.2 输出对象

```text
InsightCandidate
```

注意：

```text
InsightCandidate 不是有效规律。
必须经过验证和用户确认，才能进入 PatternMemory。
```

---

## 19. CLI 上下文恢复层：SessionContextBootstrap

### 19.1 模块职责

每次 CLI 启动前生成：

```text
.runtime/context/context_pack.md
```

这个文件是 Agent 当前会话的启动记忆。

---

### 19.2 Context Pack 必须包含

```text
Trading Mandate
Watchlist
Active Patterns
Degraded Patterns
Active Warnings
Recent Decisions
Current Focus
Required Behavior
```

---

## 20. 推荐目录结构

根据当前项目实际结构微调。推荐新增：

```text
trader_workflow/
  market_agent/
    __init__.py

    data/
      market_data_service.py
      source_router.py
      longbridge_adapter.py
      alphavantage_adapter.py
      yfinance_adapter.py
      normalizer.py
      quality_gate.py

    features/
      feature_engine.py
      vwap.py
      ema.py
      atr.py
      relative_strength.py

    setups/
      base.py
      vwap_reclaim.py
      relative_strength_pullback.py
      opening_range_breakout.py

    graphs/
      market_monitor_graph.py
      memory_graph.py
      outcome_graph.py
      evaluation_graph.py

    memory/
      repositories.py
      schemas.py
      decision_memory.py
      outcome_memory.py
      pattern_memory.py
      failure_memory.py
      context_pack_builder.py

    risk/
      risk_gate.py

    api/
      routes_market_monitor.py
      routes_memory.py

    cli/
      memory_commands.py
      monitor_commands.py

    tests/
      test_data_quality_gate.py
      test_feature_engine.py
      test_setup_vwap_reclaim.py
      test_memory_graph.py
      test_context_pack_builder.py
```

---

## 21. 最小运行链路

MVP 最小运行链路：

```text
CLI command
  ↓
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
EvidenceGraphBuilder
  ↓
RiskGate
  ↓
DecisionEnvelope
  ↓
decision_memories
```

后续学习链路：

```text
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

## 22. 模块依赖方向

依赖方向必须保持单向：

```text
data → features → setups → graphs → memory
```

禁止出现：

```text
memory 直接依赖 data adapter
setup 直接调用 yfinance
LLM 节点直接写数据库
RiskGate 反向修改 FeatureEngine
```

推荐通过明确 DTO / schema 传递数据。

---

## 23. LLM 使用位置

### 23.1 不使用 LLM 的模块

```text
MarketDataService
DataQualityGate
FeatureEngine
SetupDetector 基础规则
RiskGate 硬规则
OutcomeGraph 指标计算
Repository
Migration
```

---

### 23.2 可以使用 LLM 的模块

```text
EvidenceGraph 自然语言解释
ContraCaseGenerator
InsightExplorationGraph
FailureMemory root cause summary
SessionContextBootstrap 摘要压缩
```

---

### 23.3 LLM 输出要求

所有 LLM 输出必须基于结构化输入。
禁止输出无法追溯的数据事实。

---

## 24. 架构完成定义

本架构完成后，系统应做到：

```text
1. 数据源可替换。
2. 数据质量可审计。
3. 特征计算可测试。
4. Setup 检测可复现。
5. 决策输出可落库。
6. 结果回标可统计。
7. 规律记忆可版本化。
8. 失败教训可恢复。
9. CLI 启动可加载长期记忆。
10. 系统不会依赖聊天历史延续状态。
```

---

## 25. 下一步

阅读并实现：

```text
03_memory_system_design.md
```

重点理解：

```text
1. 什么是长期记忆。
2. 什么是 DecisionMemory / OutcomeMemory / PatternMemory / FailureMemory。
3. Pattern 如何晋升、降级、失效。
4. context_pack.md 如何成为 CLI 会话启动记忆。
```
