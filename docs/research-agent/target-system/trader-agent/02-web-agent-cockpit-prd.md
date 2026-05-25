# 02 — Web Agent Cockpit 开发 PRD

版本：`v0.2`  
文档定位：Web 工作台、实时对话、主动消息、任务、规则、能力、审批、学习中心的开发需求。  
建议读者：前端开发 agent、交互设计 agent、全栈开发 agent。

---

# Part 3：Layer 2 PRD — Web Agent Cockpit

---

## 1. Layer 2 总目标

Web Agent Cockpit 是用户与 agent 协作的工作台。它负责：

```text
实时展示 agent 状态
接收 agent 主动消息
支持用户与 agent 实时对话
展示 agent 动作和工具调用
允许用户设置任务、规则、工具权限
允许用户审批高风险动作
允许用户纠正 agent
展示 playbook、journal、learning summary
```

---

## 2. Web Cockpit 页面总览

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
/settings
/audit
```

MVP 必须优先完成：

```text
/dashboard/live
/chat
/inbox
/tasks
/rules
/capabilities
/approvals
/signals
/learning
```

---

## 3. 页面 1：Live Dashboard

### 3.1 功能目标

实时展示市场状态、固定股票池状态、agent 当前信号和主动消息。

### 3.2 页面布局

```text
┌──────────────────────────────────────────────────────────────┐
│ Market Gate Bar                                              │
├───────────────┬──────────────────────────────┬───────────────┤
│ Watchlist     │ Main Workspace               │ Agent Panel   │
│ Setup Board   │ Chart / Signal / Evidence    │ Chat/Actions  │
├───────────────┴──────────────────────────────┴───────────────┤
│ Agent Timeline                                               │
└──────────────────────────────────────────────────────────────┘
```

### 3.3 组件

```text
MarketGateBar
WatchlistSetupBoard
MainChartPanel
SignalEvidencePanel
TraderBrainPanel
AgentPanel
AgentTimeline
TradeTicketDrawer
```

### 3.4 MarketGateBar 显示

```text
Market Gate: PASS / CAUTION / BLOCK
Regime: risk_on / risk_off / mixed / chop
QQQ state
SPY state
VIX state
Data freshness
Daily risk used
Active tasks
Open signals
Pending approvals
```

### 3.5 WatchlistSetupBoard 显示

每个 ticker card：

```text
Symbol
Price
Score
Setup
Status
RS vs QQQ
Relative Volume
Risk Level
Main Reason
```

### 3.6 验收标准

```text
1. 能实时显示固定股票池。
2. signal 状态变化能实时更新。
3. 点击 ticker 可切换主工作区。
4. Market Gate 变化有明显提示。
5. Agent 主动消息能弹出或进入 Inbox。
```

---

## 4. 页面 2：Agent Chat

### 4.1 功能目标

用户能和 agent 实时沟通，且 chat 绑定当前上下文。

### 4.2 关键能力

```text
1. 流式回复。
2. 上下文绑定。
3. 快捷指令。
4. 证据卡片。
5. 可执行按钮。
6. 聊天记录保存。
```

### 4.3 Chat 上下文

```text
current_symbol
current_signal_id
current_playbook_id
current_task_id
current_chart_timeframe
current_rulepack_version
```

### 4.4 快捷按钮

```text
解释当前信号
为什么不能进
生成 Trade Ticket
比较 TSLA 和 NVDA
调用新闻搜索
调用期权确认
创建监控任务
标记为噪声
设置临时规则
```

### 4.5 Agent 回答格式

```text
结论
状态
证据
缺失条件
风险
下一步动作
按钮
```

### 4.6 验收标准

```text
1. 在 TSLA 页面问“为什么不能进”，agent 能读取 TSLA 当前 signal。
2. agent 回复必须包含状态和失效条件。
3. 用户可从回答中触发任务、规则、审批等动作。
```

---

## 5. 页面 3：Agent Inbox

### 5.1 功能目标

统一展示 agent 主动消息。

### 5.2 消息类型

```text
market_gate_changed
signal_created
signal_updated
signal_near_trigger
signal_triggered
signal_invalidated
risk_rule_triggered
trade_ticket_ready
approval_required
tool_permission_required
task_completed
learning_summary_ready
rule_proposal_created
```

### 5.3 优先级

```text
info
watch
action_required
risk
critical
```

### 5.4 Inbox 功能

```text
过滤
已读
确认
忽略
执行动作
跳转相关 signal / task / approval
```

### 5.5 验收标准

```text
1. agent 主动消息能进入 Inbox。
2. action_required 消息能生成待办。
3. risk / critical 有醒目标识。
4. 消息可确认或关闭。
```

---

## 6. 页面 4：Agent Action Timeline

### 6.1 功能目标

让用户看到 agent 做了什么。

### 6.2 展示动作

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
update_signal
generate_message
request_approval
record_journal
propose_rule
```

### 6.3 显示模式

```text
Simple：只看结论
Detailed：看步骤和摘要
Developer：看 JSON payload 和 tool IO
```

### 6.4 验收标准

```text
1. 每个 agent run 有 timeline。
2. 每个 tool call 有 duration、status、summary。
3. 失败步骤能显示错误。
4. 不展示隐藏推理，只展示动作和证据摘要。
```

---

## 7. 页面 5：Task Center

### 7.1 功能目标

用户能设置 agent 任务。

### 7.2 任务类型

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

### 7.3 任务创建方式

```text
自然语言创建
表单创建
模板创建
```

### 7.4 任务字段

```text
name
description
task_type
symbols
setup_types
timeframe
schedule
triggers
allowed_tools
approval_policy
status
```

