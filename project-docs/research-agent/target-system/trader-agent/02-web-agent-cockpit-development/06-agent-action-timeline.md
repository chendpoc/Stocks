# 06 Agent Action Timeline

## 目标与非目标

目标：提供嵌入式时间线组件，让用户看到 Agent 做过哪些只读分析、工具调用和证据聚合。

非目标：

- 不展示隐藏推理。
- 不展示执行动作。
- 不作为完整审计中心。

## 展示动作

```text
observe_market
retrieve_trader_memory
search_news
search_web
match_playbook_theory
evaluate_playbook_rule
score_signal
mark_signal_status
explain_market_intent
generate_scenario_plan
record_learning_candidate
```

## 页面/组件拆分

| Component | Responsibility |
|---|---|
| `AgentTimeline` | generic embedded timeline |
| `TimelineFilterBar` | symbol, signal, theory, event type filters |
| `TimelineItem` | event summary and status |
| `ToolCallSummary` | tool source and duration |
| `TimelineDetailDrawer` | payload summary and linked evidence |

## 数据输入输出

Inputs:

- `AgentEventViewModel[]`
- `ToolSourceViewModel[]`
- linked signal/theory ids

Outputs:

- filter timeline
- open detail
- open linked evidence/source/signal/theory

## API 与更新策略

Real-readonly:

- `GET /api/agent/events`
- `GET /api/agent/runs`
- `GET /api/agent/runs/{run_id}`

Update model:

- embedded surfaces poll with parent page
- detail drawer can fetch run detail on demand

## 验收标准

- Timeline shows tool calls and analysis events with status.
- User can filter by signal, theory, symbol and event type.
- Failed tool calls show error summary without hiding prior evidence.
- No hidden chain-of-thought is displayed.
- No execution, order, approval or task event is required.

## 测试场景

- Component test grouped timeline rendering.
- Component test failed tool call state.
- Component test run detail drawer.
