# CLAUDE.md

> 项目快速指南。偏向正确性而非速度；小任务用判断力即可，非平凡任务一律走 **Spec-Driven Workflow**（见文末）。
> 配套文档：`.agent-dev/context/code_map.md`（项目结构快速定位）· `.agent-dev/README.md`（开发 artifact 说明）。
> 最后更新：2026-06-01。

---

## Quick Reference

```bash
# === Python 后端（FastAPI :8000，apps/trader-agent/backend）===
npm run trader-agent:backend:dev      # 启动 FastAPI + intel 路由（含启动前校验）
npm run trader-agent:backend:verify   # health + intel_route_count + ingest 200 校验
npm run trader-agent:backend:stop     # 关闭

# 后端测试 / Lint（始终从仓库根运行）
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/<file>.py -v --tb=short
.venv/Scripts/python.exe -m ruff check apps/trader-agent/backend/app/<path>.py

# === TypeScript CLI + Ink TUI（apps/trader-cli）===
cd apps/trader-cli && npx tsx src/index.ts        # 七页 Ink TUI（Dashboard/Chat/Signals/Hypotheses/Lessons/Ops/Settings）
npm run trader-cli -- analyze TSLA                 # 单次 LLM 深度分析（仓库根快捷脚本）
cd apps/trader-cli && npm test                     # vitest 单测（auditor / longbridgeCli / longbridgeAgent / traderChart / marketDataProvider / longbridgeTools）

# === Rust Ratatui 全屏 K 线（apps/trader-chart）===
npm run trader-chart:build           # cargo build -p trader-chart --release（首次必跑）
cargo test -p trader-chart            # 单测
# TUI 内 Dashboard 按 [c] 或 `trader chart TSLA` 进入

# === 旧 Shared Agent Memory（保留，但日常已不再扩展）===
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_artifact_catalog.py apps/trader-agent/backend/tests/test_markdown_section_indexer.py -v --tb=short
```

---

## Project Layout

