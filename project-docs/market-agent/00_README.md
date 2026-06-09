# Permanent Memory Market Agent

> **状态**: 设计文档。本目录定义 Market Agent 的目标架构，实施时**基于现有系统增量开发，不允许推倒重来**。
>
> **现有系统路径**:
> - Workflow graphs: `apps/trader-workflows/src/graphs/`
> - Backend API: `apps/trader-agent/backend/app/intel/api/stage1.py`
> - Database schema: `apps/trader-agent/backend/app/intel/db/schema.py`
> - CLI entry: `apps/trader-workflows/src/index.ts`（`npm run workflows --`）
> - Roadmap: `project-docs/backlog/workflow-maturity-roadmap.md`
> - 现有表: `model_decisions`, `decision_outcomes`, `insight_candidates`, `insight_candidate_outcomes`, `evaluation_reports`, `context_snapshots`, `patterns`, `market_bars`

---

## 1. 项目目标

构建一个具备永久记忆能力的工程化金融市场研究 Agent：

1. 监控固定股票池的实时行情与历史行情。
2. 基于 Longbridge、Alpha Vantage、yfinance 等数据源获取市场数据。
3. 对行情数据进行质量检查、特征计算、setup 识别。
4. 生成结构化 `DecisionEnvelope`（**已存在**: `apps/trader-workflows/src/llm/decisionEnvelope.ts`）。
5. 将每一次判断、证据、风险状态永久落库（→ `model_decisions`）。
6. 对每一次判断进行后续结果回标（→ `decision_outcomes` + `insight_candidate_outcomes`，**已实现**）。
7. 从历史判断与结果中总结规律候选（→ `InsightExplorationGraph`，**已实现**）。
8. 将经过确认的有效规律保存为长期 `pattern_memories`（**新增**，替代静态 `patterns` 表）。
9. 保存失败教训到 `failure_memories`（**新增**）。
10. 每次 CLI 启动时自动加载历史规律和失败教训（→ `session_context_packs`，**新增**）。

---

## 2. 当前项目基础（已有能力）

| 能力 | 位置 | 状态 |
|---|---|---|
| LangGraph workflow runtime | `apps/trader-workflows/src/runtime/stage1Runtime.ts` | ✅ |
| SQLite (via SQLAlchemy) | `apps/trader-agent/backend/app/intel/db/schema.py` | ✅ |
| FastAPI | `apps/trader-agent/backend/app/main.py` | ✅ |
| Longbridge CLI / SDK | `longbridge` skill | ✅ |
| Alpha Vantage | `apps/trader-agent/backend/app/intel/ingestion/` | ✅ |
| yfinance | `scripts/research/yfinance_history_snapshot.py` | ✅ |
| DecisionGraph | `apps/trader-workflows/src/graphs/00-decision/` | ✅ native LangGraph |
| OutcomeGraph | `apps/trader-workflows/src/graphs/01-outcome/` | ✅ native LangGraph |
| EvaluationGraph | `apps/trader-workflows/src/graphs/02-evaluation/` | ✅ native LangGraph |
| InsightExplorationGraph | `apps/trader-workflows/src/graphs/03-insightExploration/` | ✅ native LangGraph |
| AlphaResearchGraph v0 | `apps/trader-workflows/src/graphs/04-alphaResearch/` | ✅ native LangGraph |
| DecisionEnvelope | `apps/trader-workflows/src/llm/decisionEnvelope.ts` | ✅ |
| Rule Discovery / Lite Backtest | `apps/trader-agent/backend/app/modules/rule_discovery.py` | ✅ |
| Workflow Recording | `Stage1Runtime` run/checkpoint/audit | ✅ |

---

## 3. 核心新增模块

Market Agent 在现有基础上新增以下模块（**不重复实现已有模块**）：

```text
MarketDataService        ← 统一行情入口，包装现有 Longbridge/yfinance/Alpha Vantage
DataQualityGate          ← 新模块：数据延迟/缺失/冲突检查
FeatureEngine            ← 新模块：VWAP/EMA/ATR/volume_ratio 等特征计算
SetupDetector            ← 新模块：基于 pattern 定义检测 setup 触发
MarketMonitorGraph       ← 新守护进程风格的定时监控 graph（或作为 DecisionWorkflow 的扩展节点）
RiskGate                 ← 新模块：风险门禁
PatternMemory            ← 新表 pattern_memories + 状态机（替代静态 patterns 表）
FailureMemory            ← 新表 failure_memories
SessionContextBootstrap  ← 新模块：CLI 启动时从 pattern/failure memory 生成 context_pack
```

模块关系（**新模块用 ★ 标记，已有模块用 ✓**）：

```text
Data Sources (Longbridge / Alpha Vantage / yfinance)
        ↓
MarketDataService ★
        ↓
DataQualityGate ★
        ↓
FeatureEngine ★
        ↓
SetupDetector ★
        ↓
MarketMonitorGraph ★ ← 或扩展 DecisionGraph
        ↓
DecisionEnvelope ✓
        ↓
model_decisions ✓
        ↓
OutcomeGraph ✓ → decision_outcomes / insight_candidate_outcomes ✓
        ↓
EvaluationGraph ✓ → evaluation_reports ✓
        ↓
InsightExplorationGraph ✓ → insight_candidates ✓
        ↓
PatternMemory ★ / FailureMemory ★
        ↓
SessionContextBootstrap ★ → session_context_packs ★
        ↓
CLI Context Pack (.runtime/context/context_pack.md)
```

---

## 4. 数据库表映射

**关键原则：不重复建表。已有表直接复用或扩展。**

