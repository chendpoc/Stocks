# 00 Implementation Status

版本：`v0.2`
最后同步：`2026-05-28`
代码基准：`apps/trader-cockpit` + `test/trader-cockpit-phase0.test.mjs`

本文档记录 Web Agent Cockpit 当前实现进展，与 PRD / 模块文档的差异，以及下一批待办。每次完成开发任务后必须更新本文档。

---

## 1. 总体结论

| 维度 | 状态 |
|---|---|
| 应用包 | `apps/trader-cockpit` 已存在并可本地 dev/build |
| 数据策略 | **mock-first**：`mockCockpitAdapter` 为唯一导出 adapter |
| UI 体系 | HeroUI v3 + Tailwind v4 semantic tokens（非 shadcn） |
| 国际化 | `react-i18next`，`zh-CN` / `en-US` |
| 第一版 7 路由 | 均已挂载 workspace |
| Phase 0D-1 Agent Console | **已完成** |
| Phase 0D-2 Read-only DAG | **done** |
| Real-readonly Agent Core 接入 | **未开始** |
| `POST /api/agent-chat` DeepSeek route | **未开始** |
| Playwright route smoke | **未开始**（当前仅有 Node static tests） |

---

## 2. 路由与页面实现

实际路由前缀为 `/cockpit/*`（非 PRD 中的裸 `/dashboard/live`）。

| Route | Workspace | 状态 | 说明 |
|---|---|---|---|
| `/cockpit/dashboard/live` | `LiveDashboard` | done | v5：L1 市场意图条 + L2 Today Focus Queue + L3 图表/Drawer |
| `/cockpit/signals` | `SignalsWorkspace` | done | 列表/详情、status/tag 语义色、`signalId` deep-link |
| `/cockpit/chat` | `AgentConsoleWorkspace` | done | Phase 0D-1 广度骨架 |
| `/cockpit/inbox` | `AgentInbox` | done | `eventId` deep-link |
| `/cockpit/playbook-theories` | `PlaybookTheoriesWorkspace` | done | `theoryId` deep-link |
| `/cockpit/learning` | `LearningWorkspace` | done | `reviewId` deep-link；无新内容时不制造日报 |
| `/cockpit/settings` | `SettingsWorkspace` | done | 本地偏好 + 只读 Tool Settings + 语言切换 |

已移除/不存在：`/approvals`、`/tasks`、`/rules`、`/capabilities`、`/playbooks`、`/journal`、`/audit`。

---

## 3. Shell 与横切能力

| 能力 | 状态 | 实现位置 |
|---|---|---|
| 左侧导航 + 折叠 | done | `CockpitShell.tsx` |
| 视口锁定 `h-dvh`，workspace 内滚动 | done | `CockpitShell.tsx` |
| Market context switcher（只读 UI） | done | `CockpitShell.tsx` + Zustand |
| Runtime status pills（mock local / observing / blocked） | done | `CockpitShell.tsx` |
| 浮动 Chat Dock | done | `AgentChatDock.tsx`（expand/minimize + mock stream） |
| Loading / empty / error 状态块 | done | `StateBlock.tsx` |
| Mock 图表 | done | `MockMarketChart.tsx` |
| Agent 事件时间线（嵌入） | done | `AgentActionTimeline.tsx` |
| HeroUI Table / Drawer / Chip | done | 各 workspace |

---

## 4. Adapter 与数据契约（当前代码）

导出：`adapter.ts` → `mockCockpitAdapter as cockpitAdapter`

| 方法 | 数据源 | 状态 |
|---|---|---|
| `listSignals` | mock fixtures | done |
| `getSignal` | mock fixtures | done |
| `getMarketIntentExplanation` | mock fixtures | done |
| `listTodayFocus` | mock fixtures | done（Dashboard v5 扩展，非原始 PRD 最小集） |
| `listInboxMessages` | mock fixtures | done |
| `listAgentEvents` | mock fixtures | done |
| `listPlaybookTheories` | mock fixtures | done |
| `listLearningItems` | mock fixtures | done |
| `getToolSettings` | mock fixtures | done |
| `streamChat` | mock stream parts | done |
| `getAgentConsole` | mock fixtures | done |

