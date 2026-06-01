# 交易员认知型自学习量化 Agent

## 系统架构与设计方案 v0.3

> 版本：v0.3  
> 目标读者：个人开发者、AI 开发 Agent、后端工程 Agent、前端工程 Agent、量化研究 Agent  
> 系统定位：研究、机会发现、辅助决策、条件型 Trade Ticket、Paper Trading、复盘学习  
> 默认边界：不自动实盘下单；所有高风险动作需要人工审批；深度学习模型不覆盖硬风控

---

## 0. 一句话定义

本系统不是普通量化机器人，也不是简单 RAG 聊天助手，而是：

> **以顶级交易员语料为认知核心，以行情、新闻、期权、对手盘等工具为验证能力，以规则与风控为执行边界，以深度学习和复盘机制为自我强化链路，以 Web 工作台为人机协作入口的专业交易 Agent 系统。**

它的目标是：

```text
理解顶级交易员如何思考
→ 沉淀交易员 playbook
→ 实时匹配当前市场
→ 调用工具验证
→ 发现固定股票池中的高胜率机会
→ 生成条件型交易计划
→ 复盘学习
→ 持续进化
```

默认定位：

```text
研究
机会发现
辅助决策
条件型 trade ticket
paper trading
复盘学习
```

默认不做：

```text
自动实盘下单
全市场扫描
黑箱交易
无风控执行
LLM 直接买卖
未经验证的深度学习策略上线
```

---

# 1. 系统总结构

整体拆成三层系统，并在 Agent Core 中嵌入深度学习自强化链路。

```text
┌──────────────────────────────────────────────────────────────┐
│ Layer 2：Web Agent Cockpit                                   │
│ 实时看板 / Agent Chat / 任务 / 规则 / 工具权限 / 审批 / 复盘     │
└───────────────────────────────┬──────────────────────────────┘
                                │
                 REST / WebSocket / SSE / Event Stream
                                │
┌───────────────────────────────▼──────────────────────────────┐
│ Layer 1：Agent Core Backend                                   │
│ Trader Brain / Market Brain / Options Brain / Rule / Risk     │
│ Reflection Brain / Deep Learning Self-Reinforcement Layer      │
└───────────────────────────────┬──────────────────────────────┘
                                │
          DB / Redis / Vector DB / Tool Gateway / Scheduler
                                │
┌───────────────────────────────▼──────────────────────────────┐
│ Layer 3：Shared Platform Layer                                │
│ 数据库 / 事件总线 / 工具网关 / 审计 / 权限 / Worker / 配置管理    │
└──────────────────────────────────────────────────────────────┘
```

更具体：

```text
Agent Core Backend = 大脑和交易逻辑
Web Agent Cockpit = 交互、控制、审批、观察
Shared Platform = 数据、事件、权限、工具、审计
Deep Learning Layer = 自强化学习和模型进化能力
```

---

# 2. 系统核心原则

## 2.1 固定战场

第一版只做少数高流动性、高关注度标的。

```text
SPY
QQQ
TSLA
NVDA
AAPL
COIN
BMNR
```

后续可扩展：

```text
MSFT
META
AMZN
GOOGL
MSTR
AMD
PLTR
```

原则：

```text
不做全市场。
不扫低质量小票。
不追所有异动。
只在熟悉标的中寻找高胜率 setup。
```

---

## 2.2 固定 Setup

MVP 只做 5 类机会：

```text
1. VWAP Reclaim
2. Relative Strength Pullback
3. Opening Range Breakout
4. Gap Hold / Gap Continuation
5. Daily Breakout Retest
```

Phase 2 研究模块：

```text
Momentum Options Trader
Microstructure / Order Flow Observer
Opponent Intelligence
Gamma / GEX / IV Structure
```

---

## 2.3 交易员语料是认知核心

系统最重要的资产不是行情 API，而是：

```text
顶级交易员历史聊天记录
Longbridge topics
Whop 群聊
复盘内容
截图
人工笔记
交易员历史判断与后续市场表现
```

系统要学习的不是：

```text
他说过什么 ticker
```

而是：

