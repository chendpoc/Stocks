# MVP 模块开发指导计划

## 1. MVP 目标

本 MVP 的目标不是构建完整机构级交易平台，而是先验证核心闭环：

```text
市场数据
→ 特征计算
→ 异常信号发现
→ LLM 解释与假说生成
→ 交易机会候选
→ 1D / 3D / 5D 复盘
→ 经验库更新
```

MVP 只服务单用户、本地或轻量服务器部署，优先支持少量关注标的：

```text
TSLA
TSLL
QQQ
SPY
ARKK
NVDA
COIN
BMNR
```

---

## 2. MVP 非目标

第一版不做：

- 自动下单；
- 多用户权限；
- 全量期权链；
- OPRA 实时期权流；
- Level 2 / tick 数据；
- dark pool 实时分析；
- 高频交易；
- 深度强化学习；
- 复杂组合优化；
- Bloomberg / Refinitiv 级数据接入；
- 全市场扫描。

---

## 3. 推荐技术栈

### 后端

```text
Python + FastAPI
```

### 数据库

```text
SQLite
```

### 历史大数据归档

```text
Parquet
```

### 离线分析

```text
DuckDB
```

### 特征计算

```text
pandas / polars
```

### 调度

MVP：

```text
APScheduler / cron
```

后续可升级：

```text
Prefect / Airflow / Temporal
```

### 前端

```text
Next.js / React / Tailwind / shadcn-ui
```

### LLM

- 一个强推理模型：用于 Market Brief、假说生成、反方审计、复盘；
- 一个低成本模型：用于新闻摘要、事件分类；
- embedding 可第二阶段加入，第一版可以先用 tags / keyword 检索。

---

## 4. 项目目录建议

```text
market-agent/
  README.md

  data/
    market_intel.db
    backups/
    parquet/
      bars/
      options/
      events/

  app/
    main.py

    api/
      routes_market.py
      routes_signals.py
      routes_hypotheses.py
      routes_trade_ideas.py
      routes_postmortem.py

    db/
      connection.py
      schema.sql
      migrations/

    repositories/
      market_repo.py
      event_repo.py
      signal_repo.py
      hypothesis_repo.py
      outcome_repo.py
      lesson_repo.py

    services/
      ingestion/
      features/
      scanners/
      llm/
      postmortem/
      alerts/

    jobs/
      ingest_daily_prices.py
      ingest_intraday_prices.py
      ingest_events.py
      run_premarket_brief.py
      run_intraday_scan.py
      run_close_postmortem.py
      run_prediction_evaluation.py

  frontend/
    app/
    components/
    pages/
```

---

# 5. MVP 数据库设计

MVP 优先使用 SQLite。第一版建议创建以下表：

```text
symbols
market_bars
events
smart_money_actions
patterns
signals
hypotheses
predictions
outcomes
lessons
trade_ideas
```

---

## 5.1 SQLite 初始化设置

应用启动时执行：

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
```

---

## 5.2 `symbols`

```sql
CREATE TABLE IF NOT EXISTS symbols (
  symbol TEXT PRIMARY KEY,
  name TEXT,
  asset_type TEXT,
  sector TEXT,
  benchmark_symbol TEXT,
  underlying_symbol TEXT,
  is_active INTEGER DEFAULT 1,
  notes TEXT
);
```

---

## 5.3 `market_bars`

```sql
CREATE TABLE IF NOT EXISTS market_bars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  ts TEXT NOT NULL,
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  volume REAL,
  vwap REAL,
  source TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(symbol, timeframe, ts)
);

CREATE INDEX IF NOT EXISTS idx_market_bars_symbol_tf_ts
ON market_bars(symbol, timeframe, ts);
```

---

## 5.4 `events`

```sql
CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  event_type TEXT,
  actor TEXT,
  title TEXT,
  raw_text TEXT,
  source TEXT,
  source_type TEXT,
  affected_symbols TEXT,
  confidence REAL DEFAULT 0.5,
  url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
