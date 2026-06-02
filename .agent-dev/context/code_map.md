# Code Map — stock-community-summary

> 给 AI agent 的快速定位指南。先用本文理解结构，再用 CodeGraph 做精确查询。
> 配套：根目录 `CLAUDE.md`（开发规约与坑）· `.agent-dev/README.md`（spec/task artifact 说明）。
> 更新：2026-06-02

---

## 项目总览

```
stock-community-summary/
├── apps/
│   ├── trader-agent/backend/   ← Python 后端（FastAPI + SQLAlchemy + SQLite FTS5；含 intel 子系统）
│   ├── trader-cli/             ← TypeScript CLI + Ink v7 TUI（intel 子命令 + Stage1 薄包装；独立 npm）
│   ├── trader-workflows/       ← Stage 1 LangGraph 运行时 + 四图 CLI（独立 npm；不 import 进 trader-cli）
│   ├── trader-chart/           ← Rust ratatui 全屏 K 线（cargo workspace member；Ink Dashboard [c] handoff）
│   ├── trader-cockpit/         ← 交易驾驶舱前端（Next.js 15 + HeroUI）— intel 期 FORBIDDEN
│   └── research-console/       ← 旧研究控制台（只读参考，不扩展）
├── docs/                       ← VitePress 站点 + 设计文档 + 总结归档
├── data/                       ← 运行时数据（DB / raw / structured；gitignored）
├── scripts/                    ← Node 脚本（采集/发布/通知/audit）
├── packages/summary-core/      ← 共享 TypeScript 包
├── utils/                      ← Python 工具库（采集/解析/搜索/通知）
├── .agent-dev/                 ← Agent 开发 artifact（spec/task/decision/worker prompts）
├── Cargo.toml                  ← Rust workspace（仅 apps/trader-chart）
└── test/                       ← 根级测试
```

---

## 后端：apps/trader-agent/backend/

```
app/
├── main.py                     ← FastAPI 入口（:8000 — agent + knowledge + /api/intel）
├── api/agent.py                ← /api/knowledge/*, /api/agent/* (旧路由，不动)
├── core/
│   ├── config.py               ← Settings (frozen dataclass, 读 config.json)
│   ├── events.py               ← record_agent_event()
│   └── time.py                 ← utc_now_iso()
├── db/
│   ├── models.py               ← 所有 SQLAlchemy Table 定义（20+ 表）
│   ├── session.py              ← create_sqlite_engine()
│   └── migrations.py           ← bootstrap_database()
├── modules/                    ← 旧 Shared Agent Memory（FORBIDDEN — 禁止修改）
│   ├── _json.py                ← dumps()/loads()（可只读引用）
│   ├── corpus_search.py        ← search_corpus()（可只读引用；intel/api/corpus.py 已包一层）
│   ├── evidence_ref.py         ← EvidenceRef（可只读引用）
│   ├── context_selector.py     ← DEPRECATED — 替换为 intel/context/selector.py
│   ├── memory_service.py       ← DEPRECATED — 替换为 lessons 表 + create_lesson()
│   └── ...                     ← 其他模块标记 DEPRECATED
├── intel/                      ← Forward Market Intelligence 子系统
│   ├── db/
│   │   ├── connection.py       ← get_intel_engine() → data/market_intel.db
│   │   └── schema.py           ← 11 张表 + seed + _migrate_*_columns()
│   ├── context/selector.py     ← select_lessons() / select_related_hypotheses（10条/6000字预算）
│   ├── ingestion/
│   │   ├── market_data.py      ← yfinance 数据拉取 + ingested_at TTL（D109）
│   │   ├── bars.py             ← market_bars 写入辅助
│   │   ├── alpha_vantage_data.py
│   │   ├── events_ingest.py    ← 事件录入（手工 + ARK trades）
│   │   ├── news_crawler.py     ← RSS/API/Web 三源 → events.source_type='news'（D103）
│   │   └── seed_lessons.py     ← LLM 扫描 summaries 提取 seed lessons
│   ├── features/
│   │   ├── scanner.py          ← 10 features + signal registry
│   │   ├── pattern_matcher.py  ← 5 条 MVP_PATTERNS + trigger_sql（D110）
│   │   └── cross_asset.py      ← 跨资产共现指标（独立计算，不进 SCANNERS — D111）
│   ├── trade/ideas.py          ← hypothesis → trade_idea（同 symbol 合并）
│   ├── postmortem/
│   │   ├── evaluator.py        ← prediction → outcome（reference_price）
│   │   └── lessons.py          ← 复盘 → lesson（只写新 DB）
│   ├── jobs/
│   │   ├── premarket.py        ← 盘前数据包
│   │   └── close.py            ← 收盘数据包 + 触发 evaluator
│   └── api/                    ← 11 路由（前缀 /api/intel）
│       ├── context.py          ← POST /context/build（含 related_hypotheses — D102）
│       ├── market.py           ← /market/*（含 GET /market/status — D204）
│       ├── signals.py          ← /signals/*
│       ├── hypotheses.py       ← /hypotheses/*（CRUD）
│       ├── trade_ideas.py      ← /trade-ideas/*
│       ├── lessons.py          ← /lessons/*
│       ├── events.py           ← /events/*
│       ├── jobs.py             ← /jobs/*（premarket / close）
│       ├── corpus.py           ← /corpus/*（包一层 M2 corpus_search）
│       ├── report_cache.py     ← /report/*（D105/D113 唯一键 + 实时 join 失效）
│       ├── news.py             ← /news/*
│       └── stage1.py           ← **Stage 1 域 API**（前缀 `/api/intel/stage1` — T006）
└── tools/                      ← 外部数据源适配器（yfinance/alpha_vantage/longbridge/SEC）
```

