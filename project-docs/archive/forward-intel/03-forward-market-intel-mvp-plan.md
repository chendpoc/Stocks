# Forward Market Intelligence — MVP 实施计划

Status: confirmed
Owner: codex
Created: 2026-05-30
Confirmed: 2026-05-30 (all 6 decisions resolved)

## Specification Gate Check

- [x] Source checked — 01-forward-market-intelligence-system-design.md ✓, 02-mvp-module-development-plan.md ✓, 现有 M0-M6 ✓
- [x] Decisions frozen — 6 user ✓ + 4 technical ✓
- [x] Scope bounded — intel/ 子目录 + new DB + TS CLI
- [x] Verification mapped — per-phase
- [x] Prompt self-contained — worker prompt 独立文件
- [x] Behavior preserved — 旧管线保留不删，M0-M6 只读复用

## Pre-plan Decision Inventory

| # | 决策 | 结论 |
|---|---|---|
| 1 | 可复用模块 | M0-M6 知识层 + events + 基础设施。管线模块退役 |
| 2 | 项目方案 | C：旧项目 + `app/intel/` 子目录 |
| 3 | 数据库 | 新 `market_intel.db` |
| 4 | MVP 范围 | 全 9 Phase，CLI 替代 Web Dashboard |
| 5 | CLI | TypeScript CLI + Vercel AI SDK。**LLM 调用全在 CLI 中**，通过 tool call 调用后端 `/api/intel/*` 端点。Python 后端不做 LLM 推理 |
| 6 | LLM | CLI 侧 Vercel AI SDK 统一管理。Python 后端零 LLM 依赖 |
| 7 | 后端定位 | Python FastAPI = 纯数据检索和结构化输出层。核心端点：`POST /api/intel/context/build`（组装上下文，不调 LLM） |
| 8 | Auditor | 移到 CLI 侧（TypeScript）。无反方证据降为 warning（检查是否说明了推理过程，不强制编造） |
| 9 | Context 注入 | 新建 `app/intel/context/selector.py`，从新 DB lessons 表选取（10 条/6000 字符）。不依赖旧 select_context |
| 10 | 冷启动 | 用 LLM 扫描 `docs/summaries/` → `seed_lessons.py` 写入 lessons 表 |

---

## 1. 项目结构

```
apps/trader-agent/backend/app/
├── modules/              # 保留：M0-M6 + events + infra（只读复用）
│   ├── evidence_ref.py
│   ├── context_selector.py
│   ├── corpus_search.py
│   ├── markdown_section_indexer.py
│   ├── artifact_catalog.py
│   ├── events.py
│   └── ...（其他模块标记为 deprecated，不 import）
│
├── intel/                # NEW — 前瞻市场情报系统
│   ├── __init__.py
│   ├── db/
│   │   ├── __init__.py
│   │   ├── connection.py      # market_intel.db 连接
│   │   └── schema.py          # 所有新表定义
│   ├── ingestion/
│   │   ├── market_data.py     # yfinance adapter + 缓存
│   │   └── events_ingest.py   # 新闻/事件导入
│   ├── features/
│   │   └── scanner.py         # 特征计算 + 信号扫描
│   ├── trade/
│   │   └── ideas.py           # 交易机会候选生成
│   ├── postmortem/
│   │   ├── evaluator.py       # prediction → outcome 评估
│   │   └── lessons.py         # lesson 写入 + 查询
│   ├── jobs/
│   │   ├── premarket.py       # 盘前 brief
│   │   ├── intraday.py        # 盘中扫描
│   │   └── close.py           # 收盘复盘
│   ├── api/
│   │   ├── __init__.py
│   │   ├── context.py          # POST /api/intel/context/build（核心：组装上下文）
│   │   ├── market.py           # /api/intel/market/*
│   │   ├── signals.py          # /api/intel/signals/*
│   │   ├── hypotheses.py       # /api/intel/hypotheses/*（CRUD，不调 LLM）
│   │   ├── trade_ideas.py      # /api/intel/trade-ideas/*
│   │   ├── lessons.py          # /api/intel/lessons/*
│   │   ├── events.py           # /api/intel/events/*
│   │   └── jobs.py             # /api/intel/jobs/*
│
├── api/agent.py               # 新增 /api/intel/* 路由注册
└── db/models.py               # 不改（新表在 intel/db/schema.py）

data/
└── market_intel.db             # NEW — 新数据库

apps/
└── trader-cli/                 # NEW — TypeScript CLI (pnpm workspace)
    ├── package.json
    ├── src/
│   │   ├── index.ts            # CLI entry (Commander.js)
│   │   ├── commands/
│   │   │   ├── scan.ts         # trader scan
│   │   │   ├── analyze.ts      # trader analyze <symbol>（LLM + tool use）
│   │   │   ├── brief.ts        # trader brief（盘前）
│   │   │   ├── review.ts       # trader review（收盘复盘）
│   │   │   ├── memory.ts       # trader memory list/extract
│   │   │   └── chat.ts         # trader chat（交互对话，LLM + tool use）
│   │   ├── llm/
│   │   │   ├── provider.ts     # Vercel AI SDK 配置（DeepSeek/OpenRouter/Anthropic）
│   │   │   ├── tools.ts        # LLM tool definitions（对应后端 /api/intel/*）
│   │   │   └── auditor.ts      # 10 条禁止规则审计（TS 侧）
│   │   ├── api/
│   │   │   └── client.ts       # fetch wrapper → FastAPI
│   │   └── ui/
│   │       └── display.ts      # 终端格式化输出
    └── tsconfig.json
```