```
stock-community-summary/
├── apps/
│   ├── trader-agent/backend/         # Python 后端 — FastAPI + SQLAlchemy + SQLite FTS5（含 intel 子系统）
│   │   ├── app/
│   │   │   ├── main.py               # FastAPI 入口（:8000，挂 intel_router + 旧 agent/knowledge）
│   │   │   ├── api/agent.py          # 旧 /api/knowledge/*, /api/agent/* 路由（不动）
│   │   │   ├── core/                 # Settings, events (record_agent_event), time (utc_now_iso)
│   │   │   ├── db/                   # models.py / migrations.py / session.py（旧 trader-agent.db）
│   │   │   ├── modules/              # 旧 Shared Agent Memory（_json / corpus_search / evidence_ref 可只读引用）
│   │   │   ├── intel/                # **Forward Market Intelligence 子系统**（market_intel.db）
│   │   │   │   ├── db/{connection,schema}.py  # 11 张表 + seed
│   │   │   │   ├── ingestion/        # market_data / events_ingest / seed_lessons / news_crawler / bars / alpha_vantage_data
│   │   │   │   ├── features/         # scanner / pattern_matcher / cross_asset
│   │   │   │   ├── context/selector.py
│   │   │   │   ├── trade/ideas.py
│   │   │   │   ├── postmortem/{evaluator,lessons}.py
│   │   │   │   ├── jobs/{premarket,close}.py
│   │   │   │   └── api/              # 11 路由：context/market/signals/events/hypotheses/lessons/trade_ideas/jobs/corpus/report_cache/news
│   │   │   └── tools/                # 外部数据源适配器
│   │   └── tests/                    # pytest（intel_phase0 → phase8 + market_status/news/pattern_matcher/report cache 等）
│   ├── trader-cli/                   # **TypeScript CLI + Ink TUI**（不是 pnpm workspace 成员，独立 npm）
│   │   ├── src/
│   │   │   ├── index.ts              # Commander.js 入口 + tui 默认子命令
│   │   │   ├── commands/             # 13 个：scan/analyze/brief/review/chart/chat/config/data/hypotheses/lessons/report/server/signals
│   │   │   ├── services/             # 共享业务逻辑（CLI 与 TUI 同源）：chart / market / news / report / scan / server / longbridge* / marketDataProvider / traderChart / envFile / repoRoot
│   │   │   ├── tui/                  # Ink v7 七页面板（app.tsx + pages/ + components/ + hooks/）
│   │   │   ├── llm/                  # Vercel AI SDK：provider.ts + tools.ts(INTEL) + longbridgeTools.ts(22 Tier1 + invoke) + buildAgentTools.ts + auditor.ts
│   │   │   └── api/client.ts         # fetch → localhost:8000/api/intel
│   │   └── package.json              # ink + commander + ai + asciichart + zod
│   ├── trader-chart/                 # **Rust ratatui 全屏 K 线**（cargo workspace member）
│   │   ├── src/{main,lib,app,api,model,viewport,symbols,intervals,handoff,ui/draw}.rs
│   │   └── tests/fixtures/bars.json  # 由 Ink Dashboard [c] / `trader chart SYMBOL` handoff 启动
│   ├── trader-cockpit/               # 旧 Next.js 15 + HeroUI 驾驶舱前端（intel 开发期间 **FORBIDDEN**，不动）
│   └── research-console/             # 旧研究控制台（只读参考）
│
├── docs/                             # VitePress 站点 + 设计文档 + 群聊总结归档
│   ├── workflow.md                   # Agent Dev Workflow v2（最终确认版）
│   ├── 01-forward-market-intelligence-system-design.md
│   ├── 02-mvp-module-development-plan.md
│   ├── 03-forward-market-intel-mvp-plan.md
│   ├── trader_agent_system_design_v0_3.md
│   ├── summaries/                    # 赵哥群聊总结（主语料源，2025-11 → 2026-05）
│   └── research-agent/target-system/trader-agent/
│       ├── 00-workflow-router.md     # ← 旧任务入口（Shared Agent Memory 路径）
│       └── 03-shared-agent-memory-development/
│
├── .agent-dev/                       # Spec / Task / Decision artifact（双文件 .md + .json）
│   ├── memory/schemas.md             # JSON Schema v1.0（6 种 artifact）
│   ├── context/code_map.md           # ← 项目结构快速定位（开发前必读）
│   ├── specs/<feature>/              # spec.md + spec.json + decision-record.json + dev-plan.md
│   ├── tasks/T00X.{md,json}          # 可执行步骤 + 依赖图 + worker_prompt_path
│   └── tasks/T00X-slices/            # 大任务的分片清单（worker prompt 拆解）
│
├── data/                             # 运行时数据（gitignored）
│   ├── trader-agent/trader-agent.db  # 旧 DB（**FORBIDDEN**，不动 schema）
│   ├── market_intel.db               # 新 intel DB（11 张表）
│   ├── raw/YYYY-MM-DD/               # Whop 原始 JSON 归档
│   └── structured/YYYY-MM-DD/        # LLM 结构化总结
│
├── Cargo.toml                        # Rust workspace（仅 apps/trader-chart 成员）
├── package.json                      # 仓库根脚本（trader-agent / trader-cli / trader-chart / docs / daily-* 等）
├── scripts/                          # Node 工具脚本（采集/发布/通知/audit）
└── CLAUDE.md                         # 本文件
```

---

## Architecture

### Forward Market Intelligence（主线 — intel 子系统）

```
yfinance / Alpha Vantage / RSS / 手工录入
    └─ ingestion/{market_data, news_crawler, events_ingest, seed_lessons}.py
         └─ market_intel.db（11 张表：symbols / market_bars / events / signals / patterns / hypotheses / trade_ideas / lessons / predictions / report_cache / ...）
              └─ features/{scanner, pattern_matcher, cross_asset}.py
                   └─ api/{signals, hypotheses, trade_ideas, events, lessons, market, context, jobs, news, report_cache}.py
                        └─ trader-cli (Ink TUI + Commander) / trader-cockpit（不动）
```

| 系统组件 | 入口 | 说明 |
|---|---|---|
| **后端 API** | `app/main.py` → `intel_router` | 11 个子路由（`/api/intel/*`），通过 `bootstrap_database()` lazy 建表 |
| **DB** | `data/market_intel.db` | 由 `intel/db/schema.py` 单文件管理 + `_migrate_*_columns` 模式（D114） |
| **Scanner** | `features/scanner.py` | 10 个 features + signal registry |
| **Patterns** | `features/pattern_matcher.py` | 5 条 MVP_PATTERNS，`patterns.trigger_sql` 必须非 NULL（V110） |
| **Context Builder** | `api/context.py` | `POST /context/build` 组装 market_data + signals + events + corpus + patterns + lessons + related_hypotheses（D102） |
| **Report Cache** | `api/report_cache.py` | `(symbol, date, latest_signal_ts)` 唯一键，服务端实时 join 失效（D105/D113） |
| **News** | `api/news.py` + `ingestion/news_crawler.py` | RSS/API/Web 三源 → `events.source_type='news'`（D103） |

### CLI + Ink TUI（apps/trader-cli）

