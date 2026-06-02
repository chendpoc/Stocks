# 05 Agent Inbox

## 目标与非目标

目标：实现 `/inbox`，集中展示 Agent 主动提醒：机会、市场 gate、风险/失效和学习摘要。

非目标：

- 不处理审批。
- 不创建任务。
- 不作为消息营销流。

## 消息类型

```text
signal_created
signal_updated
signal_near_trigger
signal_triggered_for_attention
signal_invalidated
market_gate_changed
risk_or_invalidation_notice
learning_summary_ready
playbook_theory_candidate
```

## 优先级

```text
info
watch
attention
risk
critical
```

## 页面/组件拆分

| Component | Responsibility |
|---|---|
| `InboxPage` | route composition |
| `InboxFilterBar` | type, priority, unread, symbol filters |
| `InboxMessageList` | dense message list |
| `InboxDetailPanel` | reason, linked signal/theory/source |
| `InboxActionBar` | mark read, open signal, open chat |

## 数据输入输出

Inputs:

- `AgentEventViewModel[]`
- `SignalViewModel[]`
- `LearningItemViewModel[]`

Outputs:

- mark read locally
- open linked signal
- open linked theory
- open chat with message context

## API 与更新策略

Real-readonly:

- `GET /api/agent/events`

Mock fallback:

- signal notifications
- learning notifications

Update model:

- polling default 1 minute
- unread state local

## 验收标准

- Inbox shows signal, market gate, risk/invalidation and learning categories.
- Unread and priority are visually clear.
- User can open linked signal/theory/chat context.
- No approval, task, order or execution action appears.

## 测试场景

- Component test filtering by message type.
- Component test risk/invalidation priority style.
- Component test linked signal navigation.
- Playwright smoke: open inbox, filter unread, open linked signal.