```text
他在什么市场环境下说？
他这句话是观察、等待、进场、止盈还是风险提醒？
他说完之后市场怎么走？
类似场景历史胜率如何？
他什么情况下不交易？
```

---

## 2.4 LLM 不直接交易

LLM 负责：

```text
语料理解
新闻理解
事件归纳
playbook 总结
复盘解释
规则建议
Agent 对话
工具调度
```

确定性系统负责：

```text
setup 判断
规则执行
风控
打分
状态流转
trade ticket 权限
```

深度学习模型负责：

```text
概率预测
排序
噪声过滤
软评分调权
期权风险判断
模型自强化
```

最终硬边界：

```text
Risk Engine > Rule Engine > Model Prediction > LLM Explanation
```

---

# 3. 核心业务闭环

## 3.1 离线学习闭环

```text
交易员语料导入
    ↓
清洗、去重、时间标准化
    ↓
语义抽取
    ticker / action / direction / timeframe / setup / risk
    ↓
Ticker Alias Resolver
    tsll、circle275、260c、nvda calls 等解析
    ↓
绑定市场上下文
    SPY / QQQ / VWAP / volume / news / options
    ↓
结果标注
    30m / 1h / EOD / 1d / 3d / 5d / MFE / MAE
    ↓
沉淀 playbook
    ↓
更新 playbook 统计
    ↓
生成每日学习总结
    ↓
生成规则优化建议
    ↓
回测验证
    ↓
人工审批
    ↓
RulePack 版本升级
```

---

## 3.2 实时机会发现闭环

```text
获取 Market Snapshot
    ↓
判断 SPY / QQQ Market Gate
    ↓
扫描固定股票池
    ↓
识别 setup
    ↓
检索交易员历史 playbook
    ↓
按需调用工具
    行情 / 新闻 / 期权 / flow / web / deep search
    ↓
Rule Engine 判断
    ↓
Scoring Engine 打分
    ↓
Risk Engine 风控
    ↓
生成 SignalCandidate
    ↓
推送 Web Dashboard
    ↓
主动消息 / 审批请求
    ↓
必要时生成 Trade Ticket Draft
```

---

## 3.3 深度学习自强化闭环

```text
Signals + Features + Outcomes + Human Feedback
    ↓
Feature Store / Label Store
    ↓
训练监督模型
    SetupSuccessPredictor / SignalRanker / OptionsRiskPredictor
    ↓
Shadow Inference
    模型后台预测，不影响正式信号
    ↓
Model vs Rule 对比
    ↓
Paper Trading 验证
    ↓
Promotion Gate
    ↓
人工审批
    ↓
小权重接入 Scoring Engine
    ↓
持续监控漂移和回滚
```

---

# 4. Layer 1：Agent Core Backend

Agent Core 是核心后端，负责认知、市场、规则、风控、工具、学习和信号生成。

## 4.1 模块总览

```text
Agent Core Backend
├── Trader Brain
├── Market Brain
├── Options Brain
├── Opponent Intelligence
├── Setup Detection Engine
├── Rule Engine
├── Scoring Engine
├── Risk Engine
├── Tool Registry / MCP Adapter
├── Signal Manager
├── Trade Ticket Generator
├── Reflection Brain
├── Deep Learning Self-Reinforcement Layer
└── Agent Runtime Orchestrator
```

---

## 4.2 Trader Brain

### 目标

理解顶级交易员的语言、风格、偏好、交易逻辑和 playbook。

### 输入

```text
Whop 聊天记录
Longbridge topics
截图文字
交易员复盘
人工笔记
历史行情上下文
历史结果
人工反馈
```

### 核心能力

```text
1. 语义抽取
2. 语言强度判断
3. ticker / alias 解析
4. 交易员风格画像
5. playbook 检索
6. 相似历史案例匹配
7. 交易员历史有效性统计
```

### 需要识别的语言类型

```text
weak_observation        弱观察
conditional_watch       条件型观察
strong_watch            强关注
explicit_trade          明确交易
exit_signal             出场 / 止盈
risk_warning            风险警告
post_trade_recap        复盘
ambiguous               模糊
```

### 输出

```text
TraderSemanticEvent
TraderProfile
PlaybookMatch
SimilarCases
LanguageInterpretation
```

