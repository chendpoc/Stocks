# 03 Live Dashboard

## 目标与非目标

目标：实现 `/dashboard/live`，作为 Agent Market Cockpit 第一屏。它必须呈现固定股票池、市场意图、机会摘要、图表证据、Agent 状态和最近事件。

非目标：

- 不提供交易执行入口。
- 不创建任务。
- 不编辑规则。
- 不把 Scenario Plan 呈现成订单表单。

## 页面/组件拆分

| Component | Responsibility |
|---|---|
| `MarketIntentBar` | market gate, regime, freshness, fallback state |
| `WatchlistSetupBoard` | fixed watchlist cards and discovered candidates |
| `EvidenceChartPanel` | K line, volume, signal markers and event markers |
| `SignalFocusPanel` | selected signal, status, tags, scenario plan |
| `AgentStateRail` | agent status, last run, tool sources, chat handoff |
| `DashboardTimeline` | recent agent events and tool calls |
| `DashboardInboxPreview` | unread opportunity/risk/learning messages |

## 数据输入输出

Inputs:

- `AgentStatusViewModel`
- `MarketSnapshotViewModel`
- `SignalViewModel[]`
- `AgentEventViewModel[]`
- `ToolSourceViewModel[]`

Outputs:

- select symbol
- select signal
- open signal detail
- open chat with current context
- manually refresh
- change polling interval

## API 与更新策略

Real-readonly:

- `GET /api/agent/status`
- `GET /api/agent/events`
- `GET /api/agent/runs`

Mock fallback:

- market snapshot
- signal list
- watchlist setup board
- discovered candidates

Update model:

- polling default 1 minute
- user can switch to 5/15 minutes or manual refresh
- stale badge shown when polling fails

## 用户交互流程

1. User opens `/dashboard/live`.
2. Dashboard loads real Agent status/events where available.
3. Market snapshot and signal list come from adapter; missing contracts use fallback.
4. User selects a symbol or signal.
5. Chart and focus panel update.
6. User opens Chat with selected context.

## 验收标准

- Fixed watchlist and discovered candidates are visually distinct.
- Market intent is visible in the first viewport.
- Selected signal shows status, tags, trigger conditions and invalidation conditions.
- Chart shows price, volume, signal markers and event markers.
- Agent status and latest events come from real endpoints when available.
- Missing backend contracts show fallback labels.
- No order, execution, approval or task action appears.

## 测试场景

- Component test dashboard fallback state.
- Component test stale polling badge.
- Component test discovered candidate not automatically added to watchlist.
- Playwright smoke: open dashboard, select signal, open chat with context.