**Stage 1 API**（`intel/api/stage1.py`，挂载 `/api/intel/stage1`）：`context-snapshots`、`model-decisions`、`human-overrides`、`decision-outcomes`（schedule/due/label）、`insight-candidates`、`evaluation-reports`、`weighting-policy-stats`。后端零 LLM；持久化在 `market_intel.db` Stage1 表。

### 数据库

| 数据库 | 路径 | 用途 |
|---|---|---|
| `trader-agent.db` | `data/trader-agent/trader-agent.db` | 旧系统（FORBIDDEN — 不动 schema） |
| `market_intel.db` | `data/market_intel.db` | 新 intel 系统（11 张表，单文件 schema 管理） |

### 关键路径约定

| 项目 | 路径 |
|---|---|
| Python 解释器 | `.venv/Scripts/python.exe` |
| 测试命令 | `.venv/Scripts/python.exe -m pytest <test_file> -v --tb=short` |
| Lint | `.venv/Scripts/python.exe -m ruff check <file>` |
| 后端启动 | `npm run trader-agent:backend:dev` → `scripts/dev_server.py`（factory + 启动前校验 intel） |
| 后端验证 | `npm run trader-agent:backend:verify`（health 含 intel_route_count + ingest 200） |
| 后端关闭 | `npm run trader-agent:backend:stop`（含 `:force` 用 `--nuke`） |

---

## 前端：apps/trader-cockpit/

```
app/cockpit/dashboard/live/  ← 根路由重定向目标
components/cockpit/           ← 业务组件
lib/cockpit/
  ├── adapter.ts              ← 核心类型（SignalSummary/PlaybookTheory/InboxMessage...）
  ├── mock-adapter.ts         ← Mock 数据
  └── real-readonly-adapter.ts← 真实只读适配器
```

技术栈：Next.js 15 + React 19 + HeroUI + TailwindCSS 4 + Zustand + TanStack Query

**FORBIDDEN** — intel / trader-cli 开发期间不碰。

---

## CLI + Ink TUI：apps/trader-cli/

> TypeScript + tsx（无 build，无 `.mjs` 包装）。**独立 npm 包，非 pnpm workspace 成员。**