---

## 4.3 Market Brain

### 目标

判断当前市场环境是否支持交易。

### 核心判断

```text
SPY / QQQ 是 risk-on、risk-off、mixed 还是 chop？
当前是趋势日还是震荡日？
个股是否强于大盘？
当前机会是指数 beta，还是个股独立机会？
```

### 输入

```text
SPY
QQQ
目标股票
VIX
BTC / ETH
成交量
VWAP
Opening Range
Relative Strength
News
```

### 输出

```text
MarketRegime
MarketGate
TickerStrength
MarketRiskState
```

### Market Gate 状态

```text
PASS       允许正常扫描机会
CAUTION    只观察，降低权重
BLOCK      禁止高 beta 多头或禁止新 ticket
```

---

## 4.4 Options Brain / Momentum Options Trader Module

### 定位

这是 Phase 2 的重点增强模块，不是 MVP 主引擎。

正确定位：

```text
期权动量研究模块
期权风险过滤模块
机会确认模块
preferred instrument 推荐模块
```

不是：

```text
看到 call 爆量就买
0DTE 自动交易
秒级期权套利机器人
```

### 输入

```text
期权链
call / put volume
open interest
volume / OI
IV
IV rank / IV percentile
Greeks
DTE
strike clustering
bid-ask spread
unusual options flow
GEX / gamma proxy
event IV premium
```

### 输出

```text
OptionsConfirmationScore
IVRiskScore
GammaStructureScore
FlowCrowdingScore
PreferredInstrument
AvoidNakedOptionsWarning
```

### Preferred Instrument

```text
stock
call
put
call_spread
put_spread
avoid_options
```

### 核心规则

```text
IV 过热 → 不裸买
spread 过宽 → 不做期权
0DTE → 默认禁止或强审批
只有期权流没有价格确认 → 不触发交易
call/put flow 可能是 hedge / spread / 平仓 → 降低置信度
```

---

## 4.5 Opponent Intelligence

### 目标

识别对手盘、高手行为、期权拥挤度和 smart money 痕迹。

### 输入

```text
交易员群聊
排行榜 / 前 100 选手公开线索
Longbridge topics
期权流
dark pool
OI 变化
社区讨论
SEC 延迟披露
```

### 输出

```text
OpponentBehaviorSignal
CrowdingScore
AttributionQuality
FlowInterpretation
```

### 关键原则

```text
只能做推断，不能假装知道真实账户。
必须输出 confidence、latency、attribution_quality。
```

---

## 4.6 Setup Detection Engine

### 目标

用确定性规则识别固定 setup。

### 五类 setup

```text
VWAP Reclaim
Relative Strength Pullback
Opening Range Breakout
Gap Hold / Gap Continuation
Daily Breakout Retest
```

### 输出

```text
setup_type
matched
evidence
missing_conditions
invalidation
risk_flags
```

---

## 4.7 Rule Engine

### 目标

执行可配置规则。

### 规则类型

```text
hard             硬规则
soft             软评分规则
preference       用户偏好
notification     通知规则
tool             工具权限规则
learning         学习规则
temporary        临时规则
```

### 示例硬规则

```text
QQQ risk-off 禁止 TSLA / NVDA / COIN / BMNR 多头
BMNR 开盘 30 分钟内跌破 VWAP，不给多头机会
Deep Search 需要审批
0DTE 默认禁止
没有 stop 不生成 ticket
```

---

## 4.8 Scoring Engine

### 目标

综合多模块输出，给每个机会打分。

### 默认权重

| 模块 | 权重 |
|---|---:|
| Market Gate | 25 |
| Trader Playbook Match | 20 |
| Technical Structure | 25 |
| Relative Strength | 15 |
| Volume Confirmation | 10 |
| Catalyst | 5 |
| Options Confirmation | 5 |
| Risk Penalty | -25 到 0 |

### 状态阈值

```text
85+       可进入 trade ticket 评估
80-84     waiting_trigger
70-79     watch
<70       ignore
```

---

## 4.9 Risk Engine

### 目标

最高优先级风控。

### 硬规则

