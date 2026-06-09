# 12. Development Phases

> **⚠️ 2026-06 现状**: 以下 Phase 已在现有系统中完成，不应重新实现：
> - Phase 5 `outcome-graph` → 已实现: `01-outcome/outcomeGraph.ts`
> - Phase 6 `evaluation-graph` → 已实现: `02-evaluation/evaluationGraph.ts`
> - Phase 3 `decision-envelope` → 已实现: `src/llm/decisionEnvelope.ts`
> - Phase 1 中的概念映射 → `decision_memories -> model_decisions`、`outcome_memories -> decision_outcomes + insight_candidate_outcomes`、`insight_candidates -> insight_candidates`

## 1. 文档目的

本文档定义 `Permanent Memory Market Agent` 的分阶段开发计划。

本项目不能一次性开发全部功能。正确方式是按最小闭环逐层推进：

```text
Memory Schema
  ↓
MarketDataService
  ↓
MarketMonitorGraph
  ↓
DecisionEnvelope
  ↓
OutcomeGraph
  ↓
EvaluationGraph
  ↓
PatternMemory
  ↓
SessionContextBootstrap
  ↓
API / CLI
  ↓
Acceptance Tests
```

每一阶段都必须有：

```text
1. 明确目标
2. 开发范围
3. 不做事项
4. 输入 / 输出
5. 验收标准
6. 测试要求
```

---

## 2. 总体开发原则

### 2.1 先骨架，后智能

优先级：

```text
1. 数据结构
2. 数据写入
3. 数据读取
4. Graph 串联
5. 结果回标
6. 规律统计
7. LLM 总结
```

不要先做复杂 LLM 推理。

---

### 2.2 先可验证，后复杂化

每个阶段必须能通过测试验证。
不能只完成自然语言解释。

---

### 2.3 先 monitor_only，后 paper trading

MVP 默认：

```text
mode = monitor_only
live_trading_enabled = false
paper_trading_requires_confirmation = true
```

本阶段不实现 live trading。

---

### 2.4 不做无关重构

开发 Agent 必须先阅读现有项目结构。
只在必要范围内新增模块，不重写已有系统。

---

### 2.5 每个阶段单独提交

推荐每个 phase 独立提交：

```text
phase-01-memory-schema        ← 部分完成：pattern/failure/context_pack 表需新增
phase-02-market-data-service  ← 新模块
phase-03-decision-envelope    ✓ 已实现（复用，不重新开发）
phase-04-market-monitor-graph ← 新 graph（或扩展 DecisionGraph 节点）
phase-05-outcome-graph        ✓ 已实现（01-outcome/）
phase-06-evaluation-graph     ✓ 已实现（02-evaluation/）
phase-07-insight-exploration  ✓ 已实现（03-insightExploration/）
phase-07-pattern-memory
phase-08-context-bootstrap
phase-09-api-cli
phase-10-alerting-observability
phase-11-integration-testing
phase-12-acceptance-tests
```

---

## 3. Phase 0：项目结构审计

## 3.1 目标

> **状态**: 已完成。审计结论见 `00_README.md` §2（已有能力清单）和 `04_database_schema.md` §3（表映射）。

在正式开发前，先理解当前项目结构，确认已有能力和可复用模块。

---

## 3.2 必须检查

```text
1. 当前 LangGraph 目录结构
2. 当前 FastAPI 路由结构
3. 当前 SQLite / migration 方式
4. 当前 workflow recording 实现
5. 当前 memory / data store 实现
6. 当前 Longbridge CLI 接入方式
7. 当前 Alpha Vantage 接入方式
8. 当前 yfinance 接入方式
9. 当前 CLI 命令注册方式
10. 当前测试目录和测试框架
```

---

## 3.3 输出

开发 Agent 应输出一份简短审计结果：

```text
1. 可复用模块
2. 需要新增模块
3. 不应改动模块
4. 潜在冲突点
5. 推荐落点目录
```

---

## 3.4 不做

本阶段不写业务代码。

---

## 3.5 验收标准

