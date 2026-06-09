# Waylandz 全站阅读对自学习量化交易 Agent 系统的架构启发

> 建议归档路径：`docs/architecture/waylandz-agent-quant-system-design.md`  
> 适用项目：`trader-workflow`  
> 当前项目基础：`LangGraph + SQLite + FastAPI + Memory + Data Store + Workflow Recording + yfinance / AlphaVantage / Longbridge tools`  
> 日期：2026-06-04  
> 状态：Architecture Research / Design Proposal

---

## 0. 文档目标

本文整理本轮围绕 Waylandz 网站内容的系统性讨论，包括其 Blog 与 Books 中关于：

- 生产级 Agent Runtime
- AI Agent Architecture
- Shannon 多智能体平台
- Kocoro 记忆系统
- Dnalyaw AI 量化交易系统
- AI Quantitative Trading
- Context Engineering
- Tool Design
- Replay / Observability / Budget Control
- Backtest-to-Live Gap

等内容对我们当前自学习量化交易 AI Agent 系统的启发。

本文不是普通博客摘要，而是将 Waylandz 的系统思想映射到我们当前 `trader-workflow` 项目的工程蓝图中，明确：

1. 我们当前系统已经做到哪里。
2. 与更成熟的 Agent / Quant 系统相比差在哪里。
3. 哪些设计原则应吸收。
4. 哪些架构不应过早照搬。
5. 下一阶段最小有效改造是什么。

---

## 1. 总体结论

Waylandz 体系对我们的最大启发不是“换框架”，而是：

> 我们当前已经具备 Agent 原型系统骨架，但还缺少生产级 Agent 系统的硬约束：可复现执行、风险隔离、数据质量门、上下文治理、预算控制、可审计记忆、回测/纸面交易校准，以及 LLM 与交易执行之间的物理隔离。

我们当前已有：

```text
LangGraph
SQLite
FastAPI
Memory
Data Store
Workflow Recording
Tools: yfinance / AlphaVantage / Longbridge
LangGraph Studio 可视化运行 decision graph
Backend 可查询每次 record
```

这已经不是简单 demo。

但它仍处于：

```text
Agentic Trading Research Workflow Prototype
```

而不是：

```text
Production-grade Risk-Gated Trading Research System
```

下一阶段的关键不是继续堆工具，也不是立刻引入 Temporal / Rust / Go / Kubernetes / 多数据库，而是先把系统从：

```text
Agent 能跑出一个判断
```

升级为：

```text
系统能约束、审计、复盘、校准一个判断
```

最小有效改造是：

```text
DecisionObject
+ RunTrace v2
+ DataQualityGate
+ RiskGate
+ processedContext
+ PaperTradeTracker
```

---

## 2. 对 Waylandz 内容体系的重新理解

Waylandz 的内容不是零散博客，而是一个围绕 Agent 与 Quant 系统工程的知识体系。

其核心主线可以压缩为：

> Agent 不是聊天框，不是 prompt，不是工具调用集合，也不是一个万能模型。  
> Agent 是目标、工具、记忆、边界、预算、权限、可观测、可恢复、可审计共同组成的运行系统。

换句话说，Waylandz 关注的不是：

```text
How to call LLM?
```

而是：

```text
How to run agents safely and repeatedly in production?
```

对我们最重要的启发是：

```text
模型能力只是系统的一层。
真正的护城河在：
- 业务状态
- 专有数据
- 工作流
- 风控
- 验证
- 复盘
- 记忆蒸馏
- 用户高频使用界面
```

---

## 3. 当前项目定位判断

### 3.1 当前优势

我们已经具备以下基础：

```text
1. 有 LangGraph decision workflow
2. 有 FastAPI backend
3. 有 SQLite 持久化
4. 有 Memory / Data Store
5. 有 Workflow Recording
6. 已接入 yfinance / AlphaVantage / Longbridge
7. 可通过 LangGraph Studio 在网页中运行 decision graph
8. Backend 能查询每次 workflow record
```

这些能力意味着项目已经从“概念验证”进入“可观测原型”。

### 3.2 当前短板

但 Waylandz 视角下，我们当前短板也很明确：

| 当前已有 | 不等于 | 还缺什么 |
|---|---|---|
| workflow recording | replayable trace | 可复现、可比较、可回归测试 |
| memory | learning system | 结构化案例、结果追踪、记忆蒸馏 |
| tools 接入 | 数据可信 | normalize、quality flags、source agreement |
| agent decision | 可执行交易计划 | DecisionObject、RiskGate、人工确认 |
| graph workflow | production runtime | checkpoint、budget、observability、approval |
| LLM 反思 | 自学习 | prediction → outcome → attribution → memory update |
| 单标的分析 | 组合风险控制 | PortfolioState、Exposure、Correlation |
| 多数据源 | 高质量数据 | DataQualityGate |

因此，下一步不是“大重构”，而是补齐运行纪律。

---

## 4. 核心架构原则

### 4.1 LLM 是研究主脑，不是执行主权者

Waylandz 的 Dnalyaw 量化系统中有一条关键原则：

```text
LLMs produce features, they do not produce alpha.
```

对我们来说，这句话应转化为架构原则：

```text
LLM 可以参与研究、解释、归因、生成候选机会；
LLM 不应直接下单、修改仓位、覆盖止损、绕过风控。
```

#### LLM 可以做