## 2. Phase 0: 项目初始化 + Schema

### 目标
创建 `market_intel.db` + 全量表。

### 表（按 02 §5）

| 表 | 用途 |
|---|---|
| `symbols` | MVP 标的池 |
| `market_bars` | 行情 OHLCV |
| `events` | 新闻/政策/宏观事件 |
| `smart_money_actions` | ARK/Baron/内部人 |
| `patterns` | 可复用市场规律 |
| `signals` | 扫描发现的异常 |
| `hypotheses` | LLM 假说 |
| `predictions` | 假说的可验证预测 |
| `outcomes` | 预测验证结果 |
| `lessons` | 复盘经验 |
| `trade_ideas` | 交易候选 |

Schema 按 02 §5 的 SQL 定义，做以下调整：
- `events.affected_symbols`：改为 JSON 数组（`'["TSLA","TSLL"]'`），避免 LIKE 模糊匹配误命中
- `predictions`：增加 `reference_price REAL` 列（prediction 创建时的收盘价，供 Phase 6 评估用）

Seed 数据：
- `symbols`：8 个 MVP 标的
- `patterns`：5 条初始规律（higher_low_accumulation、volume_contraction_pullback、vwap_reclaim、relative_strength_divergence、taco_pattern），确保 LLM 从第一天起有 pattern 参考

### 文件
- `app/intel/` 目录结构 + `__init__.py`（logger 配置）
- `app/intel/db/connection.py` + `schema.py`
- `app/main.py` 注册 `/api/intel/*` 路由
- 测试：`tests/test_intel_phase0_schema.py`

## 3. Phase 1: 行情数据接入

### 目标
导入 8 个 MVP 标的日线 + 5m 分钟线。

### 数据源
yfinance 主力。Alpha Vantage / Longbridge adapter 接口就绪但默认关闭。

### VWAP 降级
yfinance 不保证所有标的返回 VWAP。降级策略：`(High + Low + Close) / 3` 做近似 VWAP。确保 `distance_to_vwap` 和 `reclaim_vwap` feature 不因数据缺失而失效。

### 增量更新
首次导入全量拉取。后续增量：查询 `market_bars` 中最新的 `ts`，只拉取该时间之后的数据。

### 文件
- `app/intel/ingestion/market_data.py`

## 4. Phase 2: 基础特征 + Scanner

### 目标
10 个特征 + 10 种 signal type。

### 特征
按 02 Phase 2 的列表。

### Scanner
按 02 Phase 4 的 10 种 signal type。输出统一 signal JSON。

### 文件
- `app/intel/features/scanner.py`

## 5. Phase 3: 事件 + Smart Money

### 目标
接入 SEC EDGAR + ARK trades + 新闻 API。手动录入 API。

### 文件
- `app/intel/ingestion/events_ingest.py`
- `app/intel/api/` 新增事件录入 endpoint

## 6. Phase 4: 上下文组装端点（核心）

### 目标
**Python 后端不调用 LLM。** 后端只负责检索和组装上下文，以结构化 JSON 返回。
CLI 中的 LLM 通过 tool call 调用 `POST /api/intel/context/build` 获取上下文，自己做推理。

### 端点: `POST /api/intel/context/build`

内部调用链:
- `select_context(settings, task_type=..., symbols=...)` → M5 上下文注入（budget: 5条/3000字符）
- `search_corpus(settings, query=..., symbol=..., limit=3)` → M2 赵哥语料
- DB 查询: market_bars, events, patterns, lessons