```text
1. 明确项目现有结构。
2. 明确 migration 应放在哪里。
3. 明确 CLI 命令应放在哪里。
4. 明确 FastAPI route 应放在哪里。
5. 明确数据源 adapter 应复用哪些代码。
```

---

# Phase 1：Memory Schema & Repository

## 4.1 目标

> **⚠️ 调整**: `decision_memories`/`outcome_memories`/`insight_candidates`/`market_snapshots` 复用已有表。
> 实际新增: `feature_snapshots`, `setup_events`, `pattern_memories`, `failure_memories`, `session_context_packs`（5 张）。

建立永久记忆系统的数据库表、数据模型和 repository。

这是整个系统的地基。
必须先完成。

---

## 4.2 范围

必须实现以下表：

```text
feature_snapshots
setup_events
pattern_memories
failure_memories
session_context_packs
```

必须实现以下 repository：

```text
MarketSnapshotRepository
FeatureSnapshotRepository
SetupEventRepository
DecisionMemoryRepository
OutcomeMemoryRepository
InsightCandidateRepository
PatternMemoryRepository
FailureMemoryRepository
SessionContextPackRepository
```

---

## 4.3 输入

```text
04_database_schema.md
```

---

## 4.4 输出

```text
1. migration
2. schema / model
3. repository
4. repository tests
```

---

## 4.5 不做

```text
1. 不接实时行情。
2. 不做 setup detection。
3. 不做 LLM 总结。
4. 不做 outcome labeling。
5. 不做 pattern 晋升逻辑。
6. 不做 live trading。
```

---

## 4.6 验收标准

```text
1. migration 可重复运行。
2. 所有表可创建。
3. 所有索引可创建。
4. repository 支持 create / get / list / update。
5. session_context_pack 可保存并读取 latest。
6. pattern status 可更新。
7. failure status 可更新。
8. 不破坏已有 workflow recording。
9. 单元测试通过。
```

---

## 4.7 推荐测试

```text
apps/trader-agent/backend/tests/test_market_agent_memory_schema.py
apps/trader-agent/backend/tests/test_market_agent_decision_repository.py
apps/trader-agent/backend/tests/test_market_agent_outcome_repository.py
apps/trader-agent/backend/tests/test_market_agent_pattern_memory_repository.py
apps/trader-agent/backend/tests/test_market_agent_failure_memory_repository.py
apps/trader-agent/backend/tests/test_market_agent_session_context_pack_repository.py
```

---

# Phase 2：MarketDataService + DataQualityGate

## 5.1 目标

建立统一行情数据入口，复用已有 Longbridge / Alpha Vantage / yfinance 接入。

---

## 5.2 范围

必须实现：

```text
1. MarketDataRequest
2. OHLCVBar
3. MarketDataResponse
4. DataQualityReport
5. SourceRouter
6. MarketDataAdapter interface
7. LongbridgeAdapter
8. AlphaVantageAdapter
9. YFinanceAdapter
10. DataNormalizer
11. DataQualityGate
12. MarketDataService
13. `market_bars` 写入（概念名：market_snapshots）
```

---

## 5.3 输入

```text
05_market_data_service.md
```

---

## 5.4 输出

```text
1. 标准化行情数据结构
2. 数据源路由
3. 数据源 adapter
4. 数据质量报告
5. 写入 `market_bars`（概念名：market_snapshots）
6. 数据源健康检查基础能力
```

---

## 5.5 不做

```text
1. 不做 FeatureEngine。
2. 不做 SetupDetector。
3. 不做 DecisionEnvelope。
4. 不做 OutcomeGraph。
5. 不做 PatternMemory。
6. 不做交易逻辑。
```

---

## 5.6 验收标准

```text
1. 可以对 SPY / QQQ / TSLA / NVDA / AAPL 拉取 5m / 1d 数据。
2. 可以根据 mode / timeframe 路由到合适数据源。
3. 主数据源失败时可以 fallback。
4. 不同数据源返回值可以标准化为 OHLCVBar。
5. DataQualityGate 可以输出 pass / warning / failed / blocked。
6. 行情快照可以写入现有 `market_bars`。
7. failed / blocked 数据不会被后续 setup 使用。
8. 单元测试通过。
```