```
src/
├── index.ts                  ← Commander.js 入口（默认子命令 = tui）
├── bootstrap-env.ts          ← 仓库根 .env 加载（与后端共用）
├── loadEnv.ts                ← 兼容旧路径
├── print-root-hint.ts        ← repo-root 校验提示
├── symbols.ts                ← 标的归一化辅助
├── asciichart.d.ts           ← 手写 asciichart 类型 shim（非 @types）
│
├── api/client.ts             ← fetch → localhost:8000/api/intel
│
├── commands/                 ← intel 子命令 + Stage1 薄包装（spawn `npm run trader-workflows`）
│   ├── decide.ts             ← DecisionGraph（spawn workflows，无 src import）
│   ├── runs.ts               ← runs list | show | resume
│   ├── outcomes.ts           ← outcomes run --due
│   ├── eval.ts               ← eval summary
│   ├── insights.ts           ← insights explore
│   ├── scan.ts               ← /signals/scan
│   ├── analyze.ts            ← 单次 LLM 深度分析
│   ├── brief.ts              ← /jobs/premarket 数据包
│   ├── review.ts             ← /jobs/close 数据包
│   ├── chart.ts              ← ASCII 或 ratatui handoff
│   ├── chat.ts               ← --eval 旧 readline；TTY 进 ink ChatPage（D108/D112）
│   ├── config.ts             ← show / set env
│   ├── data.ts               ← status / ingest
│   ├── hypotheses.ts         ← list（CLI 路径）
│   ├── lessons.ts            ← list
│   ├── report.ts             ← 同日缓存命中提示「[缓存命中]」
│   ├── server.ts             ← start / stop / status（Win + macOS — D106）
│   └── signals.ts            ← list
│
├── services/                 ← CLI 与 TUI 同源（D201）
│   ├── chart.ts              ← ASCII 图绘制
│   ├── chartIntervals.ts     ← 周期归一化
│   ├── envFile.ts            ← 仓库根 .env 读写
│   ├── repoRoot.ts           ← 仓库根定位
│   ├── market.ts             ← /market/* 包装
│   ├── marketDataProvider.ts ← provider 切换（yfinance/longbridge — Phase2）
│   ├── news.ts               ← /news/* 包装
│   ├── report.ts             ← /report/* + 缓存命中标记（V104）
│   ├── scan.ts               ← /signals/scan 包装
│   ├── server.ts             ← 后端生命周期管理
│   ├── traderChart.ts        ← ratatui handoff（spawnSync inherit — D201/T004）
│   ├── longbridge.ts         ← Dashboard [l]/[L] 外挂（不进 Agent 工具链）
│   ├── longbridgeCli.ts      ← runLongbridgeJson + 网关白名单 + 截断/超时（T005）
│   └── longbridgeAgent.ts    ← env probe + 30s cache + bootstrapWarning（D310）
│
├── llm/                      ← Vercel AI SDK
│   ├── provider.ts           ← DeepSeek / OpenRouter / Anthropic
│   ├── tools.ts              ← INTEL_TOOLS（intel API + DB）+ LONGBRIDGE_AGENT_PROMPT_PATCH
│   ├── longbridgeTools.ts    ← Tier1 22 个具名工具 + longbridgeInvoke（44 项白名单 — T005）
│   ├── buildAgentTools.ts    ← resolveAgentTools / getAgentSystemPrompt（lazy probe 入口）
│   └── auditor.ts            ← 10 条禁止规则审计
│
└── tui/                      ← Ink v7
    ├── app.tsx               ← 七页路由壳
    ├── launch.ts             ← TUI 启动
    ├── menu.ts               ← 1-7 顶部菜单
    ├── chartSession.ts       ← ratatui handoff 会话
    ├── chatSuggestions.ts
    ├── symbolSearch.ts
    ├── types.ts
    ├── pages/
    │   ├── DashboardPage.tsx     ← [s]scan / [g]report / [c]chart / [l/L]longbridge（D202/D203）
    │   ├── ChatPage.tsx          ← buildAgentTools() 入口（首次 lazy probe）
    │   ├── SignalsPage.tsx
    │   ├── HypothesesPage.tsx
    │   ├── LessonsPage.tsx
    │   ├── OpsPage.tsx           ← server / data status；[I]ingest [N]news
    │   └── SettingsPage.tsx      ← 区块1 MARKET_DATA_PROVIDER / 区块2 TRADER_LONGBRIDGE_AGENT
    ├── components/
    │   ├── Sidebar.tsx / ContentArea.tsx / StatusBar.tsx / HotkeyBar.tsx / ContextHint.tsx
    │   ├── PagePanel.tsx / AsyncLoading.tsx / SpinnerLine.tsx
    │   ├── ScanSummary.tsx / SymbolPicker.tsx
    │   ├── SignalDetail.tsx / HypothesisDetail.tsx / LessonDetail.tsx
    │   └── focus.tsx
    └── hooks/
        ├── useFetchIntel.ts      ← intel API 抓取
        ├── useCachedFetch.ts     ← 本地缓存
        └── useListDetailNav.ts   ← 列表/详情导航
```