```

---

## 5.5 `smart_money_actions`

```sql
CREATE TABLE IF NOT EXISTS smart_money_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,
  action_type TEXT NOT NULL,
  symbol TEXT NOT NULL,
  quantity REAL,
  value_estimate REAL,
  price_estimate REAL,
  source TEXT,
  delay_type TEXT,
  confidence REAL DEFAULT 0.5,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_smart_money_symbol_ts
ON smart_money_actions(symbol, ts);
```

---

## 5.6 `patterns`

```sql
CREATE TABLE IF NOT EXISTS patterns (
  pattern_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  typical_sequence TEXT,
  trigger_conditions TEXT,
  invalidation_conditions TEXT,
  affected_assets TEXT,
  reliability_score REAL DEFAULT 0.5,
  sample_size INTEGER DEFAULT 0,
  notes TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5.7 `signals`

```sql
CREATE TABLE IF NOT EXISTS signals (
  signal_id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  symbol TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  raw_description TEXT,
  severity REAL DEFAULT 0.5,
  feature_snapshot TEXT,
  status TEXT DEFAULT 'new',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_signals_symbol_ts
ON signals(symbol, ts);
```

---

## 5.8 `hypotheses`

```sql
CREATE TABLE IF NOT EXISTS hypotheses (
  hypothesis_id TEXT PRIMARY KEY,
  signal_id TEXT,
  ts TEXT NOT NULL,
  symbol TEXT NOT NULL,
  claim TEXT NOT NULL,
  professional_explanation TEXT,
  plain_language_explanation TEXT,
  evidence_for TEXT,
  evidence_against TEXT,
  missing_evidence TEXT,
  confidence REAL DEFAULT 0.5,
  tradability TEXT,
  invalidation_condition TEXT,
  created_by TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hypotheses_symbol_ts
ON hypotheses(symbol, ts);
```

---

## 5.9 `predictions`

```sql
CREATE TABLE IF NOT EXISTS predictions (
  prediction_id TEXT PRIMARY KEY,
  hypothesis_id TEXT NOT NULL,
  window TEXT NOT NULL,
  expected_outcome TEXT,
  invalid_if TEXT,
  due_at TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_predictions_due
ON predictions(status, due_at);
```

---

## 5.10 `outcomes`

```sql
CREATE TABLE IF NOT EXISTS outcomes (
  outcome_id TEXT PRIMARY KEY,
  prediction_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  return_pct REAL,
  relative_return_vs_benchmark REAL,
  max_favorable_excursion REAL,
  max_adverse_excursion REAL,
  invalidation_triggered INTEGER,
  verdict TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5.11 `lessons`

```sql
CREATE TABLE IF NOT EXISTS lessons (
  lesson_id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  symbol TEXT,
  symbols_json TEXT,          -- 2026-05-31: v2 扩展，多 symbol JSON 数组
  pattern_id TEXT,
  explanation_type TEXT,
  market_regime TEXT,
  lesson_text TEXT NOT NULL,
  summary TEXT,               -- 2026-05-31: v2 扩展，200 字摘要供 context injection
  rule_text TEXT,             -- 2026-05-31: v2 扩展，提炼后的规则文本
  tags_json TEXT,             -- 2026-05-31: v2 扩展，标签数组
  confidence REAL DEFAULT 0.5,-- 2026-05-31: v2 扩展，0-1
  source_type TEXT,           -- 2026-05-31: v2 扩展，seed/postmortem/manual
  when_to_apply TEXT,
  when_not_to_apply TEXT,
  weight_update TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lessons_symbol
ON lessons(symbol);
```

---

## 5.12 `trade_ideas`

```sql
CREATE TABLE IF NOT EXISTS trade_ideas (
  trade_idea_id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  symbol TEXT NOT NULL,
  direction TEXT,
  setup_type TEXT,
  status TEXT,
  thesis TEXT,
  trigger_conditions TEXT,
  invalidation_conditions TEXT,
  suggested_structure TEXT,
  risk_notes TEXT,
  confidence REAL DEFAULT 0.5,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trade_ideas_symbol_status
ON trade_ideas(symbol, status);
```

---

# 6. MVP 开发阶段

## Phase 0：项目初始化

### 目标

建立基础项目骨架、数据库和配置。

### Tasks

1. 创建 FastAPI 后端项目；
2. 创建 SQLite 数据库；
3. 写 `schema.sql`；
4. 实现数据库连接；
5. 实现基础 repository；
6. 初始化关注标的；
7. 增加基础日志；
8. 增加 `.env` 配置。

### 验收标准

- 服务可启动；
- SQLite 文件自动创建；
- 所有表可创建；
- 能插入并读取 `symbols`；
- 能通过 API 查询关注标的。

---

## Phase 1：行情数据接入

### 目标

接入 MVP 标的池的日线和分钟线行情。

### 数据范围

```text
TSLA
TSLL
QQQ
SPY
ARKK
NVDA
COIN
BMNR
```

### Tasks

1. 实现行情 API adapter；
2. 拉取日线 OHLCV；
3. 拉取 5m 分钟线；
4. 计算或保存 VWAP；
5. 写入 `market_bars`；
6. 支持重复导入去重；
7. 增加数据质量检查。

### 数据质量检查

- 是否缺 bar；
- 是否 volume 为 0；
- 是否价格异常；
- 是否 timestamp 重复；
- 是否 benchmark 缺失。

### 验收标准

- 能导入所有 MVP 标的最近 6 个月日线；
- 能导入所有 MVP 标的最近 30 天 5m 数据；
- `market_bars` 查询性能可接受；
- 同一数据重复导入不会重复写入。

---

## Phase 2：基础特征计算

### 目标

计算第一批结构性特征。

### MVP 特征

```text
relative_return_vs_QQQ
relative_return_vs_SPY
volume_vs_20d_avg
distance_to_vwap
higher_low_candidate
lower_high_candidate
pullback_to_support
break_previous_low
reclaim_vwap
trend_strength_simple
```

### Tasks

1. 实现特征计算服务；
2. 支持按 symbol + timeframe 计算；
3. 保存 feature snapshot 到 `signals.feature_snapshot` 或临时 feature 结果；
4. 先不单独建 `market_features` 表，MVP 可以通过 scanner 直接计算；
5. 后续如需要再拆出 `market_features`。

### 验收标准

- 能判断 TSLL 是否回踩；
- 能判断是否更高低点；
- 能判断相对 QQQ 强弱；
- 能判断是否站回 VWAP；
- 能输出结构化 feature snapshot。

---

## Phase 3：事件与 Smart Money 数据接入

### 目标

接入基础新闻事件和 Smart Money 行为。

### MVP 数据源

- 手动录入事件；
- SEC EDGAR 基础事件；
- ARK daily trades / holdings；
- 新闻 API；
- 用户手动录入 whop / 交易员观点。

### Tasks

1. 实现 `events` 写入接口；
2. 实现手动事件录入 API；
3. 实现 ARK 数据抓取或手动导入；
4. 实现基础新闻 ingest；
5. 实现事件分类：
   - policy；
   - fed；
   - geopolitical；
   - earnings；
   - smart_money；
   - technical；
   - user_note。

### 验收标准

- 能录入 Trump / Fed / 地缘 / ARK 事件；
- 能按 symbol 查询事件；
- 能按日期查询事件；
- Smart Money 行为能写入 `smart_money_actions`。

---

## Phase 4：信号扫描器

### 目标

系统主动发现异常信号。

### MVP 信号类型

1. 个股相对 QQQ / SPY 异常强弱；
2. 回踩支撑；
3. 更高低点候选；
4. 跌破前低；
5. 站回 VWAP；
6. 下跌缩量；
7. 放量反弹；
8. ARK 买入后价格未确认；
9. 新闻与价格背离；
10. 盘中剧本切换。

### Tasks

1. 实现 scanner registry；
2. 每个 scanner 输出统一 signal 对象；
3. 写入 `signals`；
4. 避免重复提醒；
5. 给 signal 设置 severity；
6. 保存 feature snapshot。

### Signal Object

```json
{
  "signal_id": "TSLL_2026_05_30_higher_low_candidate",
  "ts": "2026-05-30T10:30:00-04:00",
  "symbol": "TSLL",
  "signal_type": "higher_low_candidate",
  "raw_description": "TSLL 回踩低点高于前低，且成交量低于上次下跌",
  "severity": 0.7,
  "feature_snapshot": {}
}
```

### 验收标准

- 系统能自动发现 TSLL 更高低点候选；
- 能发现 TSLA 跑输 QQQ；
- 能发现 QQQ 站回 / 跌破 VWAP；
- signals 表每日能生成有效记录。

---

## Phase 5：LLM 输出合同与解释服务

### 目标

实现 LLM 对信号的标准化解释。

### LLM 输入

- signal；
- feature snapshot；
- 相关 market bars；
- benchmark 表现；
- 相关 events；
- 相关 smart_money_actions；
- 历史 lessons；
- pattern 说明。

### LLM 输出

必须符合以下结构：

```json
{
  "claim": "",
  "professional_explanation": "",
  "plain_language_explanation": "",
  "candidate_explanations": [],
  "evidence_for": [],
  "evidence_against": [],
  "missing_evidence": [],
  "confidence": 0.0,
  "tradability": "watchlist",
  "invalidation_condition": "",
  "predictions": [
    {
      "window": "3D",
      "expected_outcome": "",
      "invalid_if": ""
    }
  ]
}
```

### Tasks

1. 实现 prompt 模板；
2. 实现 LLM client；
3. 实现 JSON schema 校验；
4. 输出写入 `hypotheses`；
5. predictions 写入 `predictions`；
6. 失败时保留原始响应用于 debug；
7. 加入禁止规则检查。

### 禁止规则检查

- 不允许说“必涨 / 必跌”；
- 不允许把低置信对手盘写成事实；
- 不允许无反方解释；
- 不允许无失效条件；
- 不允许把 13F 用于日内解释。

### 验收标准

- 任意 signal 可生成 hypothesis；
- hypothesis 写入数据库；
- 有专业解释；
- 有通俗解释；
- 有反方解释；
- 有失效条件；
- 有 predictions。

---

## Phase 6：交易机会候选生成

### 目标

从 hypothesis 中生成 trade idea。

### Trade Idea 状态

```text
no_trade
watchlist
setup_forming
trade_candidate
invalidated
closed
```

### Tasks

1. 根据 hypothesis.tradability 创建 trade idea；
2. 生成 trigger conditions；
3. 生成 invalidation conditions；
4. 生成 suggested structure；
5. 生成 risk notes；
6. 写入 `trade_ideas`；
7. 支持人工标记状态。

### 示例

```markdown
方向：偏多观察  
标的：TSLL  
状态：setup_forming

触发条件：
- 回踩不破前低；
- 下跌量缩；
- TSLA 站回 VWAP；
- QQQ 不再破低；
- 反弹有量。

失效条件：
- TSLL 放量跌破前低；
- TSLA 正股破位；
- QQQ 转为 risk-off；
- VIX 上行。
```

### 验收标准

- hypothesis 可以生成 trade idea；
- trade idea 可在 API 查询；
- 支持状态更新；
- 每个 trade idea 必须有失效条件。

---

## Phase 7：1D / 3D / 5D 复盘验证

### 目标

系统自动验证历史假说是否成立。

### Tasks

1. 定时查询 due predictions；
2. 读取对应 symbol 的后续行情；
3. 计算：
   - return_pct；
   - relative_return_vs_benchmark；
   - max favorable excursion；
   - max adverse excursion；
   - invalidation_triggered；
4. 写入 `outcomes`；
5. 更新 prediction 状态；
6. 触发 LLM 生成 postmortem；
7. 写入 `lessons`。

### Verdict 规则

```text
supported
rejected
mixed
inconclusive
```

### 验收标准

- 1D / 3D / 5D 到期后能自动评估；
- outcomes 表有结果；
- rejected / supported 能生成 lesson；
- lesson 能在后续 LLM prompt 中被引用。

---

## Phase 8：Web Dashboard MVP

### 目标

提供基础交互工作台。

### 页面 1：Market Overview

显示：

- 今日市场状态；
- 主导叙事；
- 重点标的；
- 今日风险；
- 今日禁止动作。

### 页面 2：Signal Feed

显示：

- 信号时间；
- 标的；
- signal type；
- raw description；
- severity；
- 是否已解释。

### 页面 3：Narrative Cards

显示：

- 专业解释；
- 通俗解释；
- 支持证据；
- 反方证据；
- 缺失证据；
- 置信度；
- tradability；
- 失效条件。

### 页面 4：Opportunity Board

显示：

- trade ideas；
- status；
- trigger conditions；
- invalidation conditions；
- risk notes。

### 页面 5：Postmortem Journal

显示：

- predictions；
- outcomes；
- verdict；
- lessons。

### 验收标准

- 用户可以看到每日信号；
- 用户可以点击查看 LLM 解释；
- 用户可以看到 trade ideas；
- 用户可以看到复盘和 lessons；
- 用户可以手动更新 trade idea 状态。

---

## Phase 9：盘前 / 收盘任务

### 盘前任务

生成 Pre-market Brief。

输入：

- overnight 行情；
- 相关新闻；
- 重要事件日历；
- 昨日 lessons；
- 当前 watchlist；
- futures / VIX / QQQ / SPY 状态。

输出：

```markdown
# Pre-market Brief

## 当前市场状态
## 主导叙事
## 今日可能剧本
## 重点观察标的
## 今日禁止动作
## 关键验证点
```

### 收盘任务

生成 Daily Postmortem。

输入：

- 今日 signals；
- hypotheses；
- trade ideas；
- market bars；
- 用户交易记录，可选；
- outcomes，可选。

输出：

```markdown
# Daily Postmortem

## 今日原始判断
## 今日实际走势
## 成立的假说
## 失败的假说
## 执行偏差
## 经验更新
```

### 验收标准

- 每天盘前能生成 brief；
- 每天收盘后能生成 postmortem；
- 结果可以在 Dashboard 查看；
- brief 和 postmortem 可以保存到 events 或 lessons。

---

# 7. MVP 日常运行任务表

## 盘前

```text
1. 拉取 overnight 数据
2. 拉取最新新闻 / 事件
3. 更新 ARK / Smart Money 数据
4. 计算盘前 market regime
5. 生成 Pre-market Brief
```

## 开盘后 30–60 分钟

```text
1. 拉取盘中行情
2. 计算 VWAP / 相对强弱 / volume
3. 判断日内盘面剧本
4. 生成结构信号
5. 对重要信号调用 LLM
```

## 盘中

```text
1. 每 5–15 分钟扫描 watchlist
2. 发现异常 signal
3. 触发 LLM 解释
4. 更新 trade ideas
5. 触发提醒
```

## 收盘后

```text
1. 拉取完整日线和盘中数据
2. 更新 signals 状态
3. 生成 Daily Postmortem
4. 更新 due predictions
5. 写入 lessons
```

## 周末

```text
1. 汇总本周所有 hypotheses
2. 统计 supported / rejected
3. 更新 patterns reliability
4. 生成 Weekly Pattern Review
```

---

# 8. MVP 验收标准

## 功能验收

1. 能导入行情；
2. 能导入事件；
3. 能自动生成 signals；
4. 能调用 LLM 生成 hypotheses；
5. 能生成 trade ideas；
6. 能自动创建 predictions；
7. 能在 1D / 3D / 5D 后生成 outcomes；
8. 能生成 lessons；
9. 能通过 Web Dashboard 查看完整链路。

## 质量验收

1. LLM 输出不允许无反方解释；
2. LLM 输出必须有失效条件；
3. LLM 输出必须区分事实和推断；
4. 任何 trade idea 必须有 invalidation；
5. 系统不得把低置信叙事写成事实；
6. 13F 等延迟数据不得用于日内直接解释；
7. 所有 signals / hypotheses / predictions / outcomes 都有时间戳；
8. 数据源有 source 字段。

## 使用验收

用户每天能够回答：

```text
今天市场在交易什么？
今天可能是什么盘面剧本？
哪些标的有异常？
哪些机会只是观察？
哪些机会进入 setup forming？
哪些交易不能做？
昨天的判断对了吗？
系统从昨天学到了什么？
```

---

# 9. 开发顺序建议

建议按以下顺序推进：

```text
Phase 0：项目初始化
Phase 1：行情数据接入
Phase 2：基础特征计算
Phase 3：事件与 Smart Money 数据接入
Phase 4：信号扫描器
Phase 5：LLM 解释服务
Phase 6：交易机会候选生成
Phase 7：复盘验证
Phase 8：Web Dashboard
Phase 9：盘前 / 收盘任务
```

不要一开始做复杂 UI。  
先跑通后端闭环：

```text
行情 → 信号 → LLM 假说 → prediction → outcome → lesson
```

这是 MVP 的生命线。

---

# 10. 第一批开发任务拆解

## Task 1：创建项目与 SQLite schema

目标：

- 项目可运行；
- DB 可创建；
- 所有核心表存在。

验收：

- `market_intel.db` 生成；
- `symbols` 可插入 TSLA / TSLL / QQQ / SPY；
- API 可查询 symbols。

---

## Task 2：行情数据导入

目标：

- 导入日线和 5m 数据。

验收：

- `market_bars` 有 TSLA / TSLL / QQQ / SPY 最近数据；
- 重复导入不产生重复记录。

---

## Task 3：基础 scanner

目标：

实现：

- relative weakness；
- reclaim VWAP；
- break previous low；
- higher low candidate；
- volume contraction pullback。

验收：

- 能为 TSLL 生成至少一种 technical signal；
- signal 写入 `signals`。

---

## Task 4：LLM 解释服务

目标：

- 对 signal 生成 hypothesis。

验收：

- hypothesis 写入数据库；
- 有专业解释；
- 有通俗解释；
- 有反方解释；
- 有失效条件；
- 有 predictions。

---

## Task 5：Prediction evaluator

目标：

- 自动评估 1D / 3D / 5D 预测。

验收：

- 到期 prediction 生成 outcome；
- verdict 正确写入；
- 能生成 lesson。

---

## Task 6：Web Dashboard 初版

目标：

- 查看 signals；
- 查看 hypotheses；
- 查看 trade ideas；
- 查看 outcomes / lessons。

验收：

- 用户可以从前端看到完整链路。

---

# 11. 风险与注意事项

## 11.1 数据延迟

必须标注：

```text
real_time
delayed
daily
quarterly
manual
```

尤其：

- 13F 是季度延迟；
- ARK 是日频；
- 新闻有发布时间；
- 行情可能有 15 分钟延迟。

## 11.2 LLM 幻觉

必须通过输出合同限制：

- 事实必须来自输入；
- 推断必须标注；
- 低置信不能写成事实；
- 通俗说法不能替代证据；
- 必须有反方解释。

## 11.3 叙事过拟合

复盘必须记录：

- 哪些叙事成立；
- 哪些叙事只是事后解释；
- 哪些规律样本太少；
- 哪些模式已经拥挤。

## 11.4 交易风险

系统输出不是投资建议。  
任何交易候选必须经过用户确认。  
MVP 阶段不自动下单。

---

# 12. 最小可交付版本定义

最小可交付版本应包含：

1. SQLite 数据库；
2. 行情导入；
3. signals scanner；
4. LLM hypothesis generator；
5. trade idea generator；
6. prediction / outcome / lesson 闭环；
7. Dashboard 初版；
8. 每日盘前 brief；
9. 每日收盘 postmortem。

完成后，系统应能跑通一个完整案例：

```text
TSLL 回踩
→ scanner 发现更高低点候选
→ LLM 解释为吸筹结构候选
→ 生成 watchlist trade idea
→ 创建 3D prediction
→ 3D 后验证结果
→ 生成 lesson
→ 下次类似情况引用该 lesson
```

---

# 13. 最终判断

MVP 的核心不是数据多，也不是 UI 精美，而是：

```text
能不能稳定把每一个市场判断变成可验证假说，并在后续自动复盘。
```

只要这个闭环跑通，系统就具备继续扩展的基础。后续再逐步增加：

- 更好的期权数据；
- 更稳定新闻源；
- Smart Money 数据；
- 实时告警；
- 更复杂回测；
- broker API；
- 组合风控。
