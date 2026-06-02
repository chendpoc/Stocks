# Project Overview — Stock Community Summary

> 版本：2026-06-01 · 面向：新接手的开发者、AI Agent、外部合作者
>
> 配套开发文档：`CLAUDE.md`（开发规约）· `.agent-dev/context/code_map.md`（文件级定位）· `.agent-dev/README.md`（artifact 说明）

---

## 一句话定义

**以顶级交易员群聊语料为认知核心，以行情/新闻/期权/对手盘等工具为验证能力，以 LLM 推理为前瞻解读引擎，以复盘机制为自我强化链路的专业交易 Agent 系统。**

它不是自动喊单机器人，不是纯量化回测平台，也不是简单的 RAG 聊天助手。它的闭环是：

```
交易员语料 → 市场数据 → 特征提取 → 异常信号 → LLM 假说生成 → 交易机会候选 → 复盘验证 → 经验沉淀 → 持续进化
```

---

## 项目起源与演进

| 阶段 | 时间线 | 产物 |
|---|---|---|
| **群聊总结** | 2025-11 → 至今 | 每日 Whop 群聊 → DeepSeek 结构化总结 → VitePress 站点发布（`scripts/daily-*.mjs`） |
| **Shared Agent Memory** | 2026-03 → 05 | 旧 Python 后端 + SQLite FTS5（文档分段索引、语料搜索、playbook 沉淀） |
| **Forward Market Intelligence** | 2026-05 → 至今 | `app/intel/` 子系统 — 行情拉取、信号扫描、假说管理、报表缓存、复盘引擎 |
| **CLI + Ink TUI** | 2026-05 → 至今 | TypeScript CLI 七页终端面板 — 替代 Web 仪表盘成为主交互入口 |
| **Ratatui 全屏图** | 2026-06 | Rust 全屏 K 线 — 从 Ink TUI 内 handoff 启动 |
| **Longbridge CLI Agent** | 2026-06 → 进行中 | 22 个长桥只读工具 + Tier2 invoke — 客观行情事实优先长桥 |

旧阶段产物（Shared Agent Memory、Web Cockpit）保留但不再扩展，新功能全部通过 intel + CLI 路径开发。

---

## 核心设计原则

### 1. 固定战场

只在少量高流动性、高关注度标的上寻找高胜率 setup，不扫全市场低质量信号。

MVP 标的池：`TSLA` / `TSLL` / `QQQ` / `SPY` / `ARKK` / `NVDA` / `COIN` / `BMNR`

### 2. LLM 不直接交易

- **LLM 负责**：语料理解、新闻解读、假说生成、复盘解释、工具调度
- **确定性系统负责**：setup 判断、规则执行、风控、状态流转
- **硬边界**：`Risk Engine > Rule Engine > Model Prediction > LLM Explanation`

### 3. 交易员语料是认知核心

系统最重要的资产不是行情 API，而是顶级交易员的思考方式 — 在什么市场环境下说了什么、事后市场怎么走、类似场景历史胜率如何。

### 4. 假说驱动，非预测驱动

系统把散户从 `感觉 → 冲动 → 事后找理由` 升级为 `假说 → 证据 → 验证点 → 条件触发 → 风控计划 → 复盘学习`。

---

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│ 用户入口                                                 │
│                                                         │
│  CLI TUI（Ink v7 七页面板）    Ratatui 全屏 K 线          │
│  ├─ Dashboard / Chat / Signals / Hypotheses             │
│  ├─ Lessons / Ops / Settings                            │
│  └─ 13 个 Commander 子命令                               │
│                                                         │
│  Longbridge CLI Agent（22 Tier1 工具 + invoke）          │
│  Vercel AI SDK（DeepSeek / OpenRouter / Anthropic）      │
└───────────────────────┬─────────────────────────────────┘
                        │ fetch → localhost:8000/api/intel
