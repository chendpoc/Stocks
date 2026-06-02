# 01 — Agent Core Backend 开发 PRD

版本：`v0.2`  
文档定位：Agent 大脑、语料理解、市场感知、机会发现、规则、风控、学习闭环的开发需求。  
建议读者：后端开发 agent、Agent runtime 开发 agent、数据/策略开发 agent。

---

# Part 2：Layer 1 PRD — Agent Core Backend

---

## 1. Layer 1 总目标

Agent Core Backend 是系统的大脑。它负责：

```text
理解交易员语料
建立交易员认知
识别当前市场状态
调用必要工具
发现固定股票池中的高胜率 setup
执行规则与风控
生成 signal 和 trade ticket 草案
复盘并自我学习
```

Agent Core Backend 不负责：

```text
前端 UI 展示
用户点击交互
审批弹窗
图表渲染
页面状态管理
```

---

## 2. Agent Core Backend 模块总览

```text
Agent Core Backend
├── 1. Corpus Ingestion Service
├── 2. Semantic Extraction Service
├── 3. Ticker Alias Resolver
├── 4. Market Context Builder
├── 5. Outcome Labeling Service
├── 6. Playbook Engine
├── 7. Market Snapshot Service
├── 8. Setup Detection Engine
├── 9. Trader Brain
├── 10. Market Brain
├── 11. Opportunity Brain
├── 12. Rule Engine
├── 13. Scoring Engine
├── 14. Risk Engine
├── 15. Tool Registry / MCP Adapter
├── 16. Signal Manager
├── 17. Trade Ticket Generator
├── 18. Reflection Engine
├── 19. Agent Runtime Orchestrator
├── 20. Agent Explanation Service
└── 21. Rule Discovery / Lite Backtest Engine
```

---

## 3. 模块 1：Corpus Ingestion Service

### 3.1 功能目标

导入交易员历史内容，包括：

```text
Whop 聊天记录
Longbridge topics
截图转录内容
手工笔记
交易员复盘
公开帖子
```

### 3.2 输入

```text
CSV
JSON
TXT
HTML
Markdown
人工录入
API 拉取结果
```

### 3.3 输出

写入表：

```text
trader_raw_messages
```

### 3.4 核心功能

```text
1. 原始语料导入
2. 时间戳标准化
3. 作者识别
4. 来源识别
5. 内容 hash 去重
6. 附件引用保存
7. raw_text 清洗
8. source_url 保存
```

### 3.5 数据结构

```python
class TraderRawMessageInput:
    source: str
    source_url: str | None
    author: str | None
    timestamp: str
    raw_text: str
    attachments: list[dict] | None
    reply_to: str | None
```

### 3.6 API

```text
POST /api/corpus/import
GET  /api/corpus/messages
GET  /api/corpus/messages/{id}
```

### 3.7 验收标准

```text
1. 能导入至少 10,000 条原始聊天记录。
2. 重复内容不会重复入库。
3. 每条消息有 source、timestamp、raw_text。
4. 导入失败记录可追踪。
5. 能按 source、author、date 查询。
```

---

## 4. 模块 2：Semantic Extraction Service

### 4.1 功能目标

把原始聊天内容转成结构化交易事件。

### 4.2 输入

```text
trader_raw_messages.raw_text
```

### 4.3 输出

写入：

```text
trader_semantic_events
```

### 4.4 需要抽取的字段

```text
symbol
aliases
asset_class
action
direction
timeframe
instrument
setup_hint
entry_condition
invalidation
stop
target
thesis
catalysts
risk_notes
language_strength
confidence
```

### 4.5 action 枚举

```text
watch
wait
buy
add
trim
sell
short
avoid
take_profit
stop_loss
risk_warning
recap
unknown
```

### 4.6 language_strength 枚举

```text
weak_observation
conditional_watch
strong_watch
explicit_trade
exit_signal
risk_warning
post_trade_recap
ambiguous
```

### 4.7 核心规则

```text
1. 一条 raw message 可以生成 0-N 个 semantic events。
2. 如果无法判断 ticker，symbol 为空但记录 ambiguity。
3. confidence < 0.65 的事件进入人工 review queue。
4. 不允许低置信事件直接进入 playbook。
5. 输出必须通过 Pydantic schema 校验。
```

### 4.8 示例

原文：

```text
TSLA 别急，等 QQQ 稳一下，VWAP 拿回来再看，不要追第一波。
```

输出：

