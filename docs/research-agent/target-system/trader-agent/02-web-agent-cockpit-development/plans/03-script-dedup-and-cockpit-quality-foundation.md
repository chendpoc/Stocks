# 03 — Script 函数抽离 + Cockpit 前端质量基础

Status: done
Owner: main-agent
Created: 2026-05-28
Source PRD: [00d-cockpit-frontend-quality-reset.md](../00d-cockpit-frontend-quality-reset.md), 对话诊断

## 1. 目标

分两步走：

A. 消除 `scripts/daily-summary.mjs` 和 `scripts/daily-publish.mjs` 之间的函数重复。
B. 为 Cockpit 前端建立组件优先的开发基础——共享工具函数抽离、查询模板封装、设计 token 约定。

Step B 完成后，后续新页面和重构都应复用本次产出的共享模块，不再手搓裸 Tailwind class 或重复定义工具函数。

## 2. 非目标

- 不连接真实 Agent Core API（那是 Phase 1 的事）。
- 不引入新的 UI 库或图表库。
- 不修改 Python 后端或 daily summary 生成逻辑。
- 不重写 Dashboard v5 的业务逻辑——本次只做结构性整理（拆分大组件、抽共享函数），不改功能行为。
- 不执行 `00d-quality-reset` 的完整流程（需要先过 sketch → review gate，本次只做基础准备）。

## 3. 背景与现状

### Script 重复

`daily-summary.mjs` 和 `daily-publish.mjs` 各自实现了相同的函数：
- `pythonPath()` — 查找 .venv Python 路径
- `run()` — spawnSync 封装
- `parseArtifacts()` — 解析 Python stdout 中的 ARTIFACTS_JSON
- `currentGitBranch()` — 获取当前 git 分支
- `readArgValue()` — 解析命令行参数
- `loadWebhookUrl()` — 从 secrets 文件加载 Webhook URL

这些函数合计约 120 行，散布在两个文件里。`scripts/lib/` 目录已存在但只有 `local-env.mjs`，没有放这些共享逻辑。

### Cockpit 重复与质量问题

- `confidenceClass` 在 2 个文件各自定义
- `riskClass` / `statusClass` / `tagClass` 在 2+ 个文件各自定义
- 每个 Workspace 都重复一套 `useQuery → isLoading → isError → no data → render` 模板
- 页面直接 import HeroUI 并堆砌裸 Tailwind class，没有经过业务层封装
- `LiveDashboard.tsx` 752 行单体组件，包含数据拉取、筛选、表格、分页、抽屉全部逻辑
- Zustand store 里 `selectedSymbol` 初始值硬编码 `"TSLA"`，不是由 adapter 驱动
- `adapter.ts` 直接 re-export mock，没有切换机制

### 文档中已有的规范（本次对齐目标）

- `01-design-style-and-interaction-principles.md`：语义色 token（tag.opportunity / tag.intent / tag.learning 等）
- `00d-quality-reset.md`：10 个 Cockpit 设计系统原语列表、scroll policy、test policy
- `00-tech-stack.md`：数据走 adapter、Zustand 只存 UI 状态、文案进 i18n、import 用 `@/*`
- `00-development-workflow.md`：plan-first、HeroUI-first、不直接 import fixtures

## 4. 方案摘要

### Step A：Script 函数抽离

```
scripts/lib/common.mjs  ← 新建，放共享函数
scripts/daily-summary.mjs  → import from common.mjs，删除本地重复定义
scripts/daily-publish.mjs  → import from common.mjs，删除本地重复定义
```

抽取到 `common.mjs` 的函数：
- `pythonPath(root)` — 需要 root 参数，因为两个文件里 root 的计算路径一致
- `run(root, command, args, options?)` — root 参数化
- `parseArtifacts(stdout)`
- `currentGitBranch(root)`
- `readArgValue(rawArgs, name)`
- `loadWebhookUrl(py)` — 保持原样，daily-publish 可以复用

### Step B：Cockpit 前端质量基础

按优先级排序：

B1. **共享工具函数** — 新建 `lib/cockpit/style-utils.ts`
  - `confidenceClass(confidence: string)`
  - `riskClass(value: string)`
  - `statusClass(status: SignalStatus)` ← 统一签名，签名从 adapter 类型导入
  - `tagClass(tag: CockpitTag)`
  - 各 Workspace 删除本地定义，改为 import

B2. **查询状态包装** — 新建 `components/cockpit/states/QueryGate.tsx`
  - 封装 `isLoading → StateBlock / isError → StateBlock / !data → StateBlock / data → children`
  - 各 Workspace 的查询模板替换为 `<QueryGate>`

B3. **LiveDashboard 拆分** — 不改变功能，只拆文件结构
  ```
  LiveDashboard.tsx (数据层 + 布局编排)
    ├── DashboardHeader.tsx (标题 + 搜索 + 刷新按钮)
    ├── DashboardStatusCards.tsx (市场 Gate / 信号数 / 失效数 / 新鲜度)
    ├── DashboardMarketIntentStrip.tsx (市场意图条)
    └── DashboardTodayFocus.tsx (焦点队列表格 + 筛选 + 分页 + Drawer)
  ```
  每个子组件通过 props 接收数据，不直接读 Zustand store（store 选择器保留在 LiveDashboard 层）。