┌───────────────────────▼─────────────────────────────────┐
│ Python FastAPI 后端（:8000）                              │
│                                                         │
│  intel/ 子系统                                           │
│  ├─ ingestion    行情/新闻/事件/语料导入                   │
│  ├─ features     信号扫描 / 模式匹配 / 跨资产共现          │
│  ├─ context      上下文组装（不调 LLM）                    │
│  ├─ trade        交易机会候选                             │
│  ├─ postmortem   复盘评估 + 经验沉淀                      │
│  ├─ jobs         盘前/收盘数据包                          │
│  └─ api          11 路由（RESTful JSON）                  │
│                                                         │
│  旧 modules/     Shared Agent Memory（只读引用）          │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│ 数据层                                                   │
│                                                         │
│  market_intel.db   11 张表 — 新 intel 系统                │
│  trader-agent.db   旧系统（保留，不动 schema）             │
│  docs/summaries/   每日群聊结构化总结（主语料源）           │
│  data/raw/         Whop 原始 JSON 归档                    │
└─────────────────────────────────────────────────────────┘
```

### 数据流闭环

```
外部数据（yfinance / Alpha Vantage / RSS / Longbridge / 手工录入）
  │
  ▼
ingestion/ → market_bars / events / 语料写入 market_intel.db
  │
  ▼
features/scanner.py → 10 维特征计算 → signals 表
features/pattern_matcher.py → 5 类 MVP 模式匹配
  │
  ▼
api/context.py → POST /context/build → 组装 market_data + signals + events + corpus + patterns + lessons + related_hypotheses
  │
  ▼
CLI llm/ → Vercel AI SDK → LLM（DeepSeek / Anthropic）→ 假说生成 → hypotheses / trade_ideas 写回 DB
  │
  ▼
api/jobs.py → 盘前/收盘数据包
  │
  ▼