```json
{
  "symbol": "TSLA",
  "action": "wait",
  "direction": "bullish",
  "timeframe": "intraday",
  "setup_hint": "vwap_reclaim",
  "entry_condition": "QQQ stabilize and TSLA reclaim VWAP",
  "risk_notes": ["do not chase first move"],
  "language_strength": "conditional_watch",
  "confidence": 0.88
}
```

### 4.9 API

```text
POST /api/extraction/run
POST /api/extraction/run/{message_id}
GET  /api/extraction/events
GET  /api/extraction/events/{id}
```

### 4.10 验收标准

```text
1. 对 golden dataset 中 ticker 抽取准确率达到初始 85%。
2. 对 action 抽取准确率达到初始 75%。
3. 所有输出都符合 schema。
4. ambiguous 内容能被标记。
5. human feedback 可用于修正抽取结果。
```

---

## 5. 模块 3：Ticker Alias Resolver

### 5.1 功能目标

解析交易员聊天中的非标准 ticker、简称、期权表达和暗号。

### 5.2 需要处理的示例

```text
tsll 15
circle275
tsla 260c
nvda calls
qqq puts
coin short
bmnr gap
木头姐
巴伦
七巨头
```

### 5.3 输出

```text
resolved_symbol
instrument_type
option_type
strike
expiry
confidence
ambiguity_notes
```

### 5.4 解析逻辑

```text
1. 查标准股票池。
2. 查已知别名表。
3. 查上下文前后消息。
4. 判断数字是否是价格、strike、目标价、日期。
5. 低置信结果标记 ambiguous。
6. ambiguous 结果不允许直接生成交易信号。
```

### 5.5 API

```text
POST /api/ticker-resolver/resolve
GET  /api/ticker-resolver/aliases
POST /api/ticker-resolver/aliases
```

### 5.6 验收标准

```text
1. 能正确解析 TSLA / TSLL / QQQ / NVDA / COIN / BMNR 常见表达。
2. 对模糊表达输出 ambiguity。
3. 用户纠正后能写入 alias map。
```

---

## 6. 模块 4：Market Context Builder

### 6.1 功能目标

为每条交易员语义事件回填当时市场上下文。

### 6.2 输入

```text
TraderSemanticEvent
timestamp
symbol
```

### 6.3 输出

写入：

```text
market_context_snapshots
```

### 6.4 回填内容

```text
symbol price
symbol VWAP
symbol above_vwap
relative volume
relative strength vs QQQ
relative strength vs SPY
SPY state
QQQ state
VIX state
BTC / ETH state for COIN / BMNR
news summary
options summary
```

### 6.5 工具依赖

```text
Longbridge
yfinance
Alpha Vantage
custom historical bar store
```

### 6.6 API

```text
POST /api/context/build/{event_id}
POST /api/context/build/batch
GET  /api/context/{event_id}
```

### 6.7 验收标准

```text
1. 给定任意 event_id，可回填该时间点前后的行情。
2. 不使用未来数据。
3. 对缺失数据有明确 missing 标记。
4. 可以计算 VWAP、relative volume、relative strength。
```

---

## 7. 模块 5：Outcome Labeling Service

### 7.1 功能目标

计算交易员事件或 agent signal 之后的市场表现。

### 7.2 输出字段

```text
return_30m
return_1h
return_eod
return_1d
return_3d
return_5d
return_10d
mfe
mae
outperformed_qqq
hit_stop
hit_target
final_label
```

### 7.3 final_label 枚举

```text
worked
failed
early
late
invalidated
ambiguous
not_trade_signal
insufficient_data
```

### 7.4 API

```text
POST /api/outcomes/label-event/{event_id}
POST /api/outcomes/label-signal/{signal_id}
POST /api/outcomes/batch
GET  /api/outcomes/event/{event_id}
GET  /api/outcomes/signal/{signal_id}
```

### 7.5 验收标准

```text
1. 严格使用 event timestamp 之后的数据。
2. 能计算 MFE / MAE。
3. 能判断是否跑赢 QQQ。
4. 能处理非交易信号。
5. 能批量跑历史事件。
```

---

## 8. 模块 6：Playbook Engine

### 8.1 功能目标

把大量交易员语义事件和结果沉淀为交易员 playbook。

### 8.2 Playbook 示例

```text
TSLA VWAP Reclaim After Early Weakness
NVDA Relative Strength Pullback
COIN Crypto Beta Momentum
BMNR Gap Hold Failure Pattern
QQQ Risk-On Filter
High IV Avoid Rule
```

### 8.3 核心功能