技术栈：TypeScript 5 + tsx + Ink 7 + Commander 12 + Vercel AI SDK + asciichart + zod。

测试：`npm test` → vitest 跑 `auditor / marketDataProvider / longbridge / longbridgeAgent / longbridgeCli / traderChart / longbridgeTools`（T005 S5 待新增）。

**边界**：Ink TUI 与 intel 子命令走 `services/` + `api/client.ts`；Stage1（`decide` / `runs` / `outcomes` / `eval` / `insights`）仅 `spawnSync` 仓库根 `npm --prefix apps/trader-workflows run workflows`，**禁止** `import` `apps/trader-workflows/src/**`。

---

## Stage 1 工作流：apps/trader-workflows/

> TypeScript + tsx + `@langchain/langgraph` + `better-sqlite3`（checkpoint 临时库）。**独立 npm 包**（T006 / `self-evolving-agent-stage1`）。

```
apps/trader-workflows/
├── package.json              ← scripts: workflows | test (tsx --test)
└── src/
    ├── index.ts              ← Commander 式 argv 路由；统一 WorkflowEnvelope JSON
    ├── api/
    │   └── client.ts         ← fetch → /api/intel/stage1/* + /api/intel/context/build
    ├── runtime/
    │   ├── stage1Runtime.ts  ← 运行编排；list/show/resume；调各 graph
    │   └── checkpointStore.ts← LangGraph checkpoint SQLite（与 market_intel 分离）
    ├── graphs/
    │   ├── decisionGraph.ts       ← Raw evidence → snapshot → model_decision
    │   ├── outcomeGraph.ts        ← due outcomes 批量 label（model_path only）
    │   ├── evaluationGraph.ts     ← hold | needs_more_data（无 auto-promotion）
    │   └── insightExplorationGraph.ts ← 受控 ReAct → InsightCandidate pending
    ├── services/
    │   ├── contextSnapshots.ts    ← weighted items + hash + POST snapshot
    │   ├── decisions.ts           ← envelope 校验 + POST model-decisions
    │   ├── outcomes.ts            ← schedule/label + 行情 proxy
    │   ├── evaluation.ts          ← 聚合 metrics + evaluation report
    │   └── insightCandidates.ts   ← weight cap + controlled ReAct tools
    └── llm/
        ├── provider.ts            ← Stage1 LLM 调用（decide / insight 路径）
        └── decisionEnvelope.ts    ← zod 校验 + paper 标记 not submitted
```

| 层 | 职责 |
|---|---|
| **trader-agent/backend** | Stage1 域表 CRUD、不可变 snapshot、409 冲突；**无** graph 编排 |
| **trader-workflows** | LangGraph 运行时、checkpoint、四图业务编排、JSON envelope |
| **trader-cli** | 人类/脚本入口；Stage1 子命令薄包装到 `trader-workflows` |

仓库根脚本：`npm run trader-workflows -- <cmd> --json`（等同 `npm --prefix apps/trader-workflows run workflows --`）。

测试：`cd apps/trader-workflows && npm test`（47 项 graph/service/runtime 单测）。

**Non-goals（Stage1）**：无自研 TUI 页、无 paper 成交、无 broker mirror、无 auto-training / auto-promotion、无旧 hypotheses/predictions 双写。

---

## Rust 全屏 K 线：apps/trader-chart/

> cargo workspace member。由 Ink Dashboard `[c]` 或 `trader chart SYMBOL` 通过 `spawnSync(inherit)` handoff 启动（D201）。