---

## 5.7 推荐测试

```text
test_source_router_realtime_priority
test_source_router_historical_daily_priority
test_normalizer_ohlcv_fields
test_quality_gate_empty_bars_failed
test_quality_gate_abnormal_ohlc_blocked
test_quality_gate_stale_realtime_failed
test_market_data_service_fallback
```

---

# Phase 3：FeatureEngine

## 6.1 目标

实现基础特征计算，为 setup detection 提供结构化输入。

---

## 6.2 范围

必须实现 MVP 特征：

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

## 6.3 输入

```text
MarketDataResponse
DataQualityReport
```

---

## 6.4 输出

```text
FeatureSnapshot
feature_snapshots row
```

---

## 6.5 不做

```text
1. 不做 setup 判断。
2. 不做 LLM 解释。
3. 不做 outcome labeling。
4. 不做 pattern memory。
```

---

## 6.6 验收标准

```text
1. 可以从 5m OHLCV 计算 VWAP。
2. 可以计算 EMA 9 / 20 / 50。
3. 可以计算 ATR。
4. 可以计算 volume_ratio。
5. 可以计算 relative_strength_spy / relative_strength_qqq。
6. 数据质量 failed / blocked 时不生成高置信 feature。
7. feature_snapshots 可以写入数据库。
8. 单元测试通过。
```

---

# Phase 4：DecisionEnvelope Schema & Validation（复用 / 适配）

## 7.1 目标

复用已实现的 `DecisionEnvelope`，补齐 Market Agent 所需的校验、字段映射和验收测试。

---

## 7.2 范围

必须复用或补强：

```text
1. existing DecisionEnvelope model
2. existing DecisionAction enum
3. existing DecisionStatus enum
4. RiskGateStatus compatibility mapping
5. Evidence schema compatibility
6. Condition schema compatibility
7. RiskNote schema compatibility
8. SourceQuality schema compatibility
9. Validation logic补强
10. `model_decisions` mapping（概念名：decision_memories）
```

---

## 7.3 输入

```text
07_decision_envelope.md
```

---

## 7.4 输出

```text
DecisionEnvelope compatibility patch
DecisionEnvelopeValidator coverage
`model_decisions` mapping
```

---

## 7.5 不做

```text
1. 不做行情获取。
2. 不做 setup detection。
3. 不做 OutcomeGraph。
4. 不做 PatternMemory。
5. 不做 live trading。
```

---

## 7.6 验收标准

```text
1. 可以创建合法 DecisionEnvelope。
2. 非 ignore 判断缺少 evidence 时校验失败。
3. 非 ignore 判断缺少 invalidation_conditions 时校验失败。
4. confidence 超出 0-1 时校验失败。
5. monitor_only 模式不能输出 paper_trade_candidate / live_order。
6. DecisionEnvelope 可以映射为 `model_decisions` row（概念名：decision_memories）。
7. DecisionEnvelope 可以 JSON 序列化。
8. 单元测试通过。
```

---

# Phase 5：MarketMonitorGraph MVP

## 8.1 目标

实现 `MarketMonitorGraph` MVP，串联行情、质量检查、特征、setup、证据、风控和决策落库。

---

## 8.2 范围

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

## 8.3 MVP Setup

必须支持：

```text
VWAP_RECLAIM
RELATIVE_STRENGTH_PULLBACK
OPENING_RANGE_BREAKOUT
```

---

## 8.4 输入

```text
06_market_monitor_graph.md
```

---

## 8.5 输出

```text
1. DecisionEnvelope
2. setup_events
3. model_decisions（概念名：decision_memories）
4. failure_memories 候选
5. CLI / API 可调用 graph
```

---

## 8.6 不做

```text
1. 不做 OutcomeGraph。
2. 不做 PatternMemory 晋升。
3. 不做 live trading。
4. 不做复杂期权分析。
5. 不做全市场扫描。
6. 不接入新数据源。
```

---

## 8.7 验收标准