```text
1. 手动创建 playbook。
2. 半自动聚类相似事件。
3. 绑定 playbook_examples。
4. 更新 playbook 胜率、MFE、MAE、sample size。
5. 检索当前市场最相似 playbook。
6. 记录 failure modes。
```

### 8.4 API

```text
GET  /api/playbooks
POST /api/playbooks
GET  /api/playbooks/{id}
PATCH /api/playbooks/{id}
POST /api/playbooks/{id}/attach-event
POST /api/playbooks/retrieve
POST /api/playbooks/update-stats
```

### 8.5 验收标准

```text
1. 至少可以创建 3 个初始 playbook。
2. 每个 playbook 可以关联历史事件。
3. 每个 playbook 有 sample_size、win_rate、avg_mfe、avg_mae。
4. 给定当前 market context，可以检索相似 playbook。
```

---

## 9. 模块 7：Market Snapshot Service

### 9.1 功能目标

实时构建固定股票池市场快照。

### 9.2 输入

```text
universe symbols
current time
market data tools
```

### 9.3 输出

```text
MarketSnapshot
```

### 9.4 需要计算

```text
price
open
high
low
previous_close
VWAP
opening range high / low
relative volume
relative strength vs QQQ
relative strength vs SPY
ATR
EMA8
EMA20
SMA50
market regime
market gate
```

### 9.5 API

```text
GET /api/market/snapshot
GET /api/market/snapshot/{symbol}
POST /api/market/snapshot/refresh
```

### 9.6 验收标准

```text
1. 能返回 SPY、QQQ、TSLA、NVDA、AAPL、COIN、BMNR 快照。
2. 数据有 freshness 标记。
3. 快照能用于 Rule Engine。
4. 数据缺失时不崩溃。
```

---

## 10. 模块 8：Setup Detection Engine

### 10.1 功能目标

检测固定五类 setup。

### 10.2 Setup 检测器

```text
detect_vwap_reclaim
detect_relative_strength_pullback
detect_opening_range_breakout
detect_gap_hold
detect_daily_breakout_retest
```

### 10.3 输出

```text
setup_type
matched
evidence
missing_conditions
risk_flags
```

### 10.4 API

```text
POST /api/setups/detect
POST /api/setups/detect/{symbol}
```

### 10.5 验收标准

```text
1. 每个 setup 有独立检测函数。
2. 检测结果不依赖 LLM 主观判断。
3. 能输出缺失条件。
4. 能输出失效条件。
```

---

## 11. 模块 9：Trader Brain

### 11.1 功能目标

模拟交易员认知，不是直接交易，而是回答：

```text
当前市场是否像交易员历史上的某个 playbook？
这句话是观察、等待、交易还是风险提醒？
交易员过去类似场景怎么处理？
历史结果如何？
```

### 11.2 输入

```text
current symbol
setup_type
market context
semantic events
playbooks
human feedback
```

### 11.3 输出

```text
playbook_match
similar_cases
trader_language_interpretation
historical_stats
failure_modes
```

### 11.4 API

```text
POST /api/trader-brain/match
POST /api/trader-brain/interpret-message
GET  /api/trader-brain/profile
```

### 11.5 验收标准

```text
1. 能对当前 signal 返回 playbook match。
2. 能解释交易员历史中类似场景的处理方式。
3. 能区分 conditional_watch 和 explicit_trade。
4. 输出必须可追溯到历史案例。
```

---

## 12. 模块 10：Market Brain

### 12.1 功能目标

判断当前市场状态和 ticker 质量。

### 12.2 输出

```text
market_gate
market_regime
ticker_strength
news_catalyst
options_confirmation
crypto_beta_state
flow_warning
```

### 12.3 API

```text
POST /api/market-brain/analyze
POST /api/market-brain/analyze/{symbol}
```

### 12.4 验收标准

```text
1. 能判断 risk_on / risk_off / mixed / chop。
2. 能判断 ticker 是否强于 QQQ。
3. 能为 COIN / BMNR 添加 BTC / ETH 过滤。
4. 能输出 market gate pass / caution / block。
```

---

## 13. 模块 11：Opportunity Brain

### 13.1 功能目标

综合 setup、Trader Brain、Market Brain、工具结果，生成机会候选。

### 13.2 输出

```text
SignalCandidate
```

### 13.3 API

```text
POST /api/opportunity/scan
POST /api/opportunity/scan/{symbol}
```

### 13.4 验收标准