**尚未实现（文档曾规划）：**

- `real-readonly-adapter.ts`
- `getAgentStatus` / `listAgentRuns` / `getSignalExplanation` / `searchKnowledge` 等 Agent Core 只读方法
- `polling.ts` 独立 helper（当前由各 workspace 自行 useQuery）
- `schemas.ts` / `tags.ts` 独立模块

Fixture 数据位于 `lib/cockpit/fixtures.json`，经 `fixtures.ts` 桥接；页面/组件 **不得** 直接 import fixtures。

---

## 5. Agent Console（Phase 0D-1）

| 项 | 状态 |
|---|---|
| `AgentConsoleWorkspace` 主布局 | done |
| `PriorityPushStrip` | done |
| `WorkstreamRail` | done |
| `AgentConversationPanel` | done |
| `ActivityTracePreview`（compact list，非 React Flow） | superseded by `AgentActivityGraphPanel` |
| `AgentActivityGraphPanel`（只读 DAG，`@xyflow/react`） | done |
| `NodeInspectorPanel` | done |
| `ContextUsedPanel` | done |
| `getAgentConsole` mock adapter | done |
| `mockAgentConsole` fixtures（≥3 workstreams、agent_push、6+ nodes、edges） | done |
| Zustand：workstream / node / message 选择 | done |
| `@xyflow/react` | **已引入**（仅 `activity-graph/`） |

布局（当前代码）：Priority Push → Workstreams → 三列（Conversation | Activity Trace | Inspector+Context）。

---

## 6. Dashboard v5（超出原始 03 文档）

当前 Dashboard 已从早期「watchlist + opportunity + next-watch 分区」演进为：

```text
L1  Market Intent Strip（gate / summary / whyNow / whyWait）
L2  Today Focus Queue（table-first，search / filter / pagination / queue lens）
L3  MockMarketChart + 右侧 Drawer 详情（Agent explanation sections）
```

新增 adapter 契约：

- `TodayFocusItem` / `TodayFocusListInput` / `listTodayFocus`
- `MarketIntentExplanation` / `getMarketIntentExplanation`

---

## 7. 质量基础（2026-05-28 完成）

Plan: [03-script-dedup-and-cockpit-quality-foundation.md](./plans/03-script-dedup-and-cockpit-quality-foundation.md)

| 项 | 说明 |
|---|---|
| Script 函数抽离 | `scripts/lib/common.mjs` 新文件，`daily-summary.mjs` / `daily-publish.mjs` 不再有本地重复定义 |
| 共享样式工具 | `lib/cockpit/style-utils.ts`（confidenceClass, riskClass, gateClass, signalStatusClass, focusStatusClass, tagClass, priorityClass, priorityLabel） |
| 查询状态包装 | `components/cockpit/states/QueryGate.tsx`（封装 loading/error/empty 模板） |
| LiveDashboard 拆分 | 752 行拆为 5 文件：`LiveDashboard`（~210行）、`DashboardHeader`、`DashboardStatusCards`、`DashboardMarketIntentStrip`、`DashboardTodayFocus` |
| Zustand 解耦 | `selectedSymbol` 初始值 `"TSLA"` → `""` |
| Adapter 开关 | `adapter.ts` 加入 `NEXT_PUBLIC_COCKPIT_REAL_ADAPTER` 环境变量预留 |
| 文档规则 | 先按 `../00-workflow-router.md` 选择主 workflow；非平凡 plan / worker prompt 先过 `module-spec-quality-gate`；`00-development-workflow.md` 只保留 Cockpit plan contract、代码约定和状态回写规则 |

---

## 8. 测试与质量门