```text
1. CLI 可以运行 npm run workflows -- market-monitor run。
2. 可以处理 SPY / QQQ / TSLA / NVDA / AAPL。
3. 数据质量 failed / blocked 时不进入 setup detection。
4. 可以生成 feature snapshot。
5. 可以识别 3 类 MVP setup。
6. 可以生成 evidence graph。
7. 可以生成 contra case。
8. 可以执行 risk gate。
9. 可以生成 DecisionEnvelope。
10. 所有 DecisionEnvelope 都写入 `model_decisions`（概念名：decision_memories）。
11. 不输出 live_order。
12. 单元测试和集成测试通过。
```

---

# Phase 6：OutcomeGraph MVP（复用 / 验收补强）

## 9.1 目标

复用已实现的 OutcomeGraph，对历史 `DecisionEnvelope` 进行后续行情结果标注，并补齐 Market Agent 所需的映射和测试。

---

## 9.2 范围

必须复用或补强：

```text
1. load_unlabeled_decisions
2. resolve_outcome_window
3. fetch_future_price_window
4. compute_reference_price
5. check_entry_hit
6. check_invalidation_hit
7. compute_mfe_mae
8. assign_outcome_label
9. persist outcome to `decision_outcomes` / `insight_candidate_outcomes`
```

---

## 9.3 支持窗口

MVP 支持：

```text
30m
2h
1d
```

---

## 9.4 输出

```text
`decision_outcomes` / `insight_candidate_outcomes`（概念名：outcome_memories）
```

---

## 9.5 不做

```text
1. 不做 PatternMemory 晋升。
2. 不做 live trading。
3. 不做复杂回测引擎。
4. 不做全市场扫描。
5. 不做深度学习训练。
```

---

## 9.6 验收标准

```text
1. 可以读取未回标的 `model_decisions`（概念名：decision_memories）。
2. 可以对 30m / 2h / 1d 进行 outcome window 解析。
3. 可以拉取后续价格窗口。
4. 可以计算 MFE / MAE / final_return。
5. 可以判断 hit_entry / hit_invalidation。
6. 可以生成 outcome_label。
7. 可以写入 `decision_outcomes` / `insight_candidate_outcomes`（概念名：outcome_memories）。
8. 缺数据时 outcome_label = unknown。
9. 所有计算不依赖 LLM。
10. 单元测试通过。
```

---

# Phase 7：EvaluationGraph MVP（复用 / 验收补强）

## 10.1 目标

复用已实现的 `EvaluationGraph`，对 outcome 结果进行聚合统计，并补齐 Market Agent 所需的 repository 映射、CLI 接口和验收测试。

---

## 10.2 范围

必须补齐：

```text
1. existing EvaluationGraph adapter
2. load_outcomes mapping
3. group_by_dimension compatibility
4. compute_metrics coverage
5. detect_degradation coverage
6. generate_insight_candidates mapping
7. persist_insight_candidates mapping
```

---

## 10.3 聚合维度

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

---

## 10.4 输出

```text
EvaluationResult
insight_candidates
failure_memory 候选
```

---

## 10.5 不做

```text
1. 不自动晋升 active pattern。
2. 不修改 MarketMonitorGraph 规则。
3. 不做 live trading。
4. 不做深度学习训练。
```

---

## 10.6 验收标准

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

# Phase 8：PatternMemory MVP

## 11.1 目标

实现规律记忆系统，使 insight_candidate 可以经确认后晋升为 pattern_memory，并支持状态机。

---

## 11.2 范围

必须实现：

```text
1. InsightCandidateRepository
2. PatternMemoryRepository
3. FailureMemoryRepository
4. Pattern 状态机
5. promote-pattern CLI
6. degrade-pattern CLI
7. active / degraded pattern 查询
8. active warning 查询
```

---

## 11.3 Pattern 状态

```text
candidate
testing
active
degraded
invalidated
archived
```

---

## 11.4 不做

```text
1. 不做实时行情获取。
2. 不做 MarketMonitorGraph。
3. 不做 OutcomeGraph。
4. 不做 live trading。
5. 不做向量数据库。
6. 不做复杂深度学习训练。
```

---

## 11.5 验收标准