```text
- 新闻理解
- 交易员观点抽取
- 催化事件总结
- 技术形态解释
- 反方观点生成
- 交易计划草拟
- 复盘归因
- memory distillation
- workflow routing
```

#### LLM 不应该做

```text
- 自动下单
- 自动加仓
- 自动取消止损
- 自动扩大仓位
- 自动绕过风控
- 自动修改风险参数
```

更准确的系统终态应是：

```text
Risk-Gated Trading Research Agent
```

而不是：

```text
Fully Autonomous Trading Bot
```

---

### 4.2 风险层必须独立，并拥有 veto 权

交易系统中，RiskGate 不能只是一个 prompt 里的提醒。

错误做法：

```text
Prompt: 请注意风险。
Agent: 我认为风险可控，可以买入。
```

正确做法：

```text
DecisionObject
    ↓
RiskGate
    ↓
APPROVE / REJECT / REDUCE / WATCH_ONLY / NEEDS_HUMAN_CONFIRMATION
```

RiskGate 是独立模块，不由 LLM 自己决定。

MVP 阶段即可先实现 rule-based RiskGate：

```text
1. 数据质量不足：只能 WATCH_ONLY
2. 财报 / CPI / FOMC 前：强制降级
3. 杠杆 ETF：提高风险权重
4. 单笔最大亏损：不得超过账户权益固定比例
5. 连续亏损后：自动降低 confidence ceiling
6. Agent evidence 不足：禁止输出 BUY
7. counter-evidence 未列出：决策无效
8. 没有 invalidation 条件：决策无效
```

这比“让模型自己谨慎一点”可靠得多。

---

### 4.3 数据质量门优先于继续接更多数据源

我们现在已经接入：

```text
yfinance
AlphaVantage
Longbridge
```

下一步不应急着接更多 API，而是先做：

```text
Raw Provider Data
    ↓
Normalize
    ↓
Quality Gate
    ↓
Canonical Market Snapshot
    ↓
Feature Store
    ↓
Agent Reasoning
```

Agent 不应直接读取裸 provider 数据。

它应该读取经过质量校验的统一快照。

#### Canonical Market Snapshot 建议结构

```python
class MarketSnapshot:
    symbol: str
    timestamp: datetime
    source: str
    price: float
    bid: float | None
    ask: float | None
    volume: int | None
    previous_close: float | None
    provider_latency_ms: int | None
    source_agreement_score: float
    quality_flags: list[str]
    usable_for_decision: bool
```

#### 质量标签

```text
STALE_DATA
MISSING_BID_ASK
SOURCE_DISAGREEMENT
PRICE_SPIKE
LOW_VOLUME
AFTER_HOURS
SPLIT_ADJUSTMENT_SUSPECTED
API_RATE_LIMITED
INSUFFICIENT_HISTORY
```

当 `usable_for_decision = false` 时，Agent 必须降级输出。

---

### 4.4 Context Engineering 是 Agent 稳定性的核心

Waylandz 的 Agent Architecture 中一个关键判断是：

```text
Context window is RAM.
```

Anthropic 的 agent 工程材料强调简单可组合 workflow、清晰工具边界、环境
ground truth、人工 checkpoint 和充分测试。LangGraph / OpenAI Agents SDK
等 runtime 文档也把 persistence、trace、guardrail、sandbox、human interrupt
作为生产化能力。落到本项目，Context Engineering 不是扩大 prompt，而是把
上下文变成可选择、可压缩、可追溯、可复原的工程对象。

上下文窗口不是垃圾桶，也不是越大越好。长上下文容量不能替代结构化治理。

很多 Agent 失败不是模型不聪明，而是：

```text
- 上下文污染
- 记忆选择错误
- 工具结果过长 (tool result bloat)
- 历史信息过时
- 任务边界不清
- scratchpad 与长期记忆混杂
- 迭代压缩导致 context collapse
```

因此，我们需要从"存储 memory"升级为"治理 context"。

#### 建议新增 Context Engineering Layer

```text
Context Engineering Layer
├── ProcessedContextBuilder
├── MemorySelector
├── ToolResultCompressor
├── ScratchpadManager
├── StablePromptPrefix
├── ContextBudgetController
└── SubagentContextIsolation
```

#### 交易任务上下文分层

```text
1. Stable System Context
   - 交易原则
   - 风控边界
   - 输出 schema
   - 不可违反规则

2. Session Context
   - 本轮任务目标
   - 当前标的
   - 当前市场环境

3. Market Context
   - canonical snapshot
   - quality flags
   - recent regime

4. Memory Context
   - 该标的长期 thesis
   - 用户历史偏好
   - 相关失败案例

5. Tool Context
   - 最新工具调用结果
   - 压缩后的关键数据

6. Scratchpad Context
   - 当前 workflow 中间状态
   - 不长期保存
```

目标是让 Agent 每次“知道该知道的”，而不是“看见所有历史”。

---

### 4.5 Workflow Recording 必须升级为 Replayable Trace

我们已经有 workflow recording，这是正确方向。

但 recording 只是第一步。

要升级为：

```text
Workflow Recording
    ↓
Run Trace
    ↓
Replayable Trace
    ↓
Decision Diff
    ↓
Regression Eval
```

未来每一次交易建议都要能回答：