### 7.5 示例任务

```text
每天盘前 8:30 分析 TSLA、NVDA、COIN、BMNR
每 30 秒监控 TSLA VWAP Reclaim
每周五收盘后生成周度反思
```

### 7.6 验收标准

```text
1. 用户可创建、暂停、恢复、删除任务。
2. 任务可绑定 ticker 和 setup。
3. 任务运行结果可写入 agent_events。
4. 定时任务能自动运行。
```

---

## 8. 页面 6：Rule Studio

### 8.1 功能目标

用户能为 agent 设置规则。

### 8.2 规则类型

```text
hard
soft
preference
notification
tool
learning
temporary
```

### 8.3 编辑模式

```text
Visual Builder
YAML / JSON Editor
自然语言转规则草案
```

### 8.4 规则功能

```text
创建
启用
暂停
模拟
回测
版本化
删除
```

### 8.5 典型规则

```text
QQQ risk-off 禁止高 beta 多头
BMNR 开盘 30 分钟跌破 VWAP 禁止多头
Deep Search 需要审批
TSLA playbook match > 0.75 加分
今天暂停 BMNR
```

### 8.6 验收标准

```text
1. 用户能创建 hard rule。
2. 规则能被 Rule Engine 命中。
3. 每次 rule hit 在 signal 中可见。
4. 修改硬规则需要审批或确认。
```

---

## 9. 页面 7：Capability Center

### 9.1 功能目标

用户能控制 agent 可调用哪些工具，以及调用权限。

### 9.2 Capability 分类

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

### 9.3 权限级别

```text
disabled
read_only
analysis_allowed
approval_required
auto_allowed
```

### 9.4 工具示例

```text
Longbridge market snapshot
Longbridge option chain
yfinance history
Alpha Vantage options
Unusual Whales options flow
News API
Web Search
Deep Search
Longbridge order execution
```

### 9.5 验收标准

```text
1. 用户能启用/禁用工具。
2. 用户能设置 rate limit。
3. Deep Search 可设置 approval_required。
4. Execution capability 默认 disabled。
5. 工具调用权限能被后端拦截。
```

---

## 10. 页面 8：Approval Center

### 10.1 功能目标

管理所有需要人工审批的动作。

### 10.2 审批类型

```text
trade_ticket
tool_call
rule_change
task_change
capability_change
risk_override
```

### 10.3 审批动作

```text
approve
reject
defer
ask_agent
view_evidence
```

### 10.4 验收标准

```text
1. Agent 请求审批时前端实时收到。
2. 用户可以批准或拒绝。
3. 审批结果写回 Agent Runtime。
4. 所有审批有审计记录。
```

---

## 11. 页面 9：Signals

### 11.1 功能目标

查看所有机会信号。

### 11.2 字段

```text
Ticker
Timeframe
Setup
Score
Status
Market Gate
Trader Match
Entry Trigger
Invalidation
Preferred Instrument
Risk Flags
Created At
Updated At
```

### 11.3 操作

```text
查看详情
询问 agent
生成 ticket
标记噪声
加入 journal
```

### 11.4 验收标准

```text
1. 能按 status / symbol / setup 筛选。
2. signal 详情可显示证据。
3. signal 可进入 Journal。
```

---

## 12. 页面 10：Playbook Library

### 12.1 功能目标

展示交易员 playbook。

### 12.2 字段

```text
Name
Symbols
Setup Type
Sample Size
Win Rate
Avg MFE
Avg MAE
Preferred Timeframe
Failure Modes
Version
Status
```

### 12.3 功能

```text
查看历史案例
查看原始聊天
查看 outcome
手动编辑 playbook
禁用低质量 playbook
```

### 12.4 验收标准

```text
1. 每个 playbook 可追溯到样本。
2. 可显示成功案例和失败案例。
3. 可用于当前 signal 匹配展示。
```

---

## 13. 页面 11：Journal

### 13.1 功能目标

记录 signal、ticket、人工决策、结果和复盘。

### 13.2 字段

```text
Signal ID
Ticker
Setup
Score
Entry
Stop
Target
Outcome
MFE
MAE
Return 1D / 3D / 5D
Hit Stop
Hit Target
Review Notes
```

### 13.3 验收标准

```text
1. 每个 signal 可生成 journal entry。
2. 可统计胜率、平均 R、失败原因。
3. 用户可添加手工笔记。
```

---

## 14. 页面 12：Learning Center

### 14.1 功能目标

展示 agent 自我学习过程。

### 14.2 内容

```text
今日导入语料数量
抽取事件数量
低置信事件数量
新增 playbook 样本
今日有效观点
今日失败观点
规则建议
待回测规则
当前 RulePack 版本
```

### 14.3 验收标准

```text
1. Daily Learning Summary 可查看。
2. Weekly Reflection 可查看。
3. Rule Proposal 可审批。
4. 用户可反馈 agent 学习结论是否正确。
```

---

## 15. Web Cockpit 事件处理

### 15.1 WebSocket 事件

```text
market.regime.updated
ticker.snapshot.updated
signal.created
signal.updated
signal.triggered
signal.invalidated
agent.message.created
agent.event.created
approval.created
task.updated
rule.hit
learning.summary.ready
```

### 15.2 前端状态管理

```text
marketStore
signalStore
agentMessageStore
taskStore
ruleStore
approvalStore
chatStore
```

### 15.3 验收标准

```text
1. WebSocket 断线可自动重连。
2. 事件重复不会导致重复渲染。
3. 重要事件有本地 notification。
4. 前端状态和后端状态可重新同步。
```

---