```text
1. 可以创建 insight_candidate。
2. insight_candidate 默认不是 active pattern。
3. 用户确认后可以 promote 为 pattern_memory。
4. pattern_memory 支持 candidate / testing / active / degraded / invalidated / archived。
5. active pattern 可以被查询。
6. degraded pattern 可以被查询。
7. failure_memory 可以保存 active_warning。
8. active warning 可以被查询。
9. archived pattern 默认不进入 context_pack。
10. 所有状态变更有测试。
```

---

# Phase 9：SessionContextBootstrap MVP

## 12.1 目标

实现 CLI 启动上下文恢复机制，使 Agent 每次启动时能加载长期记忆。

---

## 12.2 范围

必须实现：

```text
1. ContextPackBuildRequest
2. ContextPackBuildResult
3. ContextPackBuilder
4. load_trading_mandate
5. resolve_watchlist
6. load_active_patterns
7. load_degraded_patterns
8. load_active_warnings
9. load_recent_decisions
10. render_markdown
11. write_context_pack_file
12. persist_session_context_pack
13. `context bootstrap` workflow CLI
```

---

## 12.3 输出

```text
.runtime/context/context_pack.md
session_context_packs row
```

---

## 12.4 不做

```text
1. 不做实时行情获取。
2. 不做 setup detection。
3. 不做 OutcomeGraph。
4. 不做 Pattern 晋升。
5. 不做 live trading。
6. 不做复杂向量检索。
```

---

## 12.5 验收标准

```text
1. 可以运行 npm run workflows -- context bootstrap --profile default。
2. 可以生成 .runtime/context/context_pack.md。
3. context_pack 包含 Trading Mandate。
4. context_pack 包含 Watchlist。
5. context_pack 包含 Active Patterns。
6. context_pack 包含 Degraded Patterns。
7. context_pack 包含 Active Warnings。
8. context_pack 包含 Recent Decisions。
9. context_pack 包含 Required Behavior。
10. context_pack 包含 Prohibited Behavior。
11. context_pack 写入 session_context_packs。
12. source_memory_ids_json 可追溯。
13. 缺少 pattern / warning / decision 时仍能生成安全默认上下文。
```

---

# Phase 10：API and CLI MVP

## 13.1 目标

实现 MVP 阶段所需 CLI 命令与 FastAPI 接口。
其中 `insights explore` 复用已实现的 `InsightExplorationGraph`，本阶段只补命令接线、参数映射和验收测试。

---

## 13.2 CLI 范围

必须实现：

```text
npm run workflows -- memory init
npm run workflows -- context bootstrap
npm run workflows -- market-monitor run
npm run workflows -- decisions list
npm run workflows -- outcomes run --due
npm run workflows -- eval summary
npm run workflows -- insights explore
npm run workflows -- pattern-memory list
npm run workflows -- pattern-memory promote
npm run workflows -- failure-memory list
```

---

## 13.3 API 范围

必须实现：

```text
POST /api/market-monitor/run
POST /api/memory/context-pack/build
POST /api/memory/outcomes/label
POST /api/memory/evaluate
POST /api/memory/patterns/promote
```

---

## 13.4 不做

```text
1. 不做 live trading API。
2. 不做自动下单 CLI。
3. 不做复杂权限系统。
4. 不做 Web Dashboard。
5. 不做新数据源接入。
```

---

## 13.5 验收标准

```text
1. workflow CLI 可以初始化数据库。
2. workflow CLI 可以生成 context_pack.md。
3. workflow CLI 可以运行 Market Monitor Workflow。
4. workflow CLI 可以查询 `model_decisions`（概念名：DecisionMemory）。
5. workflow CLI 可以执行 outcome labeling。
6. workflow CLI 可以执行 evaluation。
7. workflow CLI 可以生成 insight_candidate。
8. workflow CLI 可以在用户确认后 promote pattern。
9. API 可以触发 monitor run。
10. API 可以触发 context pack build。
11. API 可以触发 outcome labeling。
12. API 可以触发 evaluation。
13. API promote pattern 未确认时必须拒绝。
14. 所有关键命令支持 --json。
15. 所有安全约束测试通过。
```