```text
1. 当时输入是什么？
2. 当时使用了哪些 memory？
3. 调用了哪些 tool？
4. 每个 tool 返回了什么？
5. 哪个 node 生成了什么中间结论？
6. 使用了哪个模型？
7. 使用了哪个 prompt version？
8. 成本和 latency 是多少？
9. 最终 DecisionObject 是什么？
10. RiskGate 如何裁决？
11. 人是否审核？
12. 之后市场结果如何？
```

这是“自学习”的地基。

---

### 4.6 Budget Control 不是省钱功能，而是 Agent 控制系统

预算系统不仅用于控制 token 成本，也用于防止 Agent：

```text
- 无限循环
- 过度研究
- 无边界调用工具
- 在低价值任务上消耗强模型
- 遇到异常时持续重试
```

建议为每类 workflow 设置预算。

| Workflow | Token Budget | Tool Budget | 时间预算 | 失败策略 |
|---|---:|---:|---:|---|
| Quick Scan | 低 | 低 | 短 | 输出 watchlist |
| Deep Research | 中高 | 中高 | 中 | 请求 human approval |
| Risk Review | 中 | 低 | 短 | 保守降级 |
| Post-Trade Review | 中 | 中 | 中 | 可延后 |
| Weekly Learning | 高 | 高 | 长 | 批处理 |

#### BudgetManager 建议

```text
BudgetManager
├── task_budget
├── session_budget
├── daily_budget
├── per_model_budget
├── tool_call_limit
├── approval_threshold
└── circuit_breaker
```

---

### 4.7 Tiered Model Strategy 优于只用最强模型

不要所有节点都调用最强模型。2026-06-04 的可核验 SOTA 并不支持把设计
绑定到某个具体模型版本或临时价格表；它支持的是一条更稳的原则：

```text
模型是可替换执行资源，不是系统 source of truth。
ModelRouter 只按节点风险、证据缺口、延迟预算、成本预算和验证结果选择模型。
```

因此这里不记录易漂移的模型榜单、star 数或价格断言。实现时应维护本地
`model_capability_registry`，由实测 eval、可用 provider、上下文长度、
结构化输出稳定性、工具调用能力、成本和失败率驱动路由。

建议设计 ModelRouter：

```text
cheap / fast model:
- 数据清洗
- ticker 标准化
- 新闻去重
- 格式转换
- 简单摘要

analysis model:
- 单标的常规分析
- 技术结构解释
- 交易记录归因
- workflow routing

strong reasoning / reviewer model:
- 冲突信号判断
- 重大交易机会审查
- 周度复盘
- 风险争议
- 策略更新建议

fallback / safe model:
- 主 provider 失败时降级
- 输出必须通过同一 schema / guardrail
- 降级事件写入 RunTrace
```

模型层应可替换：

```text
GPT
Claude
DeepSeek
Gemini
Local model (Qwen, Llama)
```

但业务系统、记忆、风险、trace、paper outcome 不应绑定某一个模型。

> **2026 SOTA 校准**：当前一手材料更强调 harness、sandbox、durable
> execution、tracing、guardrail、checkpoint/resume 和 human-in-the-loop。
> MCP 或 provider SDK 可以作为工具接入方式，但不能替代项目自己的
> EvidenceRef、RiskGate、RunTrace、PaperTradeTracker 和 approval contract。

---

### 4.8 Multi-Agent 的价值是职责隔离，不是堆聊天机器人

多 Agent 不应理解成多个聊天机器人互相讨论。

它的真正价值是：

```text
职责隔离
互相校验
风险制衡
上下文隔离
工具权限隔离
```

建议的多 Agent 分工：

```text
LeadAgent：任务拆解与综合判断
MarketDataAgent：数据快照与质量检查
NewsAgent：新闻与事件抽取
TechnicalAgent：价格结构分析
OptionsAgent：期权/波动率分析
RiskAgent：独立否决
PortfolioAgent：仓位与相关性
ReviewAgent：复盘归因
Human：最终负责人
```

其中 `RiskAgent` / `RiskGate` 不应只是 LeadAgent 的附属节点。

它要有独立否决权。

---

### 4.9 自学习必须基于 outcome，而不是基于 LLM 反思文本

错误的自学习：

```text
LLM 每次运行后写一段 reflection
↓
存入 memory
↓
下次检索
```

这只是文本沉淀，不是系统学习。

正确的自学习：

```text
Prediction
    ↓
Tracking
    ↓
Outcome
    ↓
Attribution
    ↓
Memory Distillation
    ↓
Workflow / Feature / Risk Rule Update
    ↓
Regression Eval
```

也就是说：

| 层级 | 错误做法 | 正确做法 |
|---|---|---|
| 记忆 | 存聊天记录 | 存结构化交易案例 |
| 反思 | 让 LLM 写总结 | 对比预测与实际结果 |
| 学习 | 自动相信反思 | 经过 eval / human review 后入库 |
| 策略 | LLM 直接生成买卖 | LLM 生成 feature / thesis / checklist |
| 风控 | prompt 里提醒小心 | 架构上不可绕过 RiskGate |

---

## 5. 推荐目标架构

### 5.1 总体系统分层

