# Permanent Memory Market Agent

## 文档入口

本目录用于指导开发 Agent 构建一个具备永久记忆能力的工程化金融市场监控系统。

系统目标不是做一个一次性股票分析聊天机器人，而是构建一个可以长期运行、持续记录、持续复盘、持续总结规律，并在每次 CLI 会话启动时恢复历史经验的金融研究 Agent。

---

## 1. 项目目标

构建一个本地金融 Market Agent，使其具备以下能力：

1. 监控固定股票池的实时行情与历史行情。
2. 基于 Longbridge、Alpha Vantage、yfinance 等数据源获取市场数据。
3. 对行情数据进行质量检查、特征计算、setup 识别。
4. 生成结构化 `DecisionEnvelope`，而不是散文式交易建议。
5. 将每一次判断、证据、反方观点、风险状态永久落库。
6. 对每一次判断进行后续结果回标。
7. 从历史判断与结果中总结规律候选。
8. 将经过确认的有效规律保存为长期 `PatternMemory`。
9. 保存失败教训与失效规律。
10. 每次 CLI 启动时自动生成 `context_pack.md`，让 Agent 记得过去学到的规律、失败教训和风险边界。

---

## 2. 当前项目基础

项目已具备以下基础能力：

* LangGraph / workflow graph
* SQLite
* FastAPI
* Memory / Data Store
* Workflow Recording
* Longbridge CLI
* Alpha Vantage
* yfinance
* DecisionGraph
* OutcomeGraph
* EvaluationGraph
* InsightExplorationGraph

本模块应基于现有能力增量开发，不允许推倒重来。

---

## 3. 核心新增模块

本阶段主要新增以下模块：

```text
MarketDataService
DataQualityGate
FeatureEngine
SetupDetector
MarketMonitorGraph
DecisionEnvelope
MemoryGraph
OutcomeGraph
PatternMemory
FailureMemory
SessionContextBootstrap
```

模块关系：

```text
Data Sources
  ├─ Longbridge
  ├─ Alpha Vantage
  └─ yfinance
        ↓
MarketDataService
        ↓
DataQualityGate
        ↓
FeatureEngine
        ↓
MarketMonitorGraph
        ↓
DecisionEnvelope
        ↓
MemoryGraph
        ↓
OutcomeGraph
        ↓
EvaluationGraph
        ↓
PatternMemory / FailureMemory
        ↓
SessionContextBootstrap
        ↓
CLI Context Pack
```

---

## 4. MVP 范围

### 4.1 监控标的

MVP 只监控以下标的：

```text
SPY
QQQ
TSLA
NVDA
AAPL
```

后续可扩展：

```text
COIN
BMNR
其他用户指定标的
```

---

### 4.2 时间周期

MVP 使用：

```text
5m
1d
```

暂不做：

```text
1s / tick 级别数据
高频交易
全市场扫描
复杂期权链分析
自动实盘交易
```

---

### 4.3 MVP Setup

先实现 3 个 setup：

```text
VWAP_RECLAIM
RELATIVE_STRENGTH_PULLBACK
OPENING_RANGE_BREAKOUT
```

后续再扩展：

```text
GAP_HOLD
GAP_FADE
DAILY_BREAKOUT_RETEST
FAILED_BREAKOUT
PANIC_RECOVERY
EARNINGS_GAP_FOLLOW_THROUGH
```

---

## 5. 非目标

本阶段明确不做：

1. 不做自动实盘下单。
2. 不做全市场扫描。
3. 不做高频交易。
4. 不做复杂深度学习训练。
5. 不做收益承诺。
6. 不做不可审计的黑箱预测。
7. 不把 30 年历史数据塞进 LLM 上下文。
8. 不让 LLM 直接决定交易动作。
9. 不让一次成功案例升级为永久有效规律。
10. 不允许系统自动绕过用户确认。

---

## 6. 关键设计原则

### 6.1 数据库负责记忆，LLM 负责解释

系统不能依赖聊天历史记住市场规律。

正确设计：

```text
Raw Market Data → 数据库 / Parquet / DuckDB
Feature Data → Feature Store
Decision Memory → SQLite
Outcome Memory → SQLite
Pattern Memory → SQLite
Failure Memory → SQLite
Session Context → context_pack.md
```

