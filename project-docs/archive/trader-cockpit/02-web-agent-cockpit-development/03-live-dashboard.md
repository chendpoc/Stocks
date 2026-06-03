# 03 Live Dashboard

## 实现状态

**Route：** `/cockpit/dashboard/live`
**Workspace：** `LiveDashboard.tsx`
**Status：** done（Dashboard v5，2026-05-27）

快照详见 [00-implementation-status.md](./00-implementation-status.md) §6。

## 目标与非目标

目标：实现 `/cockpit/dashboard/live`，作为 Agent Market Cockpit 第一屏。呈现市场意图、Today Focus Queue、图表证据与详情 Drawer。

非目标：

- 不提供交易执行入口。
- 不创建任务。
- 不编辑规则。
- 不把 Scenario Plan 呈现成订单表单。

## 当前页面结构（v5）

Dashboard 已从早期文档中的「WatchlistSetupBoard + SignalFocusPanel 分区」演进为三层结构：

```text
L1  Market Intent Strip
    gate badge · summary · whyNow / whyWait · evidence count · refresh

L2  Today Focus Queue（table-first）
    search · type/status filter · queue lens · pagination
    row → 跳转 signals/inbox/theories/learning（target.route）

L3  Evidence + Detail
    MockMarketChart（左）
    Drawer slide-over（右）：选中 focus item 的 Agent explanation sections
```

| Component | Responsibility | 文件 |
|---|---|---|
| Market Intent Strip | gate, summary, whyNow/whyWait, refresh | `LiveDashboard.tsx` |
| Today Focus Queue | 统一关注队列 table、filter、pagination | `LiveDashboard.tsx` |
| MockMarketChart | mock OHLC + markers | `MockMarketChart.tsx` |
| Focus Detail Drawer | HeroUI Drawer，Agent 解释区块 | `LiveDashboard.tsx` |
| CockpitSelect | 筛选控件 | `CockpitSelect.tsx` |

**已移除（v5 不再渲染）：** 独立 watchlist board、standalone opportunity panel、standalone next-watch 区域（由 phase0 tests 校验）。

## 数据输入输出

Adapter 方法：

- `getMarketIntentExplanation()` → `MarketIntentExplanationViewModel`
- `listTodayFocus(input?)` → `TodayFocusListViewModel`
- `listSignals()` — chart / 上下文（间接）

`TodayFocusItem` 类型：`opportunity | watchlist | news_event | rule_match | next_watch | outcome_review`

Outputs：

- 搜索 / 筛选 / 翻页 focus queue
- 打开 Drawer 查看详情
- 从 row target 深链到其他 route
- 手动 refresh（useQuery refetch）

## API 与更新策略

当前：**全部 mock**（`mockCockpitAdapter`）。

Phase 1 real-readonly 目标：

- `GET /api/agent/status`
- `GET /api/agent/events`
- market snapshot / signal list — gap，继续 mock fallback

Update model：

- TanStack Query，key：`cockpitKeys.marketIntentExplanation()`、`cockpitKeys.todayFocus(filters)`
- 独立 `polling.ts` helper — pending

## 验收标准（当前）

- [x] 固定股票池语境下的 market intent strip
- [x] Today Focus Queue 可搜索、筛选、分页
- [x] Mock 图表与 Drawer 详情
- [x] 无交易/订单/审批入口
- [ ] 真实 Agent Core market snapshot（Phase 1）

## 后续计划

变更 Dashboard 行为前，先写 `plans/` 文档，见 [00-development-workflow.md](./00-development-workflow.md)。