```text
trader-workflow
├── 01_runtime/
│   ├── run_trace
│   ├── checkpoint
│   ├── replay
│   ├── budget_manager
│   ├── approval_gate
│   └── observability
│
├── 02_context/
│   ├── processed_context_builder
│   ├── memory_selector
│   ├── memory_distiller
│   ├── scratchpad
│   ├── prompt_cache_guard
│   └── context_budget
│
├── 03_tools/
│   ├── tool_registry
│   ├── provider_adapters
│   ├── tool_permissions
│   ├── tool_quality_score
│   └── tool_result_compressor
│
├── 04_market_data/
│   ├── raw_provider_data
│   ├── canonical_snapshot
│   ├── quality_gate
│   ├── feature_store
│   └── regime_detector
│
├── 05_agents/
│   ├── lead_agent
│   ├── market_data_agent
│   ├── news_agent
│   ├── technical_agent
│   ├── options_agent
│   ├── risk_agent
│   └── review_agent
│
├── 06_trading/
│   ├── decision_object
│   ├── thesis_store
│   ├── risk_gate
│   ├── portfolio_state
│   ├── paper_trade_tracker
│   └── outcome_reconciler
│
├── 07_evals/
│   ├── scenario_tests
│   ├── replay_tests
│   ├── risk_compliance_tests
│   ├── data_quality_tests
│   └── paper_outcome_eval
│
└── 08_dashboard/
    ├── decision_console
    ├── run_inspector
    ├── memory_explorer
    ├── risk_review_queue
    ├── paper_trade_board
    └── weekly_learning_report
```

---

## 6. P0 模块设计

### 6.1 DecisionObject

#### 目标

把 Agent 输出从自然语言变成可计算、可评估、可风控、可追踪的结构化对象。

#### 示例

```json
{
  "symbol": "TSLA",
  "direction": "bullish",
  "decision_type": "watch_only",
  "setup_family": "reclaim_or_pullback",
  "pattern_id": "higher_low_reclaim_watch",
  "point_in_time_scope": {
    "decision_time": "2026-06-04T14:30:00Z",
    "data_asof_time": "2026-06-04T14:25:00Z"
  },
  "entry_zone": [178, 182],
  "invalidation": 172,
  "target_zone": [195, 205],
  "holding_period": "3-10 days",
  "confidence": 0.62,
  "evidence": [
    {
      "type": "price_action",
      "summary": "Higher low forming near prior support"
    }
  ],
  "counter_evidence": [
    {
      "type": "event_risk",
      "summary": "Upcoming CPI may increase volatility"
    }
  ],
  "risk_flags": ["EVENT_RISK", "LEVERAGED_ETF_CAUTION"],
  "risk_result": "WATCH_ONLY",
  "required_confirmation": [
    "volume contraction on pullback",
    "hold above prior low"
  ]
}
```

#### 必须满足

```text
1. 必须有 direction
2. 必须有 confidence
3. 必须有 evidence
4. 必须有 counter_evidence
5. 必须有 invalidation
6. 必须有 holding_period
7. 必须有 risk_flags
8. 必须有 point_in_time_scope
9. 必须有 risk_result
10. 没有 entry / invalidation / PIT provenance 的输出只能是 WATCH_ONLY
```

---

### 6.2 RunTrace v2

#### 目标

让每次 workflow 运行具备：

```text
可查询
可复盘
可重放
可比较
可回归测试
```

#### 最低字段

```text
run_id
workflow_name
workflow_version
graph_version
prompt_version
model_name
model_params
input_payload
checkpoint_thread_id
checkpoint_id
processed_context_id
memory_ids
tool_calls[]
tool_results[]
node_inputs[]
node_outputs[]
decision_object
policy_check_results
guardrail_results
risk_result
human_interrupts
human_review
sensitive_data_policy
token_usage
cost_estimate
latency_ms
resume_events
error_events
created_at
```

#### 节点级 trace

每个 LangGraph node 应记录：

```text
node_id
node_name
input
output
model_call
tool_calls
memory_used
guardrail_result
policy_check_result
checkpoint_id
token_usage
latency_ms
error
created_at
```

---

### 6.3 DataQualityGate

#### 目标

避免低质量行情数据驱动高置信交易判断。

#### 流程

```text
Provider Raw Data
    ↓
Normalize
    ↓
Quality Check
    ↓
CanonicalSnapshot
    ↓
Agent Context
```

#### MVP 检查项

```text
1. timestamp 是否过旧
2. price 是否缺失
3. volume 是否缺失
4. 多数据源价格是否冲突
5. 是否盘前/盘后
6. 是否存在疑似异常跳价
7. 是否 API rate limited
8. 是否历史数据不足
9. 历史证据是否有 point-in-time provenance
10. universe / 数据集是否有 survivorship-bias 风险
11. 派生特征是否有 look-ahead / leakage 风险
12. 若涉及收益判断，是否声明成本和 slippage 假设
```

---

### 6.4 RiskGate

#### 目标

架构级阻止 Agent 绕过风险控制。

#### 输入

```text
DecisionObject
PortfolioState
AccountState
MarketSnapshot
UserRiskProfile
```

#### 输出

```text
APPROVE
REJECT
REDUCE
WATCH_ONLY
NEEDS_HUMAN_CONFIRMATION
```

#### MVP 规则

```text
1. DataQualityGate 未通过 → WATCH_ONLY
2. 缺少 counter_evidence → REJECT
3. 缺少 invalidation → REJECT
4. 杠杆 ETF + 高波动 → REDUCE / WATCH_ONLY
5. 事件日前后 → NEEDS_HUMAN_CONFIRMATION
6. 超过单笔风险上限 → REJECT / REDUCE
7. 连续亏损状态 → 降低 confidence ceiling
8. 用户要求重仓 → 强制 human confirmation
9. 缺少 point-in-time provenance → WATCH_ONLY
10. 回测/验证缺少 out-of-sample、成本或 slippage 假设 → 不得 promotion
```

