# 00 — 交易员认知型自学习交易 Agent：整体系统架构设计

版本：`v0.2`  
文档定位：系统总览、边界、三层架构、MVP 范围、总体流程。  
建议读者：架构 agent、产品 agent、技术负责人、后续模块拆解 agent。

---

# 0. 项目总定义

本系统的目标不是构建一个普通量化机器人，也不是做一个新闻总结工具，而是构建一个：

> **以顶级个人交易员历史语料为认知核心，以市场工具为验证能力，以规则和风控为行动边界，以复盘为学习机制，以 Web 工作台为人机协作界面的专业交易 Agent 系统。**

系统需要做到：

```text
理解交易员历史聊天内容
→ 抽取交易员语言和交易逻辑
→ 沉淀交易员 playbook
→ 结合实时行情、新闻、期权流等工具验证当前市场
→ 在固定股票池中发现高胜率 setup
→ 输出 watch / waiting_trigger / triggered / invalidated 等清晰状态
→ 必要时生成条件型 trade ticket
→ 每日/每周复盘并提出规则优化建议
→ 通过 Web 工作台让用户实时观察、对话、控制、审批和纠正 agent
```

---

# Part 1：整体系统架构设计

---

## 1. 系统拆分

整个系统拆成三层：

```text
Layer 1：Agent Core Backend
负责 agent 的认知、判断、工具调用、规则、风控、学习和信号生成。

Layer 2：Web Agent Cockpit
负责用户与 agent 的实时交互、观察、控制、审批、任务设置和规则配置。

Layer 3：Shared Platform Layer
负责数据库、事件总线、API、任务调度、缓存、权限、审计、日志和工具网关。
```

三层关系：

```text
┌──────────────────────────────────────────────────────────────┐
│                    Web Agent Cockpit                         │
│   Live Dashboard / Chat / Tasks / Rules / Approvals / Journal│
└───────────────────────────────┬──────────────────────────────┘
                                │
                 REST / WebSocket / SSE / API
                                │
┌───────────────────────────────▼──────────────────────────────┐
│                    Agent Core Backend                         │
│ Trader Brain / Market Brain / Rule Engine / Risk / Reflection│
└───────────────────────────────┬──────────────────────────────┘
                                │
                  DB / Redis / Events / Tools / Logs
                                │
┌───────────────────────────────▼──────────────────────────────┐
│                    Shared Platform Layer                      │
│ PostgreSQL / Redis / Vector DB / Workers / Tool Gateway       │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. 三层核心职责

| 层级 | 名称 | 核心职责 |
|---|---|---|
| Layer 1 | Agent Core Backend | 让 agent 会理解交易员、会分析市场、会发现机会、会风控、会学习 |
| Layer 2 | Web Agent Cockpit | 让用户能实时看到、询问、控制、审批、纠正 agent |
| Layer 3 | Shared Platform Layer | 让系统稳定运行，提供数据、事件、任务、工具、权限、日志和审计 |

---

## 3. MVP 范围

### 3.1 固定股票池

第一版只覆盖：

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

### 3.2 固定 setup

第一版只做五类 setup：

```text
1. VWAP Reclaim
2. Relative Strength Pullback
3. Opening Range Breakout
4. Gap Hold / Gap Continuation
5. Daily Breakout Retest
```

### 3.3 默认输出目标

每周目标：

```text
高质量候选机会：2-5 个
实际可进场候选：2-3 个
无机会时允许 0 个
```

### 3.4 默认行动边界

```text
不自动实盘下单
不自动扩大股票池
不自动提升仓位
不自动启用高风险工具
不自动上线新规则
所有 trade ticket 默认需要人工审批
```

### 3.5 v1 自我进化边界

第一版允许 agent 发现新的候选规则，但“发现”必须被定义为研究产物，而不是自动上线：

```text
候选机制
    ↓
证据需求清单
    ↓
简版回测
    ↓
精简说明报告
    ↓
纸上跟踪或人工审批
```

简版回测的目标是判断候选机制是否值得继续跟踪，不证明它可以实盘执行。任何新规则即使通过简版回测，也只能进入 `pending_shadow_tracking` 或 `pending_manual_approval`，不能自动进入 active RulePack。

---

## 4. 总体业务流程

### 4.1 离线学习流程

```text
交易员新语料导入
    ↓