```text
单笔最大风险
单日最大亏损
连续亏损暂停
无 stop 不生成 ticket
R/R < 1.5 不生成 ticket
QQQ risk-off 禁止高 beta 多头
BMNR 风险系数 0.3
COIN 风险系数 0.5
0DTE 默认禁止
期权 spread 过宽禁止
```

### 风险系数

```text
SPY: 1.0
QQQ: 0.9
AAPL: 0.9
NVDA: 0.7
TSLA: 0.6
COIN: 0.5
BMNR: 0.3
```

---

## 4.10 Tool Registry / MCP Adapter

### 目标

统一管理工具调用。

### 工具分类

```text
market_data
news
deep_research
options
flow
trader_memory
risk
learning
execution
```

### 工具示例

```text
Longbridge market snapshot
Longbridge option chain
yfinance historical bars
Alpha Vantage indicators / options
Unusual Whales options flow / dark pool / GEX
News API
Web Search
Deep Search
Crypto price
Trader Memory Retrieval
Backtest
Outcome Labeling
```

### 权限原则

```text
低成本行情工具可自动调用
Deep Search 需要审批
Execution tool 默认 disabled
所有 tool call 需要 audit log
```

---

## 4.11 Reflection Brain

### 目标

受控自我学习。

### Daily Learning

```text
导入新语料
抽取 semantic events
绑定市场上下文
计算 outcome
更新 playbook
生成 daily learning summary
```

### Weekly Reflection

```text
统计 setup 表现
统计 ticker 表现
分析失败案例
提出 rule proposal
排队 backtest
```

### 输出

```text
LearningSummary
FailureCase
RuleProposal
PlaybookUpdate
```

---

## 4.12 Deep Learning Self-Reinforcement Layer

### 定位

深度学习模型不直接交易，只做：

```text
预测
排序
调权
过滤噪声
识别风险
辅助规则优化
```

### 模块

```text
Feature Store
Label Store
Training Dataset Builder
Market Replay Environment
Supervised Training Pipeline
Offline RL Training Pipeline
Model Registry
Shadow Inference Service
Model Evaluation Service
Promotion Gate
Drift Monitor
Model Explanation Adapter
```

### 第一阶段模型

```text
SetupSuccessPredictor
FalseBreakoutPredictor
OptionsRiskPredictor
SignalRanker
TraderMessageClassifier
LanguageStrengthClassifier
```

### 模型上线流程

```text
trained
→ backtested
→ shadow
→ paper
→ approved
→ active
→ monitored
→ rollback if degraded
```

### 关键限制

```text
不能覆盖 hard rule
不能覆盖 Risk Engine
不能直接下单
必须先 shadow
必须可回测
必须可审计
必须可回滚
```

---

# 5. Layer 2：Web Agent Cockpit

Web Cockpit 是你和 Agent 协作的控制台。

## 5.1 页面结构

```text
/dashboard/live
/chat
/inbox
/tasks
/rules
/capabilities
/approvals
/signals
/playbooks
/journal
/learning
/model-lab
/settings
/audit
```

---

## 5.2 Live Dashboard

### 展示

```text
Market Gate
固定股票池状态
当前 signal
setup score
Trader Brain match
Options summary
Risk flags
Agent timeline
Trade ticket drawer
```

### 典型卡片

```text
TSLA
Score: 82
Setup: VWAP Reclaim
Status: Waiting Trigger
Trader Match: 0.78
Risk: Price extended from VWAP
Next: Wait for pullback confirmation
```

---

## 5.3 Agent Chat

### 能力

```text
实时对话
上下文绑定
流式回复
快捷按钮
证据卡片
可执行动作
```

### 用户可以问

```text
为什么 TSLA 现在不能进？
这像不像他以前做 TSLA 的方式？
NVDA 和 COIN 哪个更干净？
BMNR 为什么被风控拒绝？
需要调用 Unusual Whales 吗？
这个信号过去胜率多少？
生成 trade ticket。
设置一条临时规则：今天暂停 BMNR。
```

---

## 5.4 Agent Inbox

Agent 主动消息中心。

### 消息类型

```text
market_gate_changed
signal_created
signal_near_trigger
signal_triggered
signal_invalidated
risk_rule_triggered
trade_ticket_ready
approval_required
tool_permission_required
learning_summary_ready
rule_proposal_created
```