---

### 6.5 processedContext

#### 目标

将任务上下文处理为稳定、可控、可复用、可审计的 `processedContext`。

#### 输入

```text
task
workflow_type
symbol
market_snapshot
selected_memory
tool_results
risk_rules
output_schema
```

#### 输出

```text
processedContext
```

#### processedContext 结构

```text
system_rules
task_goal
market_snapshot_summary
data_quality_summary
point_in_time_scope
selected_memories
compressed_tool_results
risk_constraints
required_output_schema
```

---

### 6.6 PaperTradeTracker

#### 目标

建立 prediction → outcome 的真实反馈闭环。

#### 字段

```text
paper_trade_id
decision_id
candidate_id
symbol
direction
decision_time
data_asof_time
entry_condition
entry_triggered
entry_time
entry_reference_price
cost_model_version
slippage_assumption
benchmark_return
max_favorable_excursion
max_adverse_excursion
invalidation_hit
target_hit
holding_period_result
actual_outcome
post_mortem
memory_update_status
```

#### 关键作用

```text
1. 判断 Agent 是否过度乐观
2. 判断某类信号是否有效
3. 识别常见失败模式
4. 为 memory distillation 提供事实依据
5. 为 workflow / prompt / risk rule 改进提供数据
```

---

## 7. P1 模块设计

### 7.1 BudgetManager

```text
task_budget
session_budget
daily_budget
model_budget
tool_call_limit
approval_threshold
circuit_breaker
```

### 7.2 ModelRouter

```text
输入：task complexity / workflow type / risk level / budget state
输出：model selection

本地 model_capability_registry:
- provider
- model_id
- context_capacity
- structured_output_success_rate
- tool_call_reliability
- latency_p50 / latency_p95
- cost_estimate
- known_failure_modes
- last_eval_at

路由策略:
- 数据清洗 / 标准化 → cheap / fast model
- 日常分析 / 归因 → analysis model
- 冲突信号 / 周复盘 → strong reasoning / reviewer model
- 预算告急 → 降级到下一层
- provider 失败 → fallback model，但必须通过同一 schema / guardrail
```

### 7.3 RegimeDetector

```text
趋势市场
震荡市场
高波动事件市场
财报驱动市场
宏观驱动市场
流动性稀薄市场
```

### 7.4 PortfolioState

```text
positions
cash
gross_exposure
net_exposure
symbol_exposure
sector_exposure
leveraged_etf_exposure
option_delta
option_theta
option_vega
drawdown
consecutive_losses
```

### 7.5 ReplayEval

```text
给定历史 run trace
重放 workflow
比较新版输出与旧版输出
检测 prompt / graph / model 改动是否导致行为退化
```

### 7.6 MemoryDistiller

```text
从 paper trade outcome / human review / post-mortem 中提炼：
- 有效经验
- 失败模式
- 用户偏好
- workflow 修正建议
- symbol thesis 更新
```

---

## 8. 当前不建议过早引入的内容

Waylandz 中很多设计偏生产级、团队级、平台级。我们当前是个人开发 / MVP 阶段，不应过早照搬。

> **2026-06 SOTA 更新**：以下判断仍然有效。值得注意的是，LangGraph 在 2026
> 年已经原生支持 checkpoint、durable execution 和 `langgraph.json`
> 声明式部署，在很多场景下可以替代 Temporal 的基础需求。但 Temporal
> 在跨服务 saga、多系统事务补偿方面仍有不可替代的价值——只是我们当前
> 阶段还不需要。

### 8.1 暂不建议 P0 引入 Temporal

Temporal 对 durable workflow 很强，但当前会增加运维和认知成本。

建议：

```text
先用 LangGraph checkpoint + SQLite + structured trace + replay runner
等长任务和异步事务补偿需求明显增多后，再考虑 Temporal
```

### 8.2 暂不建议 P0 引入 Rust / Go 多语言架构

Waylandz 中 Rust / Go / Python 的分层适合高性能和团队协作场景。

当前建议：

```text
Python-first
LangGraph + FastAPI + SQLite
先补系统不变量
不要提前优化性能路径
```

### 8.3 暂不建议 P0 引入复杂向量数据库

当前 memory 重点不是“更强检索”，而是“结构化案例 + outcome + distillation”。

可以继续 SQLite。

后续再考虑：

```text
Postgres
TimescaleDB
Qdrant / pgvector
Redis
```

### 8.4 暂不建议接真实自动下单

当前应先做：

```text
Research
DecisionObject
RiskGate
PaperTradeTracker
Human Review
```

不要直接进入：

```text
broker execution automation
```

---

## 9. 推荐开发路线

### 阶段 1：Engineering Hardening

目标：

```text
让每次 Agent 判断可结构化、可追踪、可风控、可复盘。
```

任务：

```text
1. 定义 DecisionObject schema
2. 改造 workflow final output
3. 新增 RunTrace v2 表结构
4. 所有 node 写入 trace
5. 新增 DataQualityGate
6. 新增 RiskGate
7. 所有 decision 转入 PaperTradeTracker
```

---

### 阶段 2：Learning Loop

目标：

```text
让系统从 paper outcome 中沉淀可验证经验。
```

任务：