| Market Agent 概念 | 现有表 | 处理方式 |
|---|---|---|
| decision_memories | `model_decisions` | ✅ 复用，需要时扩展字段 |
| outcome_memories | `decision_outcomes` + `insight_candidate_outcomes` | ✅ 复用双表 |
| insight_candidates | `insight_candidates` | ✅ 已存在 |
| market_snapshots | `market_bars` | ✅ 扩展加 `source`/`quality_status` 列 |
| feature_snapshots | — | ★ 新增表 |
| setup_events | — | ★ 新增表 |
| pattern_memories | `patterns`（静态定义） | ★ 新增表，替代旧表 |
| failure_memories | — | ★ 新增表 |
| session_context_packs | — | ★ 新增表 |

**实际需要新增的表：5 张**（不是 9 张）。

---

## 5. 术语与实现映射

本目录必须先对齐根目录 `UBIQUITOUS_LANGUAGE.md`。没有写入术语表的新词不能作为实现口径。

| 文档概念 | 统一术语 / 现有实现 | 执行口径 |
|---|---|---|
| Market Agent graph / flow | **Workflow** 或 **Native LangGraph Graph** | 只有需要 LangGraph 拓扑、节点状态和 checkpoint 调试的流程才实现为 Native LangGraph Graph；其他流程可作为 Service Wrapper Workflow。 |
| CLI | **CLI** | 统一通过 `npm run workflows -- <command>` 扩展，不新增 `trader` 顶层命令。 |
| decision_memories | `model_decisions` | 文档中的概念名；物理表为 `model_decisions`，不得新建 `decision_memories` 表。 |
| outcome_memories | `decision_outcomes` + `insight_candidate_outcomes` | 文档中的概念名；物理表复用现有双表，统一称为 **Outcome** 记录。 |
| market_snapshots | `market_bars` | 文档中的概念名；物理表为 `market_bars`，不得新建 `market_snapshots` 表。 |
| PatternMemory / pattern_memories | **Promotion** 后的长期规律记录 | 只有用户确认后才能进入 active；不得自动修改 RulePack。 |
| paper_trade_candidate / live_order | **OrderIntent** / future execution scope | Market Agent MVP 不生成 live OrderIntent；monitor_only 下不得输出 paper candidate。 |

---

## 6. MVP 范围

### 6.1 监控标的

与现有 `MVP_SYMBOLS` 对齐（`apps/trader-agent/backend/app/intel/db/schema.py:10-19`）：

```text
SPY, QQQ, TSLA, NVDA, AAPL   ← MVP
COIN, BMNR, TSLL, ARKK       ← 已有，后续扩展
```

### 6.2 时间周期

```text
5m, 1d   ← MVP
1m       ← insight exploration 已支持
```

### 6.3 MVP Setup

沿用现有 `MVP_PATTERNS`（`schema.py:21-82`）并扩展：

```text
已有: higher_low_accumulation, volume_contraction_pullback, vwap_reclaim,
      relative_strength_divergence, taco_pattern
新增: OPENING_RANGE_BREAKOUT, GAP_HOLD, GAP_FADE
```

---

## 7. CLI 命令格式

**沿用现有 CLI 体系**（`npm run workflows -- <command>`），不发明新的顶层命令：

```text
npm run workflows -- outcomes run --due --json        ← OutcomeGraph ✓
npm run workflows -- eval summary --symbol TSLA --json ← EvaluationGraph ✓
npm run workflows -- insights explore --symbol TSLA --window 4h --json ← InsightExplorationGraph ✓
npm run workflows -- alpha-research --insight-id <ID> --json ← AlphaResearchGraph ✓（如已export）
```

Market Agent 新增的命令应在同一体系下扩展，例如：

```text
npm run workflows -- pattern-memory list --status active --json
npm run workflows -- pattern-memory promote --insight-id <ID> --json
npm run workflows -- context bootstrap --profile default
```

---

## 8. 非目标

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
11. **不重复建表**（已有 `model_decisions`/`decision_outcomes` 等直接复用）。

---

## 9. 推荐开发顺序（调整后）

基于现有系统已完成 M0（T010-T013），建议顺序：

```text
Phase A: pattern_memories + failure_memories + session_context_packs 表 + repository
Phase B: MarketDataService + DataQualityGate
Phase C: FeatureEngine
Phase D: SetupDetector
Phase E: MarketMonitorGraph（或 DecisionGraph 节点扩展）
Phase F: PatternMemory 状态机 + SessionContextBootstrap
Phase G: CLI 命令 + 验收测试
```

> 详细 phase 定义见 `12_development_phases.md`。

---

## 10. 文档阅读顺序

```text
00_README.md              ← 你在这里
01_system_goal_and_scope.md
02_architecture_overview.md
03_memory_system_design.md
04_database_schema.md      ← 表结构（注意表映射！）
05_market_data_service.md
06_market_monitor_graph.md
07_decision_envelope.md
08_outcome_and_evaluation.md
09_pattern_memory_and_learning.md
10_cli_context_bootstrap.md
11_api_and_cli_spec.md
12_development_phases.md
13_acceptance_tests.md
14_llm_reasoning_strategy.md ← LLM 推理策略、模型路由
```

---

## 11. 完成定义

本模块完成后，系统应做到：

1. 每次市场监控都会生成结构化判断（→ `model_decisions`）。
2. 每个判断都能永久落库。
3. 每个判断都能后续回标（→ `OutcomeGraph`）。
4. 系统能基于历史结果生成规律候选（→ `InsightExplorationGraph`）。
5. 规律可以被确认、激活、降级、失效和归档（→ `pattern_memories` 状态机）。
6. 失败教训可以长期保存（→ `failure_memories`）。
7. 每次 CLI 启动时能加载历史规律和失败教训（→ `session_context_packs`）。
8. 系统不会每次对话都从零开始。