清洗、去重、时间标准化
    ↓
语义抽取：ticker / action / direction / setup / risk
    ↓
Ticker / alias 解析
    ↓
绑定当时市场上下文
    ↓
计算后续市场结果
    ↓
沉淀或更新 playbook
    ↓
更新 playbook 统计
    ↓
生成 daily learning summary
    ↓
生成 rule proposal
    ↓
执行简版回测
    ↓
输出精简说明报告
    ↓
进入纸上跟踪或人工审批
```

### 4.2 实时机会发现流程

```text
获取市场快照
    ↓
判断 SPY / QQQ market gate
    ↓
扫描固定股票池
    ↓
识别 setup
    ↓
检索交易员历史 playbook
    ↓
按需调用行情、新闻、期权、flow 工具
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
必要时生成主动消息或审批请求
```

### 4.3 用户交互流程

```text
用户在 Web 工作台查看 signal
    ↓
用户询问 agent
    ↓
agent 读取当前上下文：ticker / signal / playbook / market snapshot
    ↓
agent 解释判断依据
    ↓
用户可创建任务、设置规则、授权工具、审批 ticket、提交反馈
    ↓
系统把用户反馈写入学习层
```

---

## 5. 系统关键对象

系统的核心对象如下：

```text
TraderRawMessage
TraderSemanticEvent
MarketContextSnapshot
EventOutcome
Playbook
PlaybookExample
MarketSnapshot
SignalCandidate
TradeTicket
AgentMessage
AgentActionEvent
AgentTask
AgentRule
AgentCapability
ApprovalRequest
HumanFeedback
RuleCandidate
EvidenceRequirement
LiteBacktestReport
RuleProposal
RuleVersion
LearningSummary
```

这些对象是三层系统之间的共享语言。

---

## 6. 核心状态机

### 6.1 Signal 状态机

```text
ignore
  ↓
watch
  ↓
waiting_trigger
  ↓
triggered
  ↓
ticket_ready
  ↓
waiting_approval
  ↓
approved / rejected
  ↓
in_trade / review
  ↓
completed
```

### 6.2 Agent Task 状态机

```text
draft
  ↓
active
  ↓
running
  ↓
completed / failed
  ↓
paused / archived
```

### 6.3 Rule Proposal 状态机

```text
draft
  ↓
evidence_required
  ↓
backtest_pending
  ↓
backtested
  ↓
needs_more_data / rejected / pending_shadow_tracking / pending_manual_approval
  ↓
manually_approved
  ↓
versioned / archived
```

`versioned` 只表示已经生成可审查的规则版本。写入 active RulePack 必须由人工审批后的显式发布动作完成，不能由回测结果自动触发。

### 6.4 Approval 状态机

```text
pending
  ↓
approved / rejected / deferred / expired
```

---

## 7. 总体技术栈建议

技术栈按阶段选择，不把生产化基础设施提前变成 MVP 硬依赖。

### Backend

```text
MVP-lite 默认：
Python
FastAPI
Pydantic
SQLAlchemy / SQLModel
SQLite 或本地文件型存储
APScheduler 或进程内任务调度
进程内缓存 / 本地事件日志
自建状态机

生产化升级：
PostgreSQL
Redis
Celery / Prefect
pgvector / Qdrant
LangGraph
```

选择原则：

```text
1. 单人本地 MVP 先用 SQLite / 本地事件日志，验证 agent 闭环。
2. 需要多用户并发、长期审计、复杂查询、远程部署时升级 PostgreSQL。
3. 需要跨进程 WebSocket fanout、分布式 worker、共享 rate limit 时引入 Redis。
4. 需要大规模语义检索时再引入 pgvector / Qdrant。
5. 不为“看起来专业”增加基础设施；每个组件必须对应明确瓶颈。
```

### Frontend

```text
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui
TradingView Lightweight Charts
TanStack Query
Zustand
```

### Tool / Agent

```text
MCP Server 或自定义 Tool Registry
Longbridge SDK
Alpha Vantage
yfinance
Unusual Whales
News API
Web Search
Deep Search
Custom process functions
```

---