LLM 只读取这些结构化记忆，并进行解释、总结、反方验证和假设生成。

---

### 6.2 每个判断必须可回溯

每个 `DecisionEnvelope` 必须能回溯到：

1. 当时的行情数据
2. 当时的数据源
3. 数据质量状态
4. 特征快照
5. setup 触发条件
6. 支持证据
7. 反方证据
8. 风险门禁结果
9. 后续结果回标

---

### 6.3 每条规律必须可证伪

任何进入 `PatternMemory` 的规律都必须包含：

1. 适用标的
2. 适用周期
3. 适用市场状态
4. 触发条件
5. 失效条件
6. 样本数量
7. 历史表现
8. 最近表现
9. 当前状态
10. 版本号
11. 最后复查时间

---

### 6.4 失败记忆和成功规律同等重要

系统必须记录：

1. 失败 setup
2. 错误解释
3. 数据源异常
4. 风控拦截
5. 规律衰退
6. 过拟合规律
7. 宏观事件误判
8. source conflict
9. data quality failure

失败记忆必须进入 CLI 启动上下文包。

---

## 7. 默认安全边界

MVP 默认：

```text
mode = monitor_only
live_trading = disabled
paper_trading = requires_user_confirmation
```

禁止行为：

```text
自动实盘下单
自动扩大权限
自动绕过风控
自动删除历史规律
自动把 candidate pattern 晋升为 active pattern
自动保存敏感交易权限
```

---

## 8. 文档阅读顺序

开发 Agent 应按以下顺序阅读和执行：

```text
00_README.md
01_system_goal_and_scope.md
02_architecture_overview.md
03_memory_system_design.md
04_database_schema.md
05_market_data_service.md
06_market_monitor_graph.md
07_decision_envelope.md
08_outcome_and_evaluation.md
09_pattern_memory_and_learning.md
10_cli_context_bootstrap.md
11_api_and_cli_spec.md
12_development_phases.md
13_acceptance_tests.md
```

---

## 9. 推荐开发顺序

不要先做复杂策略。
先实现永久记忆骨架。

推荐顺序：

```text
Phase 1：Memory Schema & Repository
Phase 2：MarketDataService + DataQualityGate
Phase 3：FeatureEngine
Phase 4：SetupDetector
Phase 5：MarketMonitorGraph
Phase 6：OutcomeGraph
Phase 7：PatternMemory
Phase 8：SessionContextBootstrap
```

---

## 10. 第一张任务卡

### Task 001：Memory Schema & Repository

目标：

```text
实现永久记忆系统的数据库表和基础 repository。
```

范围：

```text
decision_memories
outcome_memories
insight_candidates
pattern_memories
failure_memories
session_context_packs
```

不做：

```text
不接实时行情
不做 setup detection
不做 LLM 总结
不做 live trading
```

验收标准：

```text
1. migration 可运行。
2. 所有 memory 表可创建。
3. 每个 repository 支持 create / get / list / update。
4. 单元测试通过。
5. 不破坏现有 workflow recording。
```

---

## 11. 最小闭环

最终本阶段要跑通：

```text
trader memory init
  ↓
trader monitor run --symbols SPY,QQQ,TSLA,NVDA,AAPL --timeframes 5m,1d
  ↓
生成 DecisionEnvelope
  ↓
写入 decision_memories
  ↓
trader memory label-outcomes --window 2h
  ↓
写入 outcome_memories
  ↓
trader memory generate-insights --setup VWAP_RECLAIM --symbol TSLA
  ↓
生成 insight_candidate
  ↓
trader memory promote-pattern --candidate-id insight_001
  ↓
写入 pattern_memories
  ↓
trader memory bootstrap --profile default
  ↓
生成 .runtime/context/context_pack.md
  ↓
下一次 CLI 会话自动加载历史规律
```

---

## 12. 完成定义

本模块完成后，系统应做到：

1. 每次市场监控都会生成结构化判断。
2. 每个判断都能永久落库。
3. 每个判断都能后续回标。
4. 系统能基于历史结果生成规律候选。
5. 规律可以被确认、激活、降级、失效和归档。
6. 失败教训可以长期保存。
7. 每次 CLI 启动时，Agent 能加载历史规律和失败教训。
8. 系统不会每次对话都从零开始。