```text
1. 能扫描完整 MVP 股票池。
2. 能生成 watch / waiting_trigger / invalidated。
3. 能引用 playbook_match。
4. 能给出 entry_trigger 和 invalidation。
```

---

## 14. 模块 12：Rule Engine

### 14.1 功能目标

执行确定性规则，不依赖 LLM 主观判断。

### 14.2 规则类型

```text
hard
soft
preference
notification
tool
learning
temporary
```

### 14.3 输出

```text
rule_pass
rule_hits
block_reasons
score_adjustments
required_approvals
```

### 14.4 API

```text
POST /api/rules/evaluate
GET  /api/rules/current
POST /api/rules/simulate
```

### 14.5 验收标准

```text
1. QQQ risk-off 能 block 高 beta 多头。
2. BMNR 特殊规则可生效。
3. 临时规则可覆盖常规规则。
4. 每次 rule hit 都有日志。
```

---

## 15. 模块 13：Scoring Engine

### 15.1 功能目标

给机会打 0-100 分。

### 15.2 默认权重

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

### 15.3 分数等级

```text
85-100：可进入 ticket 评估
80-84：waiting_trigger
70-79：watch
<70：ignore
```

### 15.4 API

```text
POST /api/scoring/score-signal
```

### 15.5 验收标准

```text
1. 输入相同数据时输出确定。
2. 每个加减分项可追溯。
3. 分数变化能记录到 signal history。
```

---

## 16. 模块 14：Risk Engine

### 16.1 功能目标

执行最高优先级风控。

### 16.2 硬规则

```text
1. 没有止损不生成 ticket。
2. R/R < 1.5 不生成 ticket。
3. QQQ risk-off 禁止 TSLA / NVDA / COIN / BMNR 多头。
4. BMNR 使用 0.3 风险系数。
5. COIN 使用 0.5 风险系数。
6. 0DTE 默认禁止。
7. 单日亏损达到阈值后暂停新 ticket。
8. 高成本工具和执行工具需审批。
```

### 16.3 API

```text
POST /api/risk/check
GET  /api/risk/state
```

### 16.4 验收标准

```text
1. Risk Engine 可以 veto 所有 signal。
2. 每个 block 都有原因。
3. ticket 生成前必须通过 Risk Engine。
```

---

## 17. 模块 15：Tool Registry / MCP Adapter

### 17.1 功能目标

统一管理 agent 可调用工具。

### 17.2 工具分类

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

### 17.3 工具能力

```text
Longbridge market snapshot
Longbridge option chain
yfinance historical bars
Alpha Vantage options / indicators
Unusual Whales options flow / dark pool / GEX
News API
Web Search
Deep Search
Crypto price
Trader Memory Retrieval
Backtest
Outcome Labeling
```

### 17.4 工具调用原则

```text
1. 先查低成本工具。
2. 只有必要时查高成本工具。
3. deep search 默认需要审批。
4. execution tool 默认 disabled。
5. 所有 tool call 写入 audit log。
```

### 17.5 API

```text
GET  /api/tools
POST /api/tools/call
GET  /api/tools/calls
```

### 17.6 验收标准

```text
1. 每个工具有 input_schema 和 output_schema。
2. 工具调用失败不会导致 agent 崩溃。
3. 工具调用有 rate limit。
4. 高风险工具触发 approval。
```

---

## 18. 模块 16：Signal Manager

### 18.1 功能目标

管理 signal 生命周期。

### 18.2 功能

```text
create_signal
update_signal
invalidate_signal
trigger_signal
archive_signal
record_signal_history
push_signal_event
```

### 18.3 API

```text
GET  /api/signals
POST /api/signals
GET  /api/signals/{id}
PATCH /api/signals/{id}
POST /api/signals/{id}/invalidate
POST /api/signals/{id}/trigger
```

### 18.4 验收标准

```text
1. signal 状态流转合法。
2. 每次状态变化写入 agent_events。
3. 每次重要状态变化推送 WebSocket。
```

---

## 19. 模块 17：Trade Ticket Generator

### 19.1 功能目标

生成条件型交易计划草案。

### 19.2 生成条件

```text
1. signal score >= ticket threshold。
2. signal status == triggered 或符合 waiting approval 条件。
3. Risk Engine pass。
4. 有明确 entry、stop、target、invalidation。
5. 需要人工审批。
```

### 19.3 输出

```text
TradeTicket
```

### 19.4 API

```text
POST /api/tickets/generate/{signal_id}
GET  /api/tickets
GET  /api/tickets/{id}
```

### 19.5 验收标准