postmortem/ → 1D/3D/5D 复盘 → lessons 沉淀 → 反哺 context/build → 闭环
```

---

## 仓库结构

```
stock-community-summary/
├── apps/
│   ├── trader-agent/backend/     Python 后端（FastAPI + SQLite + intel 子系统）
│   ├── trader-cli/               TypeScript CLI + Ink TUI（独立 npm，非 pnpm workspace）
│   ├── trader-chart/             Rust ratatui 全屏 K 线（cargo workspace member）
│   ├── trader-cockpit/           Next.js 15 驾驶舱前端（暂冻结）
│   └── research-console/        旧研究控制台（只读参考）
│
├── docs/                         VitePress 站点 + 设计文档 + 群聊总结归档
├── scripts/                      每日采集 / 发布 / 通知 / 审计脚本（Node.js）
├── data/                         运行时数据（gitignored）
├── .agent-dev/                   开发 artifact（spec / task / decision / worker prompt）
├── packages/summary-core/        共享 TypeScript 包
├── utils/                        Python 工具库
├── Cargo.toml                    Rust workspace
├── CLAUDE.md                     开发规约（AI Agent 必读）
└── package.json                  仓库根快捷脚本
```

---

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| **后端** | Python 3.12 + FastAPI + SQLAlchemy + SQLite FTS5 | 纯数据检索与结构化输出，零 LLM 依赖 |
| **CLI / TUI** | TypeScript 5 + tsx + Ink 7 + Commander 12 | 主交互入口，七页终端面板 |
| **LLM** | Vercel AI SDK（`ai` + `@ai-sdk/openai` + `@ai-sdk/anthropic`） | 全在 CLI 侧调用（DeepSeek / OpenRouter / Anthropic 可切换） |
| **K 线图** | Rust + ratatui 0.29 + crossterm + tokio + reqwest | 全屏蜡烛图 + 量 + 十字线，8 周期 |
| **行情数据** | yfinance / Alpha Vantage / Longbridge CLI | Longbridge 22 个只读 Tier1 工具 + 44 项 invoke 白名单 |
| **审计** | 10 条禁止规则审计器（`auditor.ts`） | 防止 LLM 在无证据时下结论 |
| **文档站** | VitePress | 每日总结 + 设计文档 |
| **脚本** | Node.js（`.mjs`） | 每日同步 / 发布 / 微信通知 / 飞书卡片 |

---

## 主要产品功能

### Ink TUI 七页面板

| 页面 | 快捷键 | 功能 |
|---|---|---|
| **Dashboard** | `1` | 指挥中心 — `[s]` 扫描 / `[g]` 报告 / `[c]` Ratatui K 线 / `[l]/[L]` Longbridge 外挂 |
| **Chat** | `2` | Agent 对话 — 注入 intel + Longbridge 工具，20 轮 messages 内存 |
| **Signals** | `3` | 信号列表 — 按标的/日期筛选 |
| **Hypotheses** | `4` | 假说管理 — CRUD + 历史记录注入 context/build |
| **Lessons** | `5` | 经验库 — 复盘沉淀的教训与规律 |
| **Ops** | `6` | 运维 — 后端 server 状态 / `[I]` ingest / `[N]` news |
| **Settings** | `7` | 配置 — `MARKET_DATA_PROVIDER` / `TRADER_LONGBRIDGE_AGENT` on/off |

### CLI 子命令

```bash
trader scan              # 信号扫描
trader analyze TSLA      # 单次 LLM 深度分析
trader chat              # Agent 对话（--eval 非交互模式）
trader brief             # 盘前数据包
trader review            # 收盘复盘数据包
trader report TSLA       # 生成/缓存命中 LLM 日报
trader chart TSLA        # ASCII 或 Ratatui K 线
trader server start|stop|status   # 后端生命周期管理
trader data status|ingest         # 行情数据状态 / 拉取
trader config show|set            # 环境变量管理
trader signals [symbol]  # 信号列表
trader hypotheses [symbol]
trader lessons [symbol]
```

### Longbridge CLI Agent

当 `TRADER_LONGBRIDGE_AGENT=on` 时，Chat / Analyze 路径注册 22 个只读具名工具（报价 / K 线 / 盘口 / 财报 / 新闻 / 估值 / 持仓 / 筛选等）+ 1 个 Tier2 `longbridgeInvoke`（44 项白名单）。客观行情事实**优先长桥**，系统内信号/假说/经验仍走 intel。

### 每日总结流水线

```
Whop 群聊 JSON → scripts/daily-summary.mjs → DeepSeek 结构化总结 → docs/summaries/
                                            → scripts/daily-publish.mjs → VitePress 发布
                                            → scripts/notify-*.mjs → 微信/飞书通知
```

---

## 数据库

| 数据库 | 路径 | 表数 | 用途 |
|---|---|---|---|
| `market_intel.db` | `data/market_intel.db` | 11 | **主数据库** — symbols / market_bars / events / signals / patterns / hypotheses / trade_ideas / lessons / predictions / report_cache 等 |
| `trader-agent.db` | `data/trader-agent/trader-agent.db` | 20+ | 旧 Shared Agent Memory（保留，不改 schema） |

---

## 开发工作流

本项目采用 **Spec-Driven Development**，所有非平凡任务遵循固定流程：

```
CodeGraph 语义索引
  → Spec 生成 + 压力测试（grill-me）
  → Clarification Gate（模糊决策必须先问用户）
  → spec.md + spec.json + task.json（双文件 artifact）
  → Plan Gate（Dev Plan 用户确认后才能实现）
  → Cursor 实现 + 测试
  → Codex Review（Review Gate — blocker 清零才能 merge）
  → GitHub PR