```text
1. 实现 paper trade outcome tracking
2. 实现 post-mortem workflow
3. 实现 MemoryDistiller
4. 建立 FailureMemory
5. 建立 TradeCaseMemory
6. 建立 weekly learning report
```

---

### 阶段 3：Workflow Library

目标：

```text
让不同交易任务使用不同稳定 workflow。
```

建议 workflow：

```text
1. Quick Market Scan
2. Deep Symbol Research
3. Earnings Risk Review
4. Options Setup Review
5. Post-Trade Review
6. Weekly Portfolio Risk Review
7. Thesis Update
8. News Shock Assessment
```

每个 workflow 应定义：

```text
inputs
tools
nodes
context pack
decision schema
risk checks
eval criteria
```

---

### 阶段 4：Portfolio & Regime

目标：

```text
从单标的机会分析升级为组合级风险与市场状态分析。
```

任务：

```text
1. PortfolioState
2. Exposure calculation
3. RegimeDetector
4. Strategy/workflow routing
5. correlation / beta / leverage awareness
```

---

### 阶段 5：Dashboard

目标：

```text
形成日常使用驾驶舱。
```

模块：

```text
1. Daily Opportunities
2. Decision Console
3. Risk Review Queue
4. Run Inspector
5. Memory Explorer
6. Paper Trade Board
7. Weekly Learning Report
```

---

## 10. 最终系统形态

不建议把终态定义为：

```text
AI 自动读市场
AI 自动判断
AI 自动下单
AI 自动学习
```

更合理的终态是：

```text
AI 研究驾驶舱
    ↓
多源数据质量校验
    ↓
多 Agent 分工研究
    ↓
结构化交易候选
    ↓
独立风控否决
    ↓
人工最终确认
    ↓
Paper / Live 结果追踪
    ↓
复盘与记忆蒸馏
    ↓
工作流和规则持续进化
```

一句话：

> LLM 负责研究、解释、归因、生成候选；系统负责约束、验证、风控、追踪；人负责最终授权。

---

## 11. 与平台吞噬风险的关系

Claude Code、ChatGPT、Codex、Cursor 等会吃掉：

```text
- 通用代码生成
- 简单工具调用
- 普通 RAG
- 浅层垂直封装
- 通用办公 Agent
- prompt wrapper
```

但不容易吃掉：

```text
- 私有交易记录
- 个人风控规则
- 长期 paper outcome
- 标的 thesis memory
- 交易失败模式库
- 自己的 workflow trace
- 自己的 dashboard
- 风险约束与人机协作边界
```

> **2026-06 SOTA 校准**：平台方正在把通用 agent harness、tool use、
> tracing、guardrail、sandbox 和 memory 做成基础能力。平台方会继续吃掉
> 通用执行层，但交易研究系统的护城河仍然在垂直数据、EvidenceRef、
> RiskGate、outcome ledger、复盘规则和人机协作边界。

因此，我们的系统不应与 ChatGPT / Claude Code 竞争模型能力。

正确定位是：

```text
把 GPT / Claude / DeepSeek / Gemini / 本地模型作为底层执行器；
我们的系统沉淀业务上下文、数据质量、风控、记忆、复盘、界面和决策闭环。
```

模型可以换。

系统沉淀不能轻易被换掉。

---

## 12. 下一步任务卡建议

### Task 1：Define DecisionObject Schema

```text
目标：
定义交易研究输出的标准 schema，并让 LangGraph final node 输出该对象。

验收：
1. 每次 workflow run 必须生成 DecisionObject
2. 缺失 required fields 或 point-in-time scope 时 validation fail
3. validation fail 时不得进入 RiskGate
```

---

### Task 2：Upgrade RunTrace v2

```text
目标：
把当前 workflow record 升级为节点级 trace。

验收：
1. 每个 node 有 input/output
2. 每次 tool call 有参数和返回
3. 每次 model call 有 model/prompt/token/cost
4. run_id 可关联完整执行链路
5. guardrail / policy check / human interrupt / checkpoint 事件可追踪
```

---

### Task 3：Implement DataQualityGate

```text
目标：
为 yfinance / AlphaVantage / Longbridge 输出建立统一数据快照和质量标签。

验收：
1. 三个 provider 输出可 normalize
2. snapshot 有 quality_flags
3. source disagreement 可识别
4. 数据不可用时 Agent 降级为 WATCH_ONLY
5. 缺少 PIT provenance、存在 leakage 或 cost/slippage 缺失时可标记失败
```

---

### Task 4：Implement RiskGate

```text
目标：
建立独立 rule-based 风控裁决模块。

验收：
1. RiskGate 不由 LLM 控制
2. 支持 APPROVE / REJECT / REDUCE / WATCH_ONLY / NEEDS_HUMAN_CONFIRMATION
3. 缺少 invalidation / counter_evidence 自动 reject
4. 数据质量不足自动 WATCH_ONLY
5. 缺少 PIT provenance 或验证成本假设时不得 promotion
```

---

### Task 5：Implement PaperTradeTracker

```text
目标：
所有候选交易进入 paper tracking，并在未来窗口追踪结果。

验收：
1. DecisionObject 可生成 paper_trade
2. 系统能记录是否触发入场
3. 系统能记录 MFE / MAE
4. 系统能记录 cost/slippage、benchmark-relative return 和 data_asof_time
5. 系统能生成 post-mortem 输入
```

---

## 13. 参考链接

### Waylandz Blog