**关键**: select_context 和 search_corpus 放在 try/except 中——失败时返回空数组，LLM 仍能工作。

### 审计（移至 CLI 侧）

10 条禁止规则审计在 **CLI 的 TypeScript 侧**执行（`apps/trader-cli/src/llm/auditor.ts`），在 `saveHypothesis` tool 中调用。

规则调整：
- **blocker**（2条）: 绝对语言、13F 无延迟标注 → 阻止 DB 写入
- **warning**（8条）: 无反方证据 → 检查是否说明了推理过程（`reasoning_gap` 字段），不强制编造；其余同前

### 文件
- `app/intel/api/context.py`
- `apps/trader-cli/src/llm/auditor.ts`

## 7. Phase 5: 交易机会候选

### 目标
从 hypothesis 生成 trade_idea。trigger/invalidation conditions。

### 文件
- `app/intel/trade/ideas.py`

## 8. Phase 6: Prediction → Outcome → Lesson 闭环

### 目标
每个 hypothesis 的 prediction 到期后自动评估。生成 lesson。存入 lessons 表 + memory_items（M4）。

### 文件
- `app/intel/postmortem/evaluator.py`
- `app/intel/postmortem/lessons.py`

## 9. Phase 7: 盘前 + 收盘任务

### 目标
- 盘前：Pre-market Brief（市场状态 + 叙事 + 今日风险 + 观察标的）
- 收盘：Daily Postmortem（判断 vs 实际走势 + lesson 更新）

### 文件名
- `app/intel/jobs/premarket.py`
- `app/intel/jobs/intraday.py`
- `app/intel/jobs/close.py`

## 10. Phase 8: TypeScript CLI

### 目标
Terminal 交互——CLI + agent 对话。

### 技术栈
```
CLI:    Commander.js
LLM:    Vercel AI SDK (generateText / streamText) + tool use
Build:  tsx (no compile step)
API:    fetch → localhost:8000/api/intel/*
审计:   auditor.ts（TS 侧，在 saveHypothesis tool 中调用）
```

### 命令

```bash
trader scan                    # 跑一次扫描
trader analyze TSLA            # TSLA 深度分析
trader brief                   # 盘前简报
trader review                  # 收盘复盘
trader signals                 # 查看信号
trader hypotheses              # 查看假说
trader outcomes                # 查看预测结果
trader lessons                 # 查看经验
trader chat                    # agent 对话模式

# 记忆管理
trader memory search "财报"    # 搜索语料
trader memory extract "文本"   # 对话抽离 → 确认 → 存入
trader memory list             # 列出 active memory
trader memory context TSLA     # 查看 TSLA 相关记忆
```

### 文件
- `apps/trader-cli/` 全部

## 11. Phase 9: LLM 模型可配置

### 目标
用户可在 `.env` 或 CLI config 中切换 LLM provider。

```bash
# .env
LLM_PROVIDER=deepseek          # deepseek | openrouter | anthropic
LLM_MODEL=deepseek-chat        # deepseek-chat | claude-sonnet-4-6 | openai/gpt-4o
LLM_API_KEY=sk-xxx
LLM_BASE_URL=https://api.deepseek.com/v1
```

Vercel AI SDK 统一接口，切换 provider 不需要改业务代码。

---

## 开发顺序

```
P0: 项目初始化 + Schema
P1: 行情数据接入
P2: 特征 + Scanner
P3: 事件 + Smart Money
P4: LLM 推理层（核心）
P5: 交易机会候选
P6: Prediction → Outcome → Lesson
P7: 盘前 + 收盘任务
P8: TypeScript CLI
P9: LLM 模型可配置
```

---

## 与旧代码的关系

| 旧模块 | 处理 |
|---|---|
| M0-M6 (`modules/`) | **保留，只读引用**。intel/ 通过 import 使用 |
| Pipeline 16 modules | **保留，不 import**。标记 `# DEPRECATED` |
| `api/agent.py` | **不改**。新增路由在 `intel/api/` 下 |
| `trader-agent.db` | **不删**。新系统用 `market_intel.db` |
| Cockpit (`trader-cockpit/`) | **不删**。CLI 替代其功能 |

## 禁止

- 不修改 M0-M6 模块（可 import 但不可改）
- 不删除旧管线代码
- 不修改旧数据库 schema
- 不修改 Cockpit 前端

## 验收

按 02 §12 最小可交付版本：TSLL 回踩 → scanner 发现 → LLM 解释 → trade idea → 3D prediction → 验证 → lesson → 下次引用