### 优先级

```text
info
watch
action_required
risk
critical
```

---

## 5.5 Agent Action Timeline

展示 Agent 做过什么。

```text
observe_market
retrieve_trader_memory
match_playbook
call_tool
receive_tool_result
evaluate_rule
score_signal
run_risk_check
create_signal
request_approval
record_journal
propose_rule
```

注意：展示的是**动作日志与证据摘要**，不是隐藏推理链。

---

## 5.6 Task Center

用户可以设置任务。

### 任务类型

```text
market_monitor
signal_monitor
news_watch
playbook_learning
daily_brief
weekly_reflection
rule_backtest
deep_research
trade_review
```

### 示例

```text
每天盘前分析 TSLA、NVDA、COIN、BMNR
每 30 秒监控 TSLA VWAP Reclaim
每周五收盘后生成 Weekly Reflection
当 QQQ risk-off 时提醒我并暂停高 beta 多头
```

---

## 5.7 Rule Studio

用户配置规则。

### 支持模式

```text
自然语言生成规则草案
Visual Builder
YAML / JSON Editor
规则模拟
规则回测
规则启用 / 暂停
```

### 示例

```text
以后 BMNR 如果开盘 30 分钟内跌破 VWAP，就不要再给多头机会。
```

系统生成：

```yaml
name: BMNR first 30m VWAP failure block
type: hard
scope:
  symbols: [BMNR]
condition:
  expression: "market.time_since_open <= 30 && ticker.above_vwap == false"
action:
  type: block
```

---

## 5.8 Capability Center

控制 Agent 可以调用什么工具。

### 权限级别

```text
disabled
read_only
analysis_allowed
approval_required
auto_allowed
```

### 示例

```text
Longbridge 行情：auto_allowed
News API：auto_allowed
Unusual Whales：analysis_allowed
Deep Search：approval_required
Longbridge 下单：disabled
```

---

## 5.9 Approval Center

高风险动作审批中心。

### 审批类型

```text
trade_ticket
tool_call
rule_change
task_change
capability_change
risk_override
model_promotion
```

默认需要审批：

```text
生成正式 trade ticket
调用 deep search
启用新规则
修改硬风控
升级模型
开启 execution capability
```

---

## 5.10 Journal

记录：

```text
signal
trade ticket
人工决策
entry / stop / target
outcome
MFE / MAE
hit_stop
hit_target
失败原因
人工笔记
```

---

## 5.11 Learning Center

展示 Agent 学到了什么。

```text
今日导入多少条语料
抽取多少交易事件
新增哪些 playbook 样本
哪些信号成功 / 失败
哪些规则建议等待审批
当前 RulePack 版本
```

---

## 5.12 Model Lab

深度学习自强化页面。

### 展示

```text
Model Registry
Training Runs
Shadow Predictions
Rule vs Model Comparison
Feature Importance
Drift Monitor
Promotion Requests
Rollback
```

### Signal 上展示

```text
Rule Score: 82
Model Success Probability: 0.61
Model Confidence: Medium
Model Adjustment: +3
Model Mode: Shadow
```

---

# 6. Layer 3：Shared Platform Layer

Shared Platform 是系统基础设施。

## 6.1 模块

```text
Database Layer
Redis Cache & Pub/Sub
Vector Store
REST API Gateway
WebSocket Event Bus
SSE Streaming Layer
Scheduler & Worker Queue
Tool Gateway
Auth & Permission Service
Audit Logging Service
Configuration Service
Secrets Management
Error Handling & Retry
Observability
Backup & Migration
```

---

## 6.2 核心数据库表

### 交易员认知相关

```text
trader_raw_messages
trader_semantic_events
market_context_snapshots
event_outcomes
playbooks
playbook_examples
human_feedback
```

### 实时信号相关

```text
signals
signal_outcomes
trade_tickets
agent_messages
agent_events
agent_runs
```

### 控制与权限相关

```text
agent_tasks
agent_rules
agent_capabilities
approval_requests
rule_versions
rule_proposals
temporary_rules
tool_call_logs
audit_logs
```

### 深度学习相关