- https://waylandz.com/blog/
- https://waylandz.com/blog/shannon-agentkit-alternative/
- https://www.waylandz.com/blog/dnalyaw-quant-trading-system/
- https://waylandz.com/blog/backtest-to-live-gap/
- https://www.waylandz.com/blog/kocoro-ai-needs-a-heart/
- https://waylandz.com/blog/claude-code-tool-design-lessons/

### Waylandz Books

- AI Agent Architecture: https://waylandz.com/ai-agent-book-en/
- AI Agent Architecture Preface: https://waylandz.com/ai-agent-book-en/preface/
- Chapter 01 - The Essence of Agents: https://waylandz.com/ai-agent-book-en/chapter-01-the-essence-of-agents/
- Chapter 07 - Context Engineering: https://waylandz.com/ai-agent-book-en/chapter-07-context-engineering/
- Chapter 15 - Swarm Pattern: https://waylandz.com/ai-agent-book-en/chapter-15-swarm-pattern/
- Chapter 21 - Temporal Workflows: https://waylandz.com/ai-agent-book-en/chapter-21-temporal-workflows/
- Chapter 22 - Observability: https://waylandz.com/ai-agent-book-en/chapter-22-observability/
- Chapter 23 - Token Budget Control: https://waylandz.com/ai-agent-book-en/chapter-23-token-budget-control/
- Chapter 29 - Agentic Coding: https://waylandz.com/ai-agent-book-en/chapter-29-agentic-coding/
- Chapter 31 - Tiered Model Strategy: https://waylandz.com/ai-agent-book-en/chapter-31-tiered-model-strategy/

### AI Quantitative Trading

- https://waylandz.com/quant-book-en/
- https://waylandz.com/quant-book-en/Lesson-01-Quantitative-Trading-Landscape/
- https://waylandz.com/quant-book-en/Lesson-16-Portfolio-Construction-and-Exposure-Management/
- https://waylandz.com/quant-book-en/Lesson-22-Summary-and-Advanced-Directions/

### Transformer Architecture

- https://waylandz.com/llm-transformer-book/

### 2026 SOTA 参考

- Anthropic - Building effective agents: https://www.anthropic.com/engineering/building-effective-agents
- Anthropic - Effective harnesses for long-running agents: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- LangGraph persistence: https://docs.langchain.com/oss/python/langgraph/persistence
- LangGraph interrupts / human-in-the-loop: https://docs.langchain.com/oss/python/langgraph/interrupts
- OpenAI Agents SDK tracing: https://openai.github.io/openai-agents-python/tracing/
- OpenAI Agents SDK guardrails: https://openai.github.io/openai-agents-python/ref/guardrail/
- OpenAI Agents SDK harness update: https://openai.com/index/the-next-evolution-of-the-agents-sdk/
- TradingAgents repo / release notes: https://github.com/TauricResearch/TradingAgents
- Agentic Trading survey: https://arxiv.org/abs/2605.19337
- When Agents Trade benchmark: https://arxiv.org/abs/2510.11695
- FinRL-X AI-native modular quant infrastructure: https://arxiv.org/abs/2603.21330
- Look-Ahead-Bench: https://arxiv.org/abs/2601.13770
- Evaluating LLMs in Finance Requires Explicit Bias Consideration: https://arxiv.org/abs/2602.14233
- Parametric look-ahead bias in LLM backtesting: https://arxiv.org/abs/2605.24564
- Lopez de Prado - Multiple-testing crisis / Deflated Sharpe: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3177057
- SEC Report to Congress on Algorithmic Trading: https://www.sec.gov/files/Algo_Trading_Report_2020.pdf
- FINRA Market Access Rule exam findings: https://www.finra.org/rules-guidance/guidance/reports/2022-finras-examination-and-risk-monitoring-program/market-access-rule

---

## 14. 最终判断

Waylandz 全站内容对我们的系统设计给出的最重要判断是：

> 不要迷信更聪明的模型。  
> 要构建能长期运行、能复盘、能校准、能否决、能进化的系统。

对我们当前项目来说，最小有效下一步是：

```text
DecisionObject
RunTrace v2
DataQualityGate
RiskGate
processedContext
PaperTradeTracker
```

这六个模块完成后，系统会从：

```text
Agent workflow demo
```

升级为：

```text
Risk-gated, traceable, self-calibrating trading research agent system
```

这才是后续接入更强模型、更多数据源、更多交易工作流、甚至纸面交易 / 实盘辅助的基础。

---

## 15. 2026 SOTA 验证与校准

本节于 2026-06-04 通过 web search 重新校准。校准规则：

- 只使用可核验的一手或近源材料作为依据；
- 不记录易漂移的模型版本、价格、star 数或厂商营销排名；
- 外部 SOTA 只用于强化工程约束，不替代本项目 source-of-truth。

### 15.1 Agent Runtime SOTA：durable workflow + trace + guardrail

当前 agent 工程一手材料给出的共同方向是：

```text
durable execution
+ checkpoint / resume
+ human interrupt
+ trace spans
+ guardrail / policy events
+ sandbox or controlled tool environment
```

LangGraph 的 persistence / interrupt 文档支持 checkpoint、time travel、
fault tolerance、human-in-the-loop；OpenAI Agents SDK 强调 tracing、
guardrails、sandbox-aware orchestration 和 state rehydration；Anthropic
强调简单可组合 workflow、明确工具边界、测试和人工 checkpoint。

对本项目的校准结论：