```
trader (Commander)
  ├─ tui (默认)                    # Ink v7 七页面板
  │    ├─ DashboardPage [s scan] [g report] [c chart] [l/L longbridge]
  │    ├─ ChatPage  ← agent 路径触发 buildAgentTools()
  │    ├─ SignalsPage / HypothesesPage / LessonsPage / OpsPage / SettingsPage
  │    └─ components/ + hooks/(useFetchIntel/useCachedFetch/useListDetailNav)
  │
  ├─ scan / analyze / brief / review / chart / chat / config / data / hypotheses / lessons / report / server / signals
  │    └─ commands/* （瘦身 — 业务逻辑下沉到 services/）
  │
  └─ llm/
       ├─ tools.ts                INTEL_TOOLS（intel API + DB）
       ├─ longbridgeTools.ts      Tier1 22 个具名工具 + longbridgeInvoke（44 项白名单）
       ├─ buildAgentTools.ts      合并 INTEL + Longbridge（lazy probe，30s cache）
       ├─ provider.ts             Vercel AI SDK（DeepSeek / OpenRouter / Anthropic）
       └─ auditor.ts              10 条禁止规则审计
```

| 主题 | 关键文件 | 说明 |
|---|---|---|
| **services/ 共享层** | `services/*` | CLI 子命令与 TUI 页面通过 services 同源（D201/T003） |
| **Longbridge CLI Agent** | `services/longbridgeCli.ts` + `services/longbridgeAgent.ts` + `llm/longbridgeTools.ts` | env `TRADER_LONGBRIDGE_AGENT=on\|off`；只读 22 Tier1 + Tier2 invoke；客观行情事实**优先长桥**（T005） |
| **Ratatui handoff** | `tui/chartSession.ts` + `services/traderChart.ts` | Ink unmount → spawnSync inherit → relaunch Ink（D201/T004） |
| **报表/市场缓存** | `services/report.ts` + intel `api/report_cache.py` | 同日命中提示 `[缓存命中]`；market_bars `ingested_at` TTL short-circuit yfinance（D109） |

### Rust Ratatui 全屏图（apps/trader-chart）

`cargo workspace member`，单 binary。env：`TRADER_API_BASE`（默认 `http://127.0.0.1:8000/api/intel`）、`TRADER_CHART_BIN`、`TRADER_CHART_HANDOFF`（默认 `.cache/trader-cli/chart-handoff.json`）。消费 `GET /market/bars?chart=`，**不改后端 API**（D203）。

### 旧 Shared Agent Memory（保留，但日常不再扩展）

```
source_artifacts (M0)  ── file catalog (content_hash / source_type / memory_eligible)
document_sections (M1) ── heading-based markdown sections (heading_path / line_range)
document_sections_fts  ── FTS5 over sections

document_chunks + document_chunks_fts  ── OLD paragraph-based search — EXISTS, DO NOT MODIFY
```

| 模块 | 角色 | 可修改？ |
|---|---|---|
| `_json.py` | `dumps()` / `loads()` JSON 列辅助 | ❌ 只读引用 |
| `artifact_catalog.py` | M0 — `build_artifact_catalog()` | 仅 bug fix |
| `markdown_section_indexer.py` | M1 — `index_markdown_sections()` / `search_document_sections()` / `ensure_sections_fts()` | 仅 bug fix |
| `corpus_search.py` | M2 — `search_corpus()` | 仅 bug fix（intel/api/corpus.py 已包一层） |
| `document_indexer.py` / `local_search.py` | OLD | **Forbidden** |

---

## Conventions

### DB 约定

- `bootstrap_database(settings)` 调 `metadata.create_all(engine)` — `models.py` 新 Table 自动建
- `intel/db/schema.py` 用同样套路 + `_migrate_*_columns()` 兜底（避免单独写 migration 脚本）
- SQLAlchemy Table 辅助：`uuid_column(n)` / `timestamp_column(n)` / `json_column(n)`
- FTS5 虚拟表 **不能** 用 `metadata.create_all()` — 用 raw SQL `CREATE VIRTUAL TABLE IF NOT EXISTS`
- 所有 DB 访问走 `create_sqlite_engine(settings)`（`app/db/session.py`）；intel 子系统额外有 `intel/db/connection.py::get_intel_engine()`

### 审计事件

- `record_agent_event(settings, event_type=..., status=..., input_summary=..., error=...)` 写 `agent_events`
- 必须在 DB 事务关闭后调用（**绝不在** `engine.begin()` block 内 — 嵌套写锁会爆）
- 缓冲到 list，`with engine.begin() as conn:` 退出后再 flush
- 事件名注册表：`docs/.../07-audit-and-rebuild-workflow.md`

