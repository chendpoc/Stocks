# Code Map — stock-community-summary

> 给 AI agent 的快速定位指南。先用本文理解结构，再用 CodeGraph 做精确查询。
> 更新：2026-05-31

---

## 项目总览

```
stock-community-summary/
├── apps/
│   ├── trader-agent/backend/   ← Python 后端（FastAPI + SQLAlchemy + SQLite FTS5）
│   ├── trader-cockpit/         ← 交易驾驶舱前端（Next.js 15 + HeroUI）
│   ├── trader-cli/             ← TypeScript CLI（LLM + /api/intel on :8000）
│   └── research-console/       ← 旧研究控制台（只读参考，不扩展）
├── docs/                       ← VitePress 站点 + 设计文档 + 总结归档
├── data/                       ← 运行时数据（DB / raw / structured）
├── scripts/                    ← Node.js 脚本（采集/发布/通知）
├── packages/summary-core/      ← 共享 TypeScript 包
├── utils/                      ← Python 工具库（采集/解析/搜索/通知）
├── .agent-dev/                 ← Agent 开发 artifact（spec/task/decision）
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
├── modules/                    ← 业务模块（FORBIDDEN — 禁止修改）
│   ├── _json.py                ← dumps()/loads()（可用）
│   ├── corpus_search.py        ← search_corpus()（可用）
│   ├── evidence_ref.py         ← EvidenceRef（可用）
│   ├── context_selector.py     ← select_context()（不再使用）
│   ├── memory_service.py       ← list/create_memory_item()（不再使用）
│   └── ...                     ← 其他模块标记 DEPRECATED
├── intel/                      ← NEW: Forward Market Intelligence
│   ├── db/connection.py        ← get_intel_engine() → data/market_intel.db
│   ├── db/schema.py            ← 11 张表定义 + seed 数据
│   ├── context/selector.py     ← select_lessons()（10条/6000字预算）
│   ├── ingestion/
│   │   ├── market_data.py      ← yfinance 数据拉取
│   │   ├── events_ingest.py    ← 事件录入
│   │   └── seed_lessons.py     ← LLM 扫描 summaries 提取 seed lessons
│   ├── features/scanner.py     ← 10 特征 + scanner registry
│   ├── trade/ideas.py          ← hypothesis → trade_idea
│   ├── postmortem/
│   │   ├── evaluator.py        ← prediction → outcome
│   │   └── lessons.py          ← 复盘 → lesson（只写新 DB）
│   ├── jobs/
│   │   ├── premarket.py        ← 盘前数据包
│   │   └── close.py            ← 收盘数据包 + 触发 evaluator
│   └── api/
│       ├── context.py          ← POST /api/intel/context/build
│       ├── market.py           ← /api/intel/market/*
│       ├── signals.py          ← /api/intel/signals/*
│       ├── hypotheses.py       ← /api/intel/hypotheses/*（CRUD）
│       ├── trade_ideas.py      ← /api/intel/trade-ideas/*
│       ├── lessons.py          ← /api/intel/lessons/*
│       ├── events.py           ← /api/intel/events/*
│       └── jobs.py             ← /api/intel/jobs/*
└── tools/                      ← 外部数据源适配器（yfinance/alpha_vantage/longbridge/SEC）
```

### 数据库

| 数据库 | 路径 | 用途 |
|---|---|---|
| `trader-agent.db` | `data/trader-agent/trader-agent.db` | 旧系统（FORBIDDEN — 不动 schema） |
| `market_intel.db` | `data/market_intel.db` | 新系统（11 张表） |

### 关键路径约定

| 项目 | 路径 |
|---|---|
| Python 解释器 | `.venv/Scripts/python.exe` |
| 测试命令 | `.venv/Scripts/python.exe -m pytest <test_file> -v --tb=short` |
| Lint | `.venv/Scripts/python.exe -m ruff check <file>` |
| 后端启动 | `npm run trader-agent:backend:dev` → `scripts/dev_server.py`（factory + 启动前校验 intel） |
| 后端验证 | `npm run trader-agent:backend:verify`（health 含 intel_route_count + ingest 200） |

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