```text
1. 没有 stop 不生成 ticket。
2. ticket 默认 waiting_manual_approval。
3. ticket 包含 rationale 和 invalidation。
4. ticket 不自动下单。
```

---

## 20. 模块 18：Reflection Engine

### 20.1 功能目标

让 agent 受控自我学习。

### 20.2 Daily Learning

```text
导入新语料
抽取事件
绑定上下文
计算 outcome
更新 playbook
生成 daily learning summary
```

### 20.3 Weekly Reflection

```text
统计 setup 表现
统计 ticker 表现
分析失败案例
生成 rule proposal
执行或排队简版回测
生成精简说明报告
进入纸上跟踪或人工审批
```

### 20.4 API

```text
POST /api/reflection/daily
POST /api/reflection/weekly
GET  /api/reflection/summaries
GET  /api/reflection/rule-proposals
```

### 20.5 验收标准

```text
1. 每日可生成 learning summary。
2. 每周可生成 rule proposals。
3. rule proposal 不自动上线。
4. 候选规则进入下一阶段前必须有简版回测报告。
5. 失败案例可入库。
```

---

## 20A. Phase 1.5 Extension：Rule Discovery / Lite Backtest Engine

### 20A.1 功能目标

把赵哥语料、市场结构变化、新闻公告、行情异动和失败案例转成 `RuleCandidate`，为候选规则生成证据需求，执行简版回测，并生成 `LiteBacktestReport`。

### 20A.2 输入

```text
trader_semantic_events
playbooks
market_context_snapshots
event_outcomes
signals
human_feedback
LocalToolAdapter / Tool Gateway data
```

### 20A.3 输出

```text
rule_candidates
rule_candidate_evidence_requirements
lite_backtest_reports
rule_proposals
agent_events
approval_requests
```

### 20A.4 状态边界

```text
draft
→ evidence_required
→ backtest_pending
→ backtested
→ needs_more_data / rejected / pending_shadow_tracking / pending_manual_approval
→ manually_approved
→ versioned / archived
```

`versioned` 不等于自动上线。只有人工审批后的显式发布动作才能写入 active RulePack。

### 20A.5 API

```text
POST /api/rule-candidates
GET  /api/rule-candidates
GET  /api/rule-candidates/{id}
POST /api/rule-candidates/{id}/evidence-requirements
POST /api/rule-candidates/{id}/lite-backtest
GET  /api/rule-candidates/{id}/lite-backtest-report
POST /api/rule-candidates/{id}/submit-approval
```

### 20A.6 验收标准

```text
1. 每个候选规则都有 trigger、entry_condition、invalidation、data_requirements。
2. 每个进入 shadow tracking 或 manual approval 的候选规则都有 LiteBacktestReport。
3. LiteBacktestReport 包含样本窗口、样本量、win_rate、avg_return、median_return、MFE、MAE、成本假设、证据缺口和结论。
4. 简版回测不能使用未来信息。
5. 没有人工审批时，候选规则不能进入 active RulePack。
```

---

## 21. 模块 19：Agent Runtime Orchestrator

### 21.1 功能目标

编排 agent 的完整运行流程。

### 21.2 实时扫描流程

```text
load_market_snapshot
→ analyze_market_gate
→ detect_setup
→ retrieve_playbook
→ call_required_tools
→ evaluate_rules
→ score_signal
→ risk_check
→ update_signal
→ push_dashboard_event
```

### 21.3 API

```text
POST /api/agent/run-scan
POST /api/agent/run-symbol/{symbol}
GET  /api/agent/runs
GET  /api/agent/runs/{id}
```

### 21.4 验收标准

```text
1. 每次运行有 run_id。
2. 每个步骤写入 agent_events。
3. 可从 Web 查看 agent 动作 timeline。
```

---

## 22. 模块 20：Agent Explanation Service

### 22.1 功能目标

把 agent 判断转成用户可理解的解释。

### 22.2 输入

```text
signal
market snapshot
playbook match
rule hits
risk decision
tool outputs
```

### 22.3 输出格式

```text
结论
当前状态
证据
缺失条件
风险
下一步动作
可执行按钮
```

### 22.4 API

```text
POST /api/agent/explain-signal/{signal_id}
POST /api/agent/chat
POST /api/agent/chat/stream
```

### 22.5 验收标准

```text
1. 解释必须引用证据。
2. 不允许输出无依据买卖建议。
3. 必须区分 watch、waiting_trigger、triggered。
4. 必须说明失效条件。
```

---