### CLI 约定

- 仓库根 `.env` 是单一来源；`trader-cli` 通过 `services/repoRoot.ts` + `services/envFile.ts` 读写（不复制到 `apps/trader-cli/.env`）
- TypeScript 直接用 `tsx`（**没有** `.mjs` 包装；无 build 步骤）
- 测试用 `tsx --test` 或 `vitest`（看 `package.json::scripts.test`）

### 文档链

```
PRD → dev doc (01-07-*.md) → spec.md + spec.json → task.md + task.json → worker prompt
```
Worker prompts 写入文件（`.agent-dev/<feature>-worker-prompt.md`），**绝不**在 chat 内 echo。

---

## Rules

### 1. Know the ground before breaking it

Read before write。绝不在没读源代码（current code + PRD + dev doc）就提 plan / worker prompt / 改动。

非平凡任务先读 `.agent-dev/specs/<feature>/spec.json` 与 `.agent-dev/tasks/T00X.json`；旧 Shared Agent Memory 路径走 `docs/research-agent/target-system/trader-agent/00-workflow-router.md`。**"看起来简单"不是跳过 spec 的理由。**

新模块替换或包装旧模块时，要读旧代码的算法层 — 入参解析、查询构造、结果组装、边界条件。旧行为存在自有道理。

任何 product 行为变更、schema 变更、API 合约变更、event 名变更、forbidden 文件改动 — **先 surface 再实现**。

### 2. Surgical scope

只动任务要的。不重构相邻代码；不顺手 fix 风格；不加没人要的功能。

Forbidden = forbidden。即使是"trivial fix"也不动 forbidden 文件（`trader-cockpit/**`、旧 `app/modules/**`、`trader-agent.db` schema、`intel/db/schema.py`（cli-tui-integration scope）等）。

每一行改动都该追溯到任务。只清你自己的 orphan；遗留问题除非挡路否则别碰。

### 3. Minimum code, no speculation

解决问题，不多做。三行类似 > 过早抽象。没有"也许以后用得到"。没有针对不可能状态的 error handling。内部代码与框架保证可信，只在系统边界做校验。

### 4. Surface, don't assume

需求歧义 → 问。dev doc 缺失 → flag。source of truth 冲突 → surface。有 >1 个合理答案的决策 → 用户拍板。

一个澄清问题花几秒；一次错误实现要花几小时。

### 5. Artifacts to files, not chat

Plans / worker prompts / decisions 写入 `.agent-dev/` 对应目录。Chat 用来讨论；长文 artifact 在文件里版本化、review、交接给其他 model 无需复制粘贴。

---

## Gotchas

具体的"坑"，不是原则。

1. **FTS5 ≠ SQLAlchemy Table**：`document_sections_fts` / `document_chunks_fts` 用 raw SQL `CREATE VIRTUAL TABLE IF NOT EXISTS`。塞 `models.py` 会把 `metadata.create_all()` 干爆。

2. **Events after transaction, never inside**：`record_agent_event()` 自己开 connection。在 `engine.begin()` 内调会嵌套写锁。先 buffer 到 list，事务退出后 flush。

3. **路径分隔符**：Windows repo。用 `.venv/Scripts/python.exe`，**不是** `.venv/bin/python`。仓库根：`cd "D:\workspace\01-products\stock-community-summary" && .venv/Scripts/python.exe ...`

4. **symbol_hints vs symbols**：旧代码用 `symbol_hints`（LIKE 匹配原文）。M1+ / intel 用 `symbols`（JSON 精确匹配）。语义不同，别混用。

5. **bootstrap_database is lazy**：调 `metadata.create_all()`，只建不存在的表。`models.py` 新 Table 自动建；但 FTS5 虚拟表还是要 raw SQL 在 `ensure_*_fts()` 里建。

6. **Longbridge probe lazy**（T005 / D310）：`apps/trader-cli/src/index.ts` 启动**不能** top-level await `ensureLongbridgeAgentOnStartup()` — 会让 `trader scan --help` 等非长桥命令被 1–3s probe 阻塞。仅在 `resolveAgentTools()` / `getAgentSystemPrompt()` 入口 lazy 调用，并用 30s probe cache（`refreshProbeCache(force)`）短路重入。

7. **Longbridge `check` 不在白名单**（T005 / D312）：`check` 是 `probeLongbridge` 内部用的 infrastructure 命令，**不**经 `longbridgeInvoke` 暴露给 LLM。`BLOCKED_TOP_LEVEL` 也**不**含 `check`（probe 内部 spawn 不走网关）。LLM 显式 `longbridgeInvoke({command:"check"})` 会被 `NOT_WHITELISTED` 拦截。