```text
model_features
model_labels
model_registry
model_predictions
model_promotion_requests
training_runs
market_replay_runs
```

---

## 6.3 事件流

统一事件格式：

```json
{
  "event_id": "evt_001",
  "event_type": "signal.updated",
  "timestamp": "2026-06-01T14:42:00Z",
  "source": "agent",
  "scope": {
    "symbol": "TSLA",
    "signal_id": "sig_001"
  },
  "payload": {
    "status": "waiting_trigger",
    "score": 82,
    "reason": "TSLA reclaimed VWAP but needs pullback confirmation"
  },
  "priority": "watch"
}
```

---

## 6.4 Tool Gateway

所有工具必须经过 Tool Gateway。

### Tool Gateway 负责

```text
schema validation
permission check
rate limit
cost policy
approval check
timeout
retry
fallback
logging
audit
```

---

## 6.5 Worker / Scheduler

后台任务：

```text
daily learning job
weekly reflection job
signal monitor
market snapshot refresh
outcome labeling
rule backtest
training job
shadow inference
model drift monitor
news watch
```

---

# 7. 核心数据对象

## 7.1 SignalCandidate

```python
class SignalCandidate:
    signal_id: str
    symbol: str
    timeframe: str
    setup_type: str
    score: float
    status: str

    market_gate: str
    trader_playbook_match: float | None
    model_success_probability: float | None

    entry_trigger: str
    invalidation: str
    preferred_instrument: str

    evidence: list[str]
    risk_flags: list[str]
    required_confirmations: list[str]
```

---

## 7.2 TradeTicket

```python
class TradeTicket:
    ticket_id: str
    signal_id: str
    symbol: str
    direction: str
    instrument: str
    timeframe: str

    entry_plan: str
    stop_plan: str
    target_1: str
    target_2: str | None

    max_loss_nav_pct: float
    position_size_rule: str

    status: str
    rationale: list[str]
    invalidation: list[str]
```

---

## 7.3 Playbook

```python
class Playbook:
    playbook_id: str
    name: str
    symbols: list[str]
    setup_type: str
    required_conditions: list[str]
    invalidation_conditions: list[str]

    preferred_timeframe: str
    preferred_instrument: list[str]

    sample_size: int
    historical_win_rate: float
    avg_mfe: float
    avg_mae: float
    failure_modes: list[str]
```

---

## 7.4 ModelPrediction

```python
class ModelPrediction:
    model_id: str
    object_type: str
    object_id: str
    timestamp: str

    prediction: dict
    confidence: float
    ood_score: float
    mode: str
    # shadow / scoring / active
```

---

# 8. 状态机

## 8.1 Signal 状态机

```text
ignore
→ watch
→ waiting_trigger
→ triggered
→ ticket_ready
→ waiting_approval
→ approved / rejected
→ in_trade / review
→ completed
```

---

## 8.2 Trade Ticket 状态机

```text
draft
→ waiting_manual_approval
→ approved / rejected
→ cancelled / expired
```

---

## 8.3 Model 状态机

```text
draft
→ trained
→ backtested
→ shadow
→ paper
→ approved
→ active
→ archived
```

---

## 8.4 Rule Proposal 状态机

```text
draft
→ pending_backtest
→ backtested
→ approved / rejected
→ activated / archived
```

---

# 9. MVP 开发路线

## Phase 0：基础工程

```text
FastAPI backend
Next.js frontend
PostgreSQL
Redis
Docker Compose
RulePack loader
基础日志
```

---

## Phase 1：Trader Memory Core

```text
导入交易员语料
语义抽取
Ticker Alias Resolver
Market Context Builder
Outcome Labeling
Playbook Engine v0
```

验收：

```text
能把交易员聊天转成结构化事件。
能绑定当时行情。
能计算后续表现。
能生成初始 playbook。
```

---

## Phase 2：Signal Engine

```text
Market Snapshot Service
Market Gate
Setup Detection
Rule Engine
Scoring Engine
Risk Engine
Signal Manager
```

验收：

```text
能扫描固定股票池。
能生成 watch / waiting_trigger / invalidated。
能输出 entry_trigger 和 invalidation。
```

---

