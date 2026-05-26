# 11 Signals

## 目标与非目标

目标：实现 `/signals`，作为机会与关注计划中心。它展示 Agent 发现的信号、状态、标签、市场意图、情景树、触发条件、失效条件和证据。

非目标：

- 不生成订单。
- 不提交审批。
- 不编辑规则。

## 页面/组件拆分

| Component | Responsibility |
|---|---|
| `SignalsPage` | route composition |
| `SignalFilterBar` | symbol, status, tag, confidence filters |
| `SignalTable` | dense opportunity list |
| `SignalDetailDrawer` | intent, evidence, scenario plan, theory matches |
| `ScenarioPlanPanel` | watch/trigger/invalidation condition tree |
| `TheoryMatchPanel` | matched PlaybookTheory and PlaybookRule array |
| `PostValidationPreview` | validation due/result when available |

## 数据输入输出

Inputs:

- `SignalViewModel[]`
- `ScenarioPlan`
- `SignalExplanationViewModel`
- `PlaybookTheory[]`
- `ToolSourceViewModel[]`

Outputs:

- filter signals
- select signal
- open chat with signal context
- open linked theory
- manually refresh

## API 与更新策略

Real-readonly:

- `GET /api/agent/signals/{signal_id}/explanation`
- `GET /api/agent/events`

Mock fallback:

- signal list/detail
- scenario plan
- theory matches
- post validation

Update model:

- polling default 1 minute
- manual refresh

## Signal Detail Required Sections

- status
- tags
- confidence
- market intent
- scenario tree
- trigger conditions
- invalidation conditions
- evidence
- matched theories
- matched rules
- tool sources
- next watch
- risk/uncertainty

## 验收标准

- Signal table can filter by status, symbol, tag and confidence.
- Detail drawer shows ScenarioPlan, not trade/order fields.
- Matched theories and rules are visible.
- External sources are marked as unverified.
- User can open Chat with signal context.
- No order, execution, approval or task mutation appears.

## 测试场景

- Component test status/tag combinations.
- Component test scenario plan condition tree.
- Component test matched theory/rule panel.
- Playwright smoke: open signals, filter, inspect detail, open chat.