- Stage 1 继续采用 LangGraph + SQLite checkpoint 是合理的；
- P0 不需要改投 Temporal、Rust/Go 或重平台；
- 但 RunTrace v2 必须记录 checkpoint/thread identity、node input/output、
  tool call/result、guardrail/policy check、human interrupt、sensitive-data
  handling 和 resume/error event。

### 15.2 Financial Agent SOTA：agent 是审计型决策管线，不是价格神谕

2026 的 LLM trading agent 文献更接近这个判断：

```text
LLM trading agent = evidence-aware expert-system decision pipeline
not = autonomous price oracle
```

`Agentic Trading` survey 将 LLM trading agent 重构为可审计 evidence map。
`When Agents Trade` 显示 agent framework 的风险行为差异很大，不能只看
model backbone。TradingAgents 的 2026 release notes 也说明开源参考实现正往
structured output、checkpoint resume、persistent decision log 和 provider
可替换方向走。

对本项目的校准结论：

- TradingAgents 可作为参考实现，不是产品路线权威；
- 多 agent 的价值是职责隔离和互相校验，不是扩大自治；
- 风控不能只是一个 LLM risk debater，必须落到 deterministic RiskGate；
- LLM 可以生成 hypothesis / explanation / critique，但不能绕过 RulePack、
  RiskGate、approval 或 outcome ledger。

### 15.3 Quant Validation SOTA：先防假 alpha，再谈学习

金融 LLM/quant evaluation 的最新风险集中在：

- look-ahead bias；
- survivorship bias；
- narrative bias；
- objective bias；
- cost bias；
- multiple testing / selection bias；
- unrealistic fills, slippage, and transaction costs。

Look-Ahead-Bench、finance LLM bias framework 和 parametric look-ahead bias
论文都指向同一个结论：历史回测里的 LLM 结论很容易“知道未来”或在评估中
泄漏未来信息。Lopez de Prado 的 multiple-testing / Deflated Sharpe 方向也
提醒：大量候选里挑出最好的一条，不能直接当成 alpha。

对本项目的校准结论：

- Reference Corpus 只能产生 hypothesis，不能产生 runtime rule；
- AlphaCandidate 必须声明 `point_in_time_scope`；
- LiteBacktestPlan 必须声明 out-of-sample split、cost/slippage assumption、
  leakage check 和 selection-bias note；
- 没有 PIT provenance、counter-evidence、invalidation 或 cost model 的候选，
  只能 `watch_only`，不能 promotion。

### 15.4 Waylandz 校准：吸收原则，不复制平台

Waylandz / Dnalyaw / Shannon 对本项目最有价值的启发是：

- research 和 execution 必须物理隔离；
- strategy/agent 输出应先变成目标权重、candidate 或 report，不应直接下单；
- agent-assisted factor mining 必须经过 validator、decay/originality check；
- production agent 平台要有 budget、policy、approval、replay、observability。

但这些不意味着本项目 P0 要复制 Shannon、Temporal、WASI sandbox、Rust/Go
执行层或完整 OMS。当前 source-of-truth 已经把本项目限定在
backend/shared/workflows/CLI；P0 应先完成可审计研究闭环，再讨论执行系统。

### 15.5 校准结论

| 方面 | 原始判断 | SOTA 校准 |
|---|---|---|
| P0 六模块 | DecisionObject + RunTrace + DataQualityGate + RiskGate + processedContext + PaperTradeTracker | 维持，并加强 point-in-time、bias、cost/slippage 和 trace 要求。 |
| Tiered Model Strategy | 不要所有节点都用最强模型 | 维持，但禁止绑定未核实的具体模型版本或价格；用本地 eval 和能力注册表路由。 |
| RiskGate 独立性 | 确定性规则，非 LLM | 强化。LLM risk role 可以给建议，不能拥有 veto 解释权。 |
| Context Engineering | 分层 processedContext | 维持。上下文必须可压缩、可追溯、可复原，不能把原始数据塞进 prompt。 |
| 暂缓 Temporal | SQLite + trace 先行 | 维持。除非 workflow SLA、跨进程长任务和恢复复杂度超过 LangGraph + SQLite 能力。 |
| 暂缓自动下单 | Research-first | 维持。执行系统需要单独 PRD、风控和合规边界。 |
| Python-first | 不引入 Rust/Go 多语言架构 | 维持。多语言执行层不是当前瓶颈。 |

### 15.6 SOTA 驱动的下一步补充

1. **Point-in-time EvidenceRef**：所有历史市场、新闻、财报、语料引用必须
   记录 `observed_at`、`source_published_at`、`available_to_system_at` 和
   `retrieved_at`。

2. **BiasGate**：在 DataQualityGate 之后增加结构化 bias checklist：
   look-ahead、survivorship、narrative、objective、cost、selection bias。

3. **RunTrace v2 span shape**：node 级 trace 先采用项目自有 JSON schema，
   字段对齐 trace/span 概念；未来需要时再增加 OTLP 或 LangSmith/Braintrust
   exporter。

4. **Eval-driven ModelRouter**：建立本地 model capability registry，记录
   schema success rate、tool-call reliability、latency、cost、context capacity
   和 failure mode。文档不硬编码临时模型榜单。

5. **ValidationReport**：任何 candidate promotion 前必须输出 cost/slippage
   adjusted expectancy、benchmark-relative return、out-of-sample result、
   drawdown/MAE/MFE、multiple-testing note 和 rejection reason。