B4. **解耦 Zustand 默认值** — `selectedSymbol` 不再硬编码 `"TSLA"`
  - 改为 `null`，由 adapter 首次返回数据时驱动
  - CockpitShell 中 SPY 显示改为动态读取

B5. **Adapter 切换预留** — 在 `adapter.ts` 中加入环境变量开关
  ```ts
  const useMock = !process.env.NEXT_PUBLIC_COCKPIT_REAL_ADAPTER;
  export const cockpitAdapter = useMock ? mockCockpitAdapter : mockCockpitAdapter; // 暂时 fallback 到 mock
  ```
  等 `real-readonly-adapter.ts` 实现后，只需改一行。

## 5. 允许修改的文件

### Step A
- `scripts/lib/common.mjs` — 新建
- `scripts/daily-summary.mjs`
- `scripts/daily-publish.mjs`

### Step B
- `apps/trader-cockpit/lib/cockpit/style-utils.ts` — 新建
- `apps/trader-cockpit/components/cockpit/states/QueryGate.tsx` — 新建
- `apps/trader-cockpit/components/cockpit/dashboard/LiveDashboard.tsx`
- `apps/trader-cockpit/components/cockpit/dashboard/DashboardHeader.tsx` — 新建
- `apps/trader-cockpit/components/cockpit/dashboard/DashboardStatusCards.tsx` — 新建
- `apps/trader-cockpit/components/cockpit/dashboard/DashboardMarketIntentStrip.tsx` — 新建
- `apps/trader-cockpit/components/cockpit/dashboard/DashboardTodayFocus.tsx` — 新建
- `apps/trader-cockpit/components/cockpit/signals/SignalsWorkspace.tsx`
- `apps/trader-cockpit/components/cockpit/playbook-theories/PlaybookTheoriesWorkspace.tsx`
- `apps/trader-cockpit/components/cockpit/learning/LearningWorkspace.tsx`
- `apps/trader-cockpit/lib/cockpit/adapter.ts`
- `apps/trader-cockpit/lib/cockpit/use-cockpit-ui-store.ts`
- `apps/trader-cockpit/components/cockpit/shell/CockpitShell.tsx`（SPY 硬编码修复）

## 6. 禁止修改的范围

- `apps/trader-agent/` 及 Python 后端所有文件
- `apps/research-console/`
- `docs/` 下除本 plan 和 `00-implementation-status.md` 外的所有文件
- `packages/summary-core/`
- `pnpm-lock.yaml` / `package.json`
- daily summary 生成逻辑（`daily_summary_structured.py` 等）
- WeCom / Cloudflare / VitePress 部署相关文件
- `lib/i18n/resources.json`（不需要新增文案）
- `lib/cockpit/fixtures.json`（不修改 mock 数据）
- `lib/cockpit/fixtures.ts`

## 7. 任务清单

### Step A
- [x] A1. 新建 `scripts/lib/common.mjs`，抽取 6 个共享函数
- [x] A2. 更新 `daily-summary.mjs`，删除本地定义，改为 import
- [x] A3. 更新 `daily-publish.mjs`，删除本地定义，改为 import
- [x] A4. 运行 `npm run daily:sync:dry` 验证

### Step B
- [x] B1. 新建 `lib/cockpit/style-utils.ts`，抽取 4 个共享工具函数
- [x] B2. 更新 4 个 Workspace 文件，删除本地定义，改为 import
- [x] B3. 新建 `components/cockpit/states/QueryGate.tsx`
- [x] B4. 拆分 `LiveDashboard.tsx` 为 5 个文件
- [x] B5. 解耦 Zustand `selectedSymbol` 硬编码
- [x] B6. Adapter 加入环境变量开关
- [x] B7. 运行 lint + build + test 验证

## 8. 验收标准

### Step A
- `scripts/lib/common.mjs` 包含全部 6 个共享函数
- `daily-summary.mjs` 和 `daily-publish.mjs` 均从 `common.mjs` import，无本地重复定义
- `npm run daily:sync:dry` 通过

### Step B
- `lib/cockpit/style-utils.ts` 存在，4 个函数有统一类型签名
- 所有 Workspace 不再定义本地 `confidenceClass` / `riskClass` / `statusClass` / `tagClass`
- `QueryGate` 组件可用，至少被 1 个 Workspace 使用（示范）
- `LiveDashboard.tsx` < 200 行，拆出的 4 个子组件各司其职
- `use-cockpit-ui-store.ts` 中 `selectedSymbol` 初始值为 `null`
- `adapter.ts` 中有 `NEXT_PUBLIC_COCKPIT_REAL_ADAPTER` 开关（默认 mock）
- `pnpm --filter trader-cockpit lint` 通过
- `pnpm --filter trader-cockpit build` 通过
- `node --test test/trader-cockpit-phase0.test.mjs` 通过（或失败的 3 个不变差）

## 9. 验收命令

```powershell
# Step A
npm run daily:sync:dry

# Step B
pnpm --filter trader-cockpit lint
pnpm --filter trader-cockpit build
node --test test/trader-cockpit-phase0.test.mjs
```

## 10. 完成后文档更新

- [x] 更新 `00-implementation-status.md` 记录 Step A/B 完成状态
- [x] 本 plan `Status: done`
- [x] 如 dashboard 拆分涉及新 adapter 调用模式，同步更新 `02-shared-cockpit-contracts.md`