## Phase 3：Web Cockpit MVP

```text
Live Dashboard
Agent Chat
Agent Inbox
Agent Timeline
Signals Page
Approval Center
Trade Ticket Drawer
```

验收：

```text
你能看到 Agent 主动消息。
能和 Agent 实时沟通。
能看到 Agent 动作。
能审批 ticket。
```

---

## Phase 4：Tools & Options

```text
Longbridge
yfinance
Alpha Vantage
News API
Web Search
Unusual Whales
Momentum Options Trader Module v0
Options Risk Guard
```

验收：

```text
工具统一经过 Tool Gateway。
期权模块可为现有 signal 加分/减分。
IV / spread / 0DTE 风险能被拦截。
```

---

## Phase 5：Learning & Reflection

```text
Daily Learning
Weekly Reflection
Failure Case Library
Rule Proposal
Rule Backtest
Rule Version Approval
Learning Center
```

验收：

```text
Agent 能每天总结学到了什么。
每周能提出规则建议。
规则不能自动上线，必须审批。
```

---

## Phase 6：Deep Learning Self-Reinforcement

```text
Feature Store
Label Store
Training Dataset Builder
SetupSuccessPredictor
OptionsRiskPredictor
SignalRanker
Shadow Inference
Model Registry
Model Lab
Promotion Gate
```

验收：

```text
模型能在 shadow mode 下预测。
能与 Rule Engine 对比。
能生成模型报告。
不能覆盖硬规则和风控。
```

---

## Phase 7：Paper Trading & Stabilization

```text
paper trading
真实 bid/ask 模拟
滑点建模
成交失败率
策略表现统计
模型漂移监控
系统稳定性优化
```

验收：

```text
至少 60 个交易日 shadow / paper。
记录所有 signal 和 outcome。
验证是否能每周筛出 2-3 个高质量机会。
```

---

# 10. 当前硬件定位

你的当前配置：

```text
RTX 4070 Super / 16GB 级显存
i5-12600KF
32GB RAM
```

足够支撑：

```text
MVP
个人开发
Web Dashboard
PostgreSQL / Redis / Vector DB
交易员语料处理
固定股票池扫描
轻量回测
LightGBM / XGBoost
小型 MLP / LSTM / Transformer Encoder
Shadow Inference
中期稳定验证
```

升级顺序：

```text
1. 内存 32GB → 64GB
2. NVMe 数据盘 2TB+
3. 更好的数据源
4. 云端 worker / VPS
5. 最后再考虑更强 GPU
```

---

# 11. 第一版 RulePack

```yaml
version: "0.1.0"

universe:
  symbols:
    - SPY
    - QQQ
    - TSLA
    - NVDA
    - AAPL
    - COIN
    - BMNR

market_gate:
  high_beta_long_block:
    if:
      - qqq_risk_off
    symbols:
      - TSLA
      - NVDA
      - COIN
      - BMNR

setups:
  vwap_reclaim:
    enabled: true
    required:
      - symbol_reclaims_vwap
      - qqq_not_risk_off
      - relative_volume_gt_threshold
    thresholds:
      min_relative_volume: 1.5
      max_distance_from_vwap_atr: 0.75
    invalidation:
      - symbol_5m_close_below_vwap
      - qqq_loses_vwap

  relative_strength_pullback:
    enabled: true
    required:
      - symbol_outperforms_qqq
      - qqq_not_risk_off
      - pullback_not_high_volume_selloff
    invalidation:
      - relative_strength_turns_negative
      - symbol_breaks_20ema

  opening_range_breakout:
    enabled: true
    required:
      - opening_range_defined
      - break_above_opening_range_high
      - relative_volume_gt_threshold
      - qqq_confirms_direction
    invalidation:
      - price_returns_inside_opening_range

  gap_hold:
    enabled: true
    required:
      - gap_up
      - catalyst_exists
      - price_above_vwap_after_open
    invalidation:
      - gap_fills_quickly
      - price_loses_vwap
    symbol_specific:
      BMNR:
        required:
          - first_30m_hold_above_vwap
          - qqq_not_risk_off
          - crypto_not_weak
        risk_multiplier: 0.3

  daily_breakout_retest:
    enabled: true
    required:
      - daily_breakout_confirmed
      - retest_holds
      - qqq_not_risk_off
    invalidation:
      - daily_close_back_inside_base
      - break_below_20ema

scoring:
  weights:
    market_gate: 25
    trader_playbook_match: 20
    technical_structure: 25
    relative_strength: 15
    volume_confirmation: 10
    catalyst: 5
    options_confirmation: 5
    risk_penalty_max: -25

thresholds:
  watch: 70
  waiting_trigger: 80
  ticket: 85

risk:
  max_trade_risk_pct: 0.5
  max_daily_loss_pct: 1.2
  min_risk_reward: 1.5
  block_if_no_stop: true
  block_0dte_by_default: true
  symbol_risk_multiplier:
    SPY: 1.0
    QQQ: 0.9
    AAPL: 0.9
    NVDA: 0.7
    TSLA: 0.6
    COIN: 0.5
    BMNR: 0.3
```