```
apps/trader-chart/
├── Cargo.toml                ← anyhow + clap + crossterm + ratatui 0.29 + reqwest(rustls) + tokio
├── README.md                 ← 构建 / 环境变量 / 快捷键 / 测试
├── src/
│   ├── main.rs               ← clap 入口
│   ├── lib.rs                ← pub mod 暴露
│   ├── app.rs                ← 主循环 + 状态机
│   ├── api.rs                ← reqwest → GET /market/bars?chart=（D203，不改 API）
│   ├── model.rs              ← Bar / Series 类型
│   ├── viewport.rs           ← 缩放 / 十字线 / 滚动
│   ├── intervals.rs          ← 8 周期归一化
│   ├── symbols.rs            ← 标的切换
│   ├── handoff.rs            ← Ink ↔ Rust 状态交换（chart-handoff.json）
│   └── ui/
│       ├── mod.rs
│       └── draw.rs           ← ratatui 渲染（蜡烛 + 量 + crosshair）
└── tests/fixtures/bars.json
```

环境变量：

| 变量 | 默认 |
|------|------|
| `TRADER_API_BASE` | `http://127.0.0.1:8000/api/intel` |
| `TRADER_CHART_BIN` | trader-cli 自动解析 release/debug 路径 |
| `TRADER_CHART_HANDOFF` | `.cache/trader-cli/chart-handoff.json` |

构建 / 测试：

```bash
npm run trader-chart:build       # cargo build -p trader-chart --release
cargo test -p trader-chart
```

---

## 文档：docs/

```
docs/
├── workflow.md                                # Agent Dev Workflow v2（最终确认版）
├── 01-forward-market-intelligence-system-design.md
├── 02-mvp-module-development-plan.md
├── 03-forward-market-intel-mvp-plan.md
├── trader_agent_system_design_v0_3.md         # 系统总体设计 v0.3
├── summaries/                                 # 赵哥群聊总结（2025-11 → 2026-05，主语料源）
├── assets/chat-images/                        # 群聊图片资产（日期归档）
└── research-agent/target-system/trader-agent/
    ├── 00-workflow-router.md                  # 旧 Shared Agent Memory 任务入口
    ├── 00-system-overview.md                  # 三层架构总览
    ├── 01-agent-core-backend-prd.md
    ├── 03-shared-agent-memory-prd.md
    └── 03-shared-agent-memory-development/    # 01-07 模块 dev doc + plans/
```

---

## 数据：data/（gitignored）

```
data/
├── raw/YYYY-MM-DD/             ← Whop 原始 JSON 归档
├── structured/YYYY-MM-DD/      ← LLM 结构化总结
├── generated/                  ← 生成文件
├── trader-agent/
│   └── trader-agent.db         ← 旧 DB（不动）
└── market_intel.db             ← 新 intel DB
```

---

## Agent Dev Artifacts：.agent-dev/

```
.agent-dev/
├── README.md                                    ← 目录与流程说明
├── memory/
│   ├── schemas.md                               ← JSON Schema v1.0（6 种 artifact）
│   └── cursor-setup.md                          ← Cursor 配置
├── context/code_map.md                          ← 本文件
│
├── specs/
│   ├── forward-market-intel/                    ← T001 父 spec（spec.json/spec.md/decision-record.json）
│   ├── cli-tui-v2/                              ← T002（含 dev-plan.md）
│   ├── cli-tui-integration/                     ← T003（接入七页 TUI；服务层共享）
│   ├── trader-chart-ratatui/                    ← T004（done）
│   └── trader-longbridge-agent-cli/             ← T005（含 clarification-questions.{md,json}）
│   └── self-evolving-agent-stage1/              ← T006 Stage 1 自进化闭环
│
├── tasks/
│   ├── T001.{md,json}                           ← forward-market-intel
│   ├── T002.{md,json} + T002-slices/            ← cli-tui-v2 分片（P0/P1/P2/P3/P4/P5）
│   ├── T003.json + T003-slices/                 ← cli-tui-integration 分片（I0-I3）
│   ├── T004.json + T004-slices/                 ← trader-chart-ratatui
│   └── T005.{md,json} + T005-slices/            ← trader-longbridge-agent-cli（audit + patch）
│   └── T006.{md,json} + T006-slices/            ← self-evolving-agent-stage1（S1–S8）
│
├── presentations/cli-tui-v2-code-review-presentation.md
├── cli-tui-v2-worker-prompt.md                  ← T002 worker prompt
├── cli-tui-integration-worker-prompt.md         ← T003 worker prompt
├── trader-longbridge-agent-worker-prompt.md     ← T005 worker prompt
└── self-evolving-agent-stage1-worker-prompt.md  ← T006 worker prompt
```