**FORBIDDEN** — intel 开发期间不碰。

---

## CLI：apps/trader-cli/（TypeScript + tsx，无 .mjs 包装）

```
src/
├── index.ts                  ← Commander.js 入口
├── api/client.ts             ← fetch → localhost:8000/api/intel
├── llm/
│   ├── provider.ts           ← Vercel AI SDK（DeepSeek/OpenRouter/Anthropic）
│   ├── tools.ts              ← 10 个 LLM tool definitions
│   └── auditor.ts            ← 10 条禁止规则审计
├── commands/                 ← scan/analyze/brief/review/chat
└── ui/display.ts             ← 终端格式化
```

技术栈：TypeScript + tsx + Commander.js + Vercel AI SDK（ai + @ai-sdk/openai + @ai-sdk/anthropic）

不是 pnpm workspace 成员。独立安装依赖。

---

## 文档：docs/

```
docs/
├── summaries/                ← 赵哥群聊总结（2025-11 → 2026-05，主语料源）
├── workflow.md               ← Agent Dev Workflow v2（最终确认版）
├── 01-forward-market-intelligence-system-design.md
├── 02-mvp-module-development-plan.md
├── 03-forward-market-intel-mvp-plan.md
├── 03-forward-market-intel-worker-prompt.md
└── research-agent/target-system/trader-agent/
    ├── 00-workflow-router.md ← 局部 workflow 路由 + spec gate
    ├── 00-system-overview.md ← 三层架构总览
    ├── 01-agent-core-backend-prd.md
    ├── 03-shared-agent-memory-prd.md
    └── 03-shared-agent-memory-development/
```

---

## 数据：data/

```
data/
├── raw/YYYY-MM-DD/           ← Whop 原始 JSON 归档
├── structured/YYYY-MM-DD/    ← LLM 结构化总结
├── generated/                ← 生成文件
├── trader-agent/
│   └── trader-agent.db       ← 旧 DB（不动）
└── market_intel.db           ← 新 DB（NEW）
```

---

## Agent Dev Artifacts：.agent-dev/

```
.agent-dev/
├── memory/
│   ├── schemas.md            ← JSON Schema v1.0（6 种）
│   └── cursor-setup.md       ← Cursor 配置
├── specs/forward-market-intel/
│   ├── spec.json             ← scope / decisions / verification
│   ├── spec.md               ← 人读说明
│   └── decision-record.json  ← D001-D013
├── tasks/
│   ├── T001.json             ← 10 steps + 依赖图
│   └── T001.md
└── context/
    └── code_map.md           ← 本文件
```

---

## 禁止触碰区域

| 路径 | 原因 |
|---|---|
| `app/modules/**` | 旧模块（除 `_json.py`/`corpus_search.py`/`evidence_ref.py`/`core.*`/`db.*` 可只读引用） |
| `app/core/**` | Settings/events/time 只读引用 |
| `apps/trader-cockpit/**` | 旧系统前端 |
| `trader-agent.db` | 旧 DB schema |
| `apps/research-console/**` | 旧控制台 |

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
# 后端开发
npm run trader-agent:backend:dev     # 启动 FastAPI (port 8000)

# 测试
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_intel_phase0_schema.py -v --tb=short

# CodeGraph
codegraph serve --watch              # 启动 MCP server（开发时保持运行）
codegraph index                       # 重建索引

# 文档
npm run docs:dev                     # VitePress 开发服务器

# CLI（待构建后）
npm run trader-cli -- analyze TSLA
npm run trader-cli -- chat
```

---

## AI Agent 使用方式

1. **先读本文件** — 理解项目边界和模块关系
2. **读 spec.json** — 确认 scope.create / scope.forbidden / decisions / verification
3. **读 task.json** — 确认当前 step 的 depends_on 和 files_expected
4. **用 CodeGraph** — `codegraph_context` 查模块上下游，`codegraph_explore` 深入具体文件
5. **不要** — grep 全局搜索作为第一步（先用 CodeGraph 和本文定位）