```

所有 spec / task / decision 持久化在 `.agent-dev/` 目录下。详见 `project-docs/workflows/agent-dev-workflow.md` 与 `.agent-dev/README.md`。

---

## 当前开发任务

| Task | 标题 | 状态 | 简述 |
|---|---|---|---|
| **T001** | Forward Market Intelligence MVP | in_progress | 11 张表 + 11 路由 + scanner + CLI — 核心 Phase 已落地 |
| **T002** | CLI TUI v2 | completed | Ink 七页壳 + 报表缓存 + 市场 TTL + 新闻爬虫 + 服务管理 |
| **T003** | CLI TUI 功能集成 | approved | 七页 TUI 接入 services 共享层 + Dashboard 指挥中心 |
| **T004** | Ratatui 全屏 K 线 | done | Rust ratatui + Ink handoff（同终端 inherit） |
| **T005** | Longbridge CLI Agent 工具化 | in_progress | 22 Tier1 + invoke 白名单 — 当前为 audit + patch 阶段 |

---

## 快速上手

### 前置条件

- Node.js ≥ 20
- Python 3.12 + `.venv`（已初始化）
- Rust toolchain（`cargo`，仅 trader-chart 需要）
- Longbridge CLI（可选，启用 `TRADER_LONGBRIDGE_AGENT=on`）

### 启动

```bash
# 1. 启动 Python 后端
npm run trader-agent:backend:dev

# 2. 验证后端健康
npm run trader-agent:backend:verify

# 3. 启动 CLI TUI
cd apps/trader-cli && npx tsx src/index.ts

# 4.（可选）构建 Rust K 线
npm run trader-chart:build
```

### 环境变量（仓库根 `.env`）

| 变量 | 说明 | 默认 |
|---|---|---|
| `LLM_PROVIDER` | LLM 提供方（`deepseek` / `openrouter` / `anthropic`） | `deepseek` |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | — |
| `OPENROUTER_API_KEY` | OpenRouter API Key（备用） | — |
| `ANTHROPIC_API_KEY` | Anthropic API Key（备用） | — |
| `MARKET_DATA_PROVIDER` | 行情数据源（`yfinance` / `alpha_vantage`） | `yfinance` |
| `TRADER_LONGBRIDGE_AGENT` | Longbridge CLI Agent 开关 | `on` |
| `TRADER_API_BASE` | Ratatui 消费的后端地址 | `http://127.0.0.1:8000/api/intel` |

### 测试

```bash
# Python 后端
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/ -v --tb=short

# TypeScript CLI
cd apps/trader-cli && npm test

# Rust K 线
cargo test -p trader-chart
```

---

## 设计文档索引

| 文档 | 路径 | 说明 |
|---|---|---|
| 系统设计 v0.3 | `project-docs/legacy/trader-agent/trader_agent_system_design_v0_3.md` | 三层架构全景 — Brain / Cockpit / Platform |
| Forward Market Intelligence 设计 | `project-docs/legacy/forward-intel/01-forward-market-intelligence-system-design.md` | intel 子系统详细设计 |
| MVP 模块开发指导 | `project-docs/legacy/forward-intel/02-mvp-module-development-plan.md` | 技术栈选型 + Phase 规划 |
| MVP 实施计划 | `project-docs/legacy/forward-intel/03-forward-market-intel-mvp-plan.md` | 10 个预决策 + 项目结构 + Phase 验收 |
| Agent Dev Workflow v2 | `project-docs/workflows/agent-dev-workflow.md` | Spec-Driven 完整流程（最终确认版） |
| 开发规约 | `CLAUDE.md` | AI Agent 必读 — 规则 / 坑 / 架构 / 约定 |
| 代码地图 | `.agent-dev/context/code_map.md` | 文件级快速定位 |
| Artifact 说明 | `.agent-dev/README.md` | spec / task / decision 双文件 artifact |

---

## 愿景路线图

### 当前（v0.1 — MVP 验证闭环）

- 固定标的池信号扫描 + LLM 假说 + 复盘
- CLI TUI 交互 + Longbridge 只读行情
- 单用户本地部署

### Phase 2（近期规划）

- `MARKET_DATA_PROVIDER=longbridge` 直接入库
- 期权结构分析（Momentum Options Trader）
- 深度学习 Shadow Inference（SetupSuccessPredictor / SignalRanker）
- Web Cockpit 复活（trader-cockpit 解冻）

### 远期

- Paper Trading + 条件型 Trade Ticket
- 多标的动态池
- 微结构 / Order Flow Observer
- 人机协同审批链路