---

# 12. 系统最终形态

最终系统应该具备以下能力：

```text
1. 读懂顶级交易员语料。
2. 区分观察、等待、进场、止盈、风险提示。
3. 沉淀交易员 playbook。
4. 实时扫描固定股票池。
5. 判断当前市场环境。
6. 调用行情、新闻、期权、flow 工具。
7. 识别高胜率 setup。
8. 判断期权是否适合交易。
9. 输出 preferred instrument。
10. 执行规则和风控。
11. 主动向你发送消息。
12. 支持实时对话。
13. 支持任务、规则、工具授权、审批。
14. 记录所有信号和结果。
15. 每日/每周复盘学习。
16. 深度学习模型在 shadow mode 下持续强化。
17. 经过验证后小权重影响排序和评分。
18. 所有升级可审计、可回滚。
```

---

# 13. 最关键的设计边界

## 13.1 不让 Agent 变成黑箱

每个信号必须能回答：

```text
为什么出现？
对应哪个 playbook？
用了哪些工具？
哪些规则命中？
哪些风险存在？
什么时候失效？
模型怎么看？
历史类似场景结果如何？
```

---

## 13.2 不让模型越权

深度学习模型只能：

```text
预测
排序
调权
建议
过滤
```

不能：

```text
覆盖 hard rule
覆盖 risk block
自动实盘下单
自动提高仓位
自动启用高风险策略
```

---

## 13.3 不让期权模块神化

期权模块必须识别：

```text
IV 过热
spread 过宽
0DTE 风险
flow 可能是 hedge / spread
方向对但期权买贵
```

---

## 13.4 不让系统过度交易

系统目标不是每天交易，而是：

```text
每周筛出 2-3 个高质量候选机会。
没有机会时输出 no trade。
```

---

# 14. 下一步开发顺序

最合理的下一步不是做模型训练，而是先跑通闭环：

```text
1. 数据库 schema
2. 交易员语料导入
3. 语义抽取
4. 市场上下文回填
5. outcome labeling
6. playbook engine
7. market snapshot
8. setup detector
9. rule engine
10. risk engine
11. signal manager
12. dashboard live board
13. agent chat
14. journal
15. daily learning
```

然后再加入：

```text
16. options module
17. feature store / label store
18. supervised models
19. shadow inference
20. model lab
```

---

# 15. 最终结论

本系统应当被定义为：

> **交易员认知驱动 + 工具增强验证 + 规则风控约束 + 深度学习自强化 + Web 人机协作的专业量化 Agent 系统。**

核心链路是：

```text
交易员语料
→ 交易语义
→ 市场上下文
→ 历史结果
→ playbook
→ 当前市场匹配
→ 工具验证
→ 规则评分
→ 风控过滤
→ signal / ticket
→ Web 交互
→ journal
→ learning
→ model shadow
→ rule/model upgrade
```

第一阶段成功标准不是赚钱，而是：

```text
系统能稳定读懂交易员
能生成可解释 signal
能避免明显垃圾交易
能复盘结果
能持续学习
能被你实时控制
```

等这个闭环稳定后，再逐步把 Momentum Options Trader、Opponent Intelligence、深度学习 SignalRanker 和模型自强化链路接入。