---

# Phase 11：Acceptance Tests

## 14.1 目标

建立系统级验收测试，确保整个永久记忆闭环跑通。

---

## 14.2 必须覆盖的最小闭环

```text
npm run workflows -- memory init
  ↓
npm run workflows -- context bootstrap --profile default
  ↓
npm run workflows -- market-monitor run --symbols SPY,QQQ,TSLA,NVDA,AAPL --timeframes 5m,1d
  ↓
生成 DecisionEnvelope
  ↓
写入 `model_decisions`（概念名：decision_memories）
  ↓
npm run workflows -- outcomes run --due --window 2h
  ↓
写入 `decision_outcomes` / `insight_candidate_outcomes`（概念名：outcome_memories）
  ↓
npm run workflows -- eval summary --setup VWAP_RECLAIM --window 2h
  ↓
生成 EvaluationResult
  ↓
npm run workflows -- insights explore --setup VWAP_RECLAIM --symbol TSLA
  ↓
生成 insight_candidate
  ↓
npm run workflows -- pattern-memory promote --candidate-id insight_001 --confirm
  ↓
写入 pattern_memories
  ↓
npm run workflows -- context bootstrap --profile default
  ↓
context_pack.md 包含 active pattern
```

---

## 14.3 不做

```text
1. 不接真实交易。
2. 不测试 live_order。
3. 不依赖实时 API。
4. 不使用不可控外部行情作为唯一测试来源。
```

---

## 14.4 验收标准

```text
1. 最小闭环可通过 mock 数据跑通。
2. 所有关键表有数据写入。
3. 所有关键 CLI 命令可执行。
4. context_pack 能加载新晋升 pattern。
5. 数据质量 failed 时系统停止 setup detection。
6. promote pattern 未确认时被拒绝。
7. monitor_only 模式不输出 live_order。
8. degraded pattern 进入 context_pack 的 Degraded Patterns。
9. active_warning 进入 context_pack 的 Active Warnings。
10. 测试全部通过。
```

---

# 15. 推荐开发顺序总表

| 顺序 | Phase                      | 产物             | 是否阻塞后续 |
| -- | -------------------------- | -------------- | ------ |
| 0  | 项目结构审计                     | 审计结果           | 是      |
| 1  | Memory Schema & Repository | 表 / repository | 是      |
| 2  | MarketDataService          | 行情服务           | 是      |
| 3  | FeatureEngine              | 特征快照           | 是      |
| 4  | DecisionEnvelope           | 核心输出对象         | 是      |
| 5  | MarketMonitorGraph         | 监控判断闭环         | 是      |
| 6  | OutcomeGraph               | 结果回标           | 是      |
| 7  | EvaluationGraph            | 统计评估           | 是      |
| 8  | PatternMemory              | 规律记忆           | 是      |
| 9  | SessionContextBootstrap    | CLI 启动记忆       | 是      |
| 10 | API and CLI                | 用户入口           | 否      |
| 11 | Acceptance Tests           | 系统验收           | 是      |

---

# 16. 开发 Agent 执行规则

开发 Agent 必须遵守：

```text
1. 每个 Phase 先阅读对应文档。
2. 每个 Phase 只实现当前范围。
3. 不做无关重构。
4. 不引入未经确认的大型依赖。
5. 不实现 live trading。
6. 不绕过用户确认。
7. 不让 LLM 参与确定性计算。
8. 每个 Phase 必须补测试。
9. 每个 Phase 完成后输出变更摘要。
10. 每个 Phase 完成后说明验证命令和测试结果。
```

---

# 17. 当前最优下一步

从 `Phase 0` 开始：

```text
项目结构审计
```

然后进入：

```text
Phase 1：Memory Schema & Repository
```

不要跳到 MarketMonitorGraph。
原因：

```text
没有永久记忆表和 repository，后续所有 DecisionEnvelope、Outcome、Pattern 都无处落库。
```

第一张开发任务卡：

```text
Task 001：Memory Schema & Repository
```

成功后再继续：

```text
Task 002：MarketDataService + DataQualityGate
```