---

## 禁止触碰区域

| 路径 | 原因 |
|---|---|
| `app/modules/**` | 旧模块（除 `_json.py`/`corpus_search.py`/`evidence_ref.py`/`core.*`/`db.*` 可只读引用） |
| `app/core/**` | Settings/events/time 只读引用 |
| `apps/trader-cockpit/**` | 旧驾驶舱前端 |
| `apps/research-console/**` | 旧研究控制台 |
| `data/trader-agent/trader-agent.db` | 旧 DB schema |
| `apps/trader-agent/backend/app/intel/db/schema.py` | cli-tui-integration scope 内禁止；其他 spec 看自身 forbidden |
| `apps/trader-cli/src/services/longbridge.ts` | T005 期间只读（Dashboard [l]/[L] 外挂逻辑保持） |

## 可只读引用的旧模块

```
app/modules/evidence_ref.py    ← EvidenceRef, RefType
app/modules/corpus_search.py   ← search_corpus(settings, query=..., symbol=..., limit=...)
app/modules/_json.py           ← dumps(), loads()
app/core/events.py             ← record_agent_event()
app/core/time.py               ← utc_now_iso()
app/core/config.py             ← Settings
app/db/session.py              ← create_sqlite_engine()
```

## 已移除的旧模块引用

```
app/modules/context_selector.py  ← 替换为 app/intel/context/selector.py
app/modules/memory_service.py    ← 替换为 lessons 表 + create_lesson()
```

---

## 常用命令

```bash
# === 后端 ===
npm run trader-agent:backend:dev          # FastAPI :8000（带启动前校验）
npm run trader-agent:backend:verify       # health + intel ingest 校验
npm run trader-agent:backend:stop         # 关闭（:force 用 --nuke）

# === 测试（仓库根）===
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_intel_phase0_schema.py -v --tb=short
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_intel_news_crawler.py -v --tb=short
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_intel_cache_report.py -v --tb=short

# === CodeGraph ===
codegraph serve --watch                   # MCP server（开发时常开）
codegraph index                           # 重建索引

# === 文档站 ===
npm run docs:dev                          # VitePress

# === CLI / TUI ===
cd apps/trader-cli && npx tsx src/index.ts                       # 七页 Ink TUI（默认）
npm run trader-cli -- analyze TSLA                                # 仓库根快捷
cd apps/trader-cli && npm test                                    # vitest

# === Stage 1 工作流（T006 — 需后端 :8000 + .env LLM；runs list 可离线）===
npm run trader-agent:backend:dev                                  # 先起 FastAPI
npm run trader-cli -- runs list --json
npm run trader-cli -- decide TSLA.US --json                       # 取 run_id 后 runs show
npm run trader-cli -- outcomes run --due --json
npm run trader-cli -- eval summary --json
npm run trader-cli -- insights explore --symbol TSLA.US --window 30d --json
npm run trader-workflows -- runs list --json                      # 直连 workflows（跳过 CLI 层）
cd apps/trader-workflows && npm test                              # 47 tests

# === Rust ratatui ===
npm run trader-chart:build                                        # cargo build -p trader-chart --release
cargo test -p trader-chart
```

---

## AI Agent 使用方式

1. **先读本文件** — 理解项目边界和模块关系
2. **再读对应 spec.json** — 确认 `scope.create` / `scope.forbidden` / `decisions` / `verification`
3. **读 task.json** — 确认当前 step 的 `depends_on` 和 `files_expected`；大任务读 `tasks/T00X-slices/` 分片
4. **用 CodeGraph** — `codegraph_context` 查模块上下游，`codegraph_explore` 深入具体文件
5. **不要** — grep 全局搜索作为第一步（先用 CodeGraph 和本文定位）