8. **repo-root `.env`**：`trader-cli` 与后端共用仓库根 `.env`。改 env 用 `services/envFile.ts` 的 helper，别让 TUI 写到 `apps/trader-cli/.env`，否则后端读不到。

9. **`asciichart.d.ts`** 是手写的 type shim（`apps/trader-cli/src/asciichart.d.ts`），不是 `@types/asciichart`。改 `asciichart` API 调用时一并同步类型。

10. **Ratatui handoff 在同终端 inherit**（T004 / D201）：Ink 必须 `unmount()` 再 `spawnSync(traderChartBin, args, { stdio: "inherit" })`，子进程退出后 relaunch Ink。非 Windows 也是同样路径，**不**用 `start` 新窗口。

11. **`patterns.trigger_sql` 必须显式回填**（T002 / D110）：`INSERT OR IGNORE` 对已存在行 **不会更新**。schema migration 必须跑 `_migrate_pattern_trigger_sql` 的 UPDATE，否则 V110 失败。

12. **Report cache 命中要打标记**（T002 / V104）：CLI 端命中时打印 `[缓存命中]`，否则只看耗时区分不了 cache hit 与 LLM 偶发快。

---

## Spec-Driven Development Workflow

所有非平凡任务必须遵循 spec-driven 流程（依据 `docs/workflow.md` v2，**最终确认版**）：

### 流程

```text
CodeGraph（语义索引）
  → DeepSeek + OpenSpec + grill-me（生成 spec + 压力测试）
  → Clarification Questions（发现模糊决策）
  → 用户拍板关键决策
  → spec.md + spec.json  +  task.md + task.json（双文件 artifact）
  → Cursor Composer 2.5 + Superpowers（Dev Plan + 实现）
  → Test / Verify
  → Codex Review（对比 spec scope + diff）
  → Cursor Fix
  → Codex Re-review
  → GitHub PR / Merge
```

### 双文件 Artifact

每个关键 Artifact 同时输出 `.md`（给人读）和 `.json`（给脚本校验）：

| Artifact | 存放位置 | JSON Schema |
|---|---|---|
| Spec | `.agent-dev/specs/<feature>/spec.json` | `schemas.md §1` |
| Task | `.agent-dev/tasks/T00X.json` | `schemas.md §2` |
| Decision Record | `.agent-dev/specs/<feature>/decision-record.json` | `schemas.md §3` |
| Review Findings | `.agent-dev/reviews/<task>-review-findings.json` | `schemas.md §4` |
| Change Set | `.agent-dev/changesets/CS001.json` | `schemas.md §5` |

JSON Schema 定义在 `.agent-dev/memory/schemas.md`。

### 工具链

| 工具 | 用途 |
|---|---|
| **CodeGraph** | `codegraph index` + `codegraph serve`（MCP），AI agent 用 `codegraph_context`/`codegraph_explore` 替代 grep |
| **Code Map** | `.agent-dev/context/code_map.md` — 项目结构快速定位，**开发前必读** |
| **DeepSeek + OpenSpec + grill-me** | Spec 生成 + 规范化校验 + 压力测试 |
| **Cursor Composer 2.5 + Superpowers** | Brainstorm → Plan → Implement → Review → Verify |
| **Codex** | 结构化 Code Review（对比 spec scope + decisions） |

### 三个强制 Gate

1. **Clarification Gate**：任何有 >1 个合理答案的决策，先问用户，确认后写入 `decision-record.json`
2. **Plan Gate**：Dev Plan 展示后，用户确认才能开始实现
3. **Review Gate**：Codex review 的 blocker 必须清零才能 merge

### 当前 specs / tasks 一览（详见 `.agent-dev/README.md`）

| Task | Spec | 标题 | 状态 |
|---|---|---|---|
| T001 | `forward-market-intel` | Forward Market Intelligence MVP（P0-P9） | in_progress（核心 phase 已落地） |
| T002 | `cli-tui-v2` | Ink TUI 框架 + 报表/市场缓存 + 新闻爬虫 | completed |
| T003 | `cli-tui-integration` | 七页 TUI 接入 + services 共享层 | approved |
| T004 | `trader-chart-ratatui` | Rust ratatui 全屏 K 线 + Ink handoff | done |
| T005 | `trader-longbridge-agent-cli` | Longbridge CLI Agent 工具化（22 Tier1 + invoke） | in_progress（audit + patch） |

参考：`docs/workflow.md` · `docs/research-agent/target-system/trader-agent/00-workflow-router.md` §5.0。