当前质量门：`node --test test/trader-cockpit-phase0.test.mjs`

| 类别 | 覆盖 | 备注 |
|---|---|---|
| HeroUI + Tailwind v4 配置 | yes | |
| i18n zh-CN / en-US | yes | |
| 第一版路由存在性 | yes | |
| banned product language | yes | |
| fixture 不可被页面直接 import | yes | |
| Agent Console 0D-1 契约 | yes | |
| Dashboard v5 / Today Focus | yes | |
| deep-link search params | yes | |
| Playwright smoke | no | PRD 验收项，待补 |
| build / lint | manual | `pnpm --filter trader-cockpit build` |

**已知测试漂移（2026-05-27）：** 32 项测试中 3 项失败，原因为 UI 布局 class 与 selection 逻辑 refactor 后测试断言未同步：

1. `shell pins viewport` — `<main>` className 已变
2. `signals signalId deep-link` — signal 选择 state 变量名已变
3. `chat route Agent Console layout` — grid rows 布局已变

修复计划见 [plans/00-fix-phase0-test-drift.md](./plans/00-fix-phase0-test-drift.md)。

---

## 9. 文档与代码差异（已识别）

| 文档描述 | 当前代码 |
|---|---|
| shadcn/ui | HeroUI v3 |
| 路由 `/dashboard/live` | `/cockpit/dashboard/live` |
| `real-readonly-adapter.ts` | 不存在，仅 mock |
| `app/api/agent-chat/route.ts` | 不存在 |
| TradingView Lightweight Charts | `MockMarketChart` |
| TanStack Table | HeroUI Table |
| React Hook Form + Zod forms | Settings 为轻量本地 state |
| Dashboard 旧组件拆分（WatchlistSetupBoard 等） | 已替换为 v5 Today Focus Queue |

---

## 10. 阶段完成度

| Phase | 范围 | 状态 |
|---|---|---|
| 0A | mock adapter + 7 routes + shell + i18n | **done** |
| 0B | signals / inbox / theories / learning deep-link | **done** |
| 0C | Dashboard v5 + Today Focus Queue | **done** |
| 0D-1 | Agent Console breadth skeleton | **done** |
| 0D-2 | Read-only `AgentActivityGraph`（@xyflow/react） | **pending** |
| 1 | Real-readonly adapter + contract gap APIs | **pending** |
| 1 | `POST /api/agent-chat` DeepSeek route | **pending** |
| 2 |  richer evidence / post-validation / TV charts | **pending** |

---

## 11. 下一批推荐任务（按优先级）

1. 同步 Phase 0 测试断言（见 plans/00-fix-phase0-test-drift.md）
2. Phase 0D-2：只读 Agent Activity DAG（见 [16-agent-console-dlite-v3.md](./16-agent-console-dlite-v3.md)）
3. Phase 1：`real-readonly-adapter.ts` + 已有 Agent Core 只读 endpoint（见 [01-agent-core-to-cockpit-contract-gap-review.md](./01-agent-core-to-cockpit-contract-gap-review.md)）
4. Phase 1：`app/api/agent-chat/route.ts` DeepSeek 只读解释层
5. Playwright 第一版 route smoke

**规则：以上每一项必须先按 [../00-workflow-router.md](../00-workflow-router.md) 选择主 workflow，非平凡实现先过 `module-spec-quality-gate`，再按 [00-development-workflow.md](./00-development-workflow.md) 写/更新 `plans/` 计划文档并进入代码开发。**

---

## 12. 维护说明

完成任意 Cockpit 开发任务后，开发者必须：

1. 更新本文档对应章节状态。
2. 若引入新 adapter 方法、路由或组件，同步更新 [02-shared-cockpit-contracts.md](./02-shared-cockpit-contracts.md) 与相关模块 doc。
3. 将已完成 plan 文档头部 `Status` 改为 `done` 并链接 PR / commit（如有）。
