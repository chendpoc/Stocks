# 04. Database Schema

## 1. 文档目的

本文档定义 `Permanent Memory Market Agent` MVP 阶段需要的数据库表结构。

> **⚠️ 关键约束**: 不重复建表。已有表直接复用或扩展列。
> 详见下方 [§3 表清单与映射](#3-表清单与映射)。

已有表（`model_decisions`, `decision_outcomes`, `insight_candidate_outcomes`,
`insight_candidates`, `market_bars`）直接复用，不重复建表。

MVP 默认使用 SQLite。
后续如果历史行情数据规模变大，可将 raw bars / feature data 迁移至 Parquet / DuckDB，SQLite 继续保存索引、决策、结果、规律、失败记忆和上下文包。

本文档用于指导开发 Agent 完成：

```text
1. 数据库 migration
2. Memory Repository
3. 最小数据模型
4. 索引设计
5. 基础测试
```

---

## 2. 数据库设计原则

### 2.1 结构化优先

金融系统不应只保存自然语言总结。

所有关键对象必须结构化保存：

```text
market_snapshot
feature_snapshot
setup_event
decision_memory
outcome_memory
insight_candidate
pattern_memory
failure_memory
session_context_pack
```

自然语言总结只能作为补充字段，不能替代结构化字段。

---

### 2.2 JSON 字段用于扩展，不替代核心字段

核心查询字段必须独立列出。

例如：

```text
symbol
timestamp
timeframe
setup_name
status
confidence
```

复杂结构再放入 JSON 字段：

```text
evidence_json
contra_json
risk_json
conditions_json
invalidations_json
performance_json
```

---

### 2.3 所有记忆必须可追溯

每条长期规律必须尽量能追溯到：

```text
decision_memories
outcome_memories
insight_candidates
backtest_result_json
failure_memories
```

MVP 允许弱关联，但必须保留：

```text
source_insight_id
source_memory_ids_json
evidence_json
```

---

### 2.4 时间统一格式

所有时间字段使用 ISO 8601 字符串：

```text
2026-06-10T09:45:00-04:00
```

禁止在数据库内混用：

```text
本地时间
UTC
交易所时间
无时区 timestamp
```

如果当前项目已有统一时间工具，必须复用现有时间工具。

---

### 2.5 Migration 必须可重复运行

所有 migration 必须满足：

```text
1. CREATE TABLE IF NOT EXISTS
2. CREATE INDEX IF NOT EXISTS
3. 不删除现有表
4. 不破坏已有 workflow recording
5. 多次运行不报错
```

---

## 3. 表清单与映射

| Market Agent 表 | 处理方式 | 说明 |
|---|---|---|
| `market_snapshots` | **复用** `market_bars` | 扩展 `source` / `quality_status` 列即可 |
| `feature_snapshots` | ★ **新增** | — |
| `setup_events` | ★ **新增** | — |
| `decision_memories` | **复用** `model_decisions` | 需要时扩展字段 |
| `outcome_memories` | **复用** `decision_outcomes` + `insight_candidate_outcomes` | 双表覆盖两种源 |
| `insight_candidates` | **复用** `insight_candidates` | 已存在，字段兼容 |
| `pattern_memories` | ★ **新增**（替代静态 `patterns`） | 状态机: candidate→active→degraded→retired |
| `failure_memories` | ★ **新增** | — |
| `session_context_packs` | ★ **新增** | — |

**实际需要新增的表：5 张**（★ 标记）。以下各节只展开新增表的 SQL。
已有表（`market_bars`, `model_decisions`, `decision_outcomes`,
`insight_candidate_outcomes`, `insight_candidates`）的定义见
`apps/trader-agent/backend/app/intel/db/schema.py`。

---

## 3a. 新增表：`feature_snapshots`

表之间的核心关系：

```text
market_snapshots
  ↓
feature_snapshots
  ↓
setup_events
  ↓
decision_memories
  ↓
outcome_memories
  ↓
insight_candidates
  ↓
pattern_memories

failure_memories 可以由任意阶段生成
session_context_packs 从 pattern_memories / failure_memories / decision_memories 聚合生成
```

---

## 4. ⚠️ 复用: `market_bars`（勿新建 `market_snapshots`）

## 4.1 用途

保存标准化后的行情快照或 OHLCV bar。

该表属于事实层，用于支持：

```text
1. 历史行情回放
2. 特征重算
3. 数据质量排查
4. setup 检测追溯
5. 后续 outcome 计算
```

---

## 4.2 SQL

```sql
CREATE TABLE IF NOT EXISTS market_snapshots (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  source TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  volume REAL,
  session TEXT,
  quality_status TEXT,
  raw_json TEXT,
  created_at TEXT NOT NULL
);
```

---

## 4.3 字段说明

| 字段               | 说明                                   |
| ---------------- | ------------------------------------ |
| `id`             | 快照 ID                                |
| `symbol`         | 标的，例如 TSLA                           |
| `timestamp`      | bar 时间，ISO 8601                      |
| `source`         | longbridge / alphavantage / yfinance |
| `timeframe`      | 1m / 5m / 1d                         |
| `open`           | 开盘价                                  |
| `high`           | 最高价                                  |
| `low`            | 最低价                                  |
| `close`          | 收盘价                                  |
| `volume`         | 成交量                                  |
| `session`        | premarket / regular / afterhours     |
| `quality_status` | pass / warning / failed / blocked    |
| `raw_json`       | 原始响应或扩展字段                            |
| `created_at`     | 写入时间                                 |

---

## 4.4 索引

```sql
CREATE INDEX IF NOT EXISTS idx_market_snapshots_symbol_time
ON market_snapshots(symbol, timestamp);

CREATE INDEX IF NOT EXISTS idx_market_snapshots_symbol_timeframe
ON market_snapshots(symbol, timeframe);

CREATE INDEX IF NOT EXISTS idx_market_snapshots_source
ON market_snapshots(source);

CREATE INDEX IF NOT EXISTS idx_market_snapshots_quality
ON market_snapshots(quality_status);
```

---

## 4.5 写入规则

允许写入：

```text
quality_status = pass
quality_status = warning
quality_status = failed
quality_status = blocked
```

原因：

```text
failed / blocked 数据虽然不能用于 setup 判断，但应保存用于排查数据源问题。
```

---

## 5. ★ 新增: `feature_snapshots`

## 5.1 用途

保存行情特征计算结果。

该表用于支持：

```text
1. setup detection
2. evidence graph
3. 相似案例检索
4. outcome 统计
5. pattern memory 证据积累
```

---

## 5.2 SQL

```sql
CREATE TABLE IF NOT EXISTS feature_snapshots (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  vwap REAL,
  ema_9 REAL,
  ema_20 REAL,
  ema_50 REAL,
  atr REAL,
  volume_ratio REAL,
  gap_pct REAL,
  relative_strength_spy REAL,
  relative_strength_qqq REAL,
  distance_to_vwap REAL,
  price_above_vwap INTEGER,
  features_json TEXT NOT NULL,
  market_snapshot_ids_json TEXT,
  created_at TEXT NOT NULL
);
```

---

## 5.3 字段说明

| 字段                         | 说明                          |
| -------------------------- | --------------------------- |
| `vwap`                     | VWAP                        |
| `ema_9`                    | EMA 9                       |
| `ema_20`                   | EMA 20                      |
| `ema_50`                   | EMA 50                      |
| `atr`                      | Average True Range          |
| `volume_ratio`             | 当前成交量相对均量                   |
| `gap_pct`                  | 跳空幅度                        |
| `relative_strength_spy`    | 相对 SPY 强弱                   |
| `relative_strength_qqq`    | 相对 QQQ 强弱                   |
| `distance_to_vwap`         | 当前价格距离 VWAP                 |
| `price_above_vwap`         | 1 = above, 0 = below        |
| `features_json`            | 其他扩展特征                      |
| `market_snapshot_ids_json` | 参与计算的 market_snapshot id 列表 |

---

## 5.4 索引

```sql
CREATE INDEX IF NOT EXISTS idx_feature_snapshots_symbol_time
ON feature_snapshots(symbol, timestamp);

CREATE INDEX IF NOT EXISTS idx_feature_snapshots_symbol_timeframe
ON feature_snapshots(symbol, timeframe);

CREATE INDEX IF NOT EXISTS idx_feature_snapshots_vwap
ON feature_snapshots(price_above_vwap);
```

---

## 5.5 写入规则

只有当输入数据质量为以下状态时，才允许写入常规 feature snapshot：

```text
quality_status = pass
quality_status = warning
```

如果数据质量为：

```text
failed
blocked
```

则不应生成高置信特征。
如需保存异常特征，必须在 `features_json` 中明确标记：

```json
{
  "quality_override": true,
  "reason": "debug_only"
}
```

---

## 6. ★ 新增: `setup_events`

## 6.1 用途

保存 setup 检测事件。

一个 setup event 表示系统在某个时间点检测到某个 setup 的状态：

```text
not_present
forming
confirmed
blocked
invalidated
```

---

## 6.2 SQL

```sql
CREATE TABLE IF NOT EXISTS setup_events (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  setup_name TEXT NOT NULL,
  setup_status TEXT NOT NULL,
  confidence REAL,
  evidence_json TEXT,
  contra_json TEXT,
  invalidation_json TEXT,
  feature_snapshot_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(feature_snapshot_id) REFERENCES feature_snapshots(id)
);
```

---

## 6.3 `setup_name` 枚举

```text
VWAP_RECLAIM
RELATIVE_STRENGTH_PULLBACK
OPENING_RANGE_BREAKOUT
```

后续可扩展：

```text
GAP_HOLD
GAP_FADE
DAILY_BREAKOUT_RETEST
FAILED_BREAKOUT
PANIC_RECOVERY
EARNINGS_GAP_FOLLOW_THROUGH
```

---

## 6.4 `setup_status` 枚举

```text
not_present
forming
confirmed
blocked
invalidated
```

---

## 6.5 索引

```sql
CREATE INDEX IF NOT EXISTS idx_setup_events_symbol_time
ON setup_events(symbol, timestamp);

CREATE INDEX IF NOT EXISTS idx_setup_events_setup_name
ON setup_events(setup_name);

CREATE INDEX IF NOT EXISTS idx_setup_events_status
ON setup_events(setup_status);

CREATE INDEX IF NOT EXISTS idx_setup_events_feature_snapshot
ON setup_events(feature_snapshot_id);
```

---

## 6.6 写入规则

必须写入：

```text
forming
confirmed
blocked
invalidated
```

`not_present` 是否写入由实现决定。

建议：

```text
MVP 不写入每个 not_present，以免数据膨胀。
仅当需要完整审计或回测时再开启 not_present 写入。
```

---

## 7. ⚠️ 复用: `model_decisions`（勿新建 `decision_memories`）

## 7.1 用途

保存 Agent 每次输出的结构化判断。

这是系统的核心记忆表之一。

每个 `DecisionEnvelope` 都必须写入本表。

---

## 7.2 SQL

```sql
CREATE TABLE IF NOT EXISTS decision_memories (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  timeframe TEXT,
  market_state TEXT,
  setup_name TEXT,
  action TEXT,
  confidence REAL,
  evidence_json TEXT,
  contra_json TEXT,
  risk_json TEXT,
  decision_envelope_json TEXT NOT NULL,
  setup_event_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(setup_event_id) REFERENCES setup_events(id)
);
```

---

## 7.3 `action` 枚举

```text
ignore
watch
alert
paper_trade_candidate
blocked
invalidated
review
```

MVP 不使用：

```text
buy
sell
short
live_order
```

---

## 7.4 索引

```sql
CREATE INDEX IF NOT EXISTS idx_decision_memories_symbol_time
ON decision_memories(symbol, timestamp);

CREATE INDEX IF NOT EXISTS idx_decision_memories_setup
ON decision_memories(setup_name);

CREATE INDEX IF NOT EXISTS idx_decision_memories_action
ON decision_memories(action);

CREATE INDEX IF NOT EXISTS idx_decision_memories_setup_event
ON decision_memories(setup_event_id);
```

---

## 7.5 写入规则

以下 action 都必须写入：

```text
watch
alert
paper_trade_candidate
blocked
invalidated
review
ignore
```

原因：

```text
blocked 可以用于评估风控是否正确。
ignore 可以用于评估 missed opportunity。
invalidated 可以用于失败记忆。
review 可以用于人工复盘。
```

---

## 8. ⚠️ 复用: `decision_outcomes` + `insight_candidate_outcomes`（勿新建 `outcome_memories`）

## 8.1 用途

保存某个 `DecisionEnvelope` 后续实际结果。

用于回答：

```text
当时这个判断之后，市场实际怎么走？
```

---

## 8.2 SQL

```sql
CREATE TABLE IF NOT EXISTS outcome_memories (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  outcome_window TEXT NOT NULL,
  hit_entry INTEGER,
  hit_invalidation INTEGER,
  mfe REAL,
  mae REAL,
  final_return REAL,
  time_to_mfe_seconds INTEGER,
  time_to_invalidation_seconds INTEGER,
  outcome_label TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(decision_id) REFERENCES decision_memories(id)
);
```

---

## 8.3 `outcome_window` 枚举

```text
30m
2h
1d
```

---

## 8.4 `outcome_label` 枚举

```text
good_watch_signal
late_signal
false_positive
invalidated_quickly
blocked_correctly
missed_opportunity
data_quality_invalid
unknown
```

---

## 8.5 索引

```sql
CREATE INDEX IF NOT EXISTS idx_outcome_memories_decision_id
ON outcome_memories(decision_id);

CREATE INDEX IF NOT EXISTS idx_outcome_memories_window
ON outcome_memories(outcome_window);

CREATE INDEX IF NOT EXISTS idx_outcome_memories_label
ON outcome_memories(outcome_label);
```

---

## 8.6 写入规则

OutcomeGraph 负责写入本表。

MVP 至少支持：

```text
2h outcome_window
```

推荐同时支持：

```text
30m
2h
1d
```

---

## 9. ⚠️ 复用: `insight_candidates`（已存在，勿重建）

## 9.1 用途

保存系统从 outcome 统计、复盘、失败教训中生成的规律候选。

注意：

```text
insight_candidate 不是 active pattern。
必须经过验证和确认后才能进入 pattern_memories。
```

---

## 9.2 SQL

```sql
CREATE TABLE IF NOT EXISTS insight_candidates (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  scope_json TEXT,
  evidence_json TEXT,
  backtest_result_json TEXT,
  status TEXT NOT NULL,
  promoted_pattern_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

---

## 9.3 `source` 枚举

```text
evaluation_graph
insight_exploration_graph
failure_memory
manual
```

---

## 9.4 `status` 枚举

```text
new
testing
rejected
promoted
archived
```

---

## 9.5 索引

```sql
CREATE INDEX IF NOT EXISTS idx_insight_candidates_status
ON insight_candidates(status);

CREATE INDEX IF NOT EXISTS idx_insight_candidates_source
ON insight_candidates(source);

CREATE INDEX IF NOT EXISTS idx_insight_candidates_promoted_pattern
ON insight_candidates(promoted_pattern_id);
```

---

## 9.6 写入规则

生成 insight candidate 时必须包含：

```text
hypothesis
scope_json
evidence_json
status = new
```

如果 evidence 不足，应写入：

```text
status = new
```

不能直接晋升为 active pattern。

---

## 10. ★ 新增: `pattern_memories`（替代静态 `patterns` 表）

## 10.1 用途

保存长期规律记忆。

PatternMemory 是系统长期学习结果的核心表。

---

## 10.2 SQL

```sql
CREATE TABLE IF NOT EXISTS pattern_memories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  claim TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  conditions_json TEXT NOT NULL,
  invalidations_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  performance_json TEXT,
  confidence TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL,
  source_insight_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_reviewed_at TEXT,
  FOREIGN KEY(source_insight_id) REFERENCES insight_candidates(id)
);
```

---

## 10.3 `status` 枚举

```text
candidate
testing
active
degraded
invalidated
archived
```

---

## 10.4 `confidence` 枚举

```text
low
low_medium
medium
medium_high
high
```

---

## 10.5 索引

```sql
CREATE INDEX IF NOT EXISTS idx_pattern_memories_status
ON pattern_memories(status);

CREATE INDEX IF NOT EXISTS idx_pattern_memories_confidence
ON pattern_memories(confidence);

CREATE INDEX IF NOT EXISTS idx_pattern_memories_source_insight
ON pattern_memories(source_insight_id);
```

---

## 10.6 写入规则

写入 pattern memory 时必须包含：

```text
name
claim
scope_json
conditions_json
invalidations_json
evidence_json
confidence
status
version
```

MVP 阶段，晋升为：

```text
status = active
```

必须经过用户确认。

---

## 10.7 Pattern 示例

```json
{
  "name": "TSLA VWAP Reclaim in Risk-On Session",
  "claim": "When TSLA reclaims VWAP within the first 90 minutes while QQQ is above VWAP and 5m volume_ratio exceeds 1.5, continuation probability improves over baseline.",
  "scope_json": {
    "symbols": ["TSLA"],
    "timeframe": "5m",
    "market_regime": ["risk_on", "index_confirmed"],
    "session": "regular"
  },
  "conditions_json": [
    "price_crosses_above_vwap",
    "volume_ratio_5m > 1.5",
    "qqq_above_vwap"
  ],
  "invalidations_json": [
    "two_5m_closes_below_vwap",
    "qqq_breaks_intraday_low"
  ],
  "evidence_json": {
    "sample_size": 84,
    "win_rate": 0.61,
    "median_mfe": 0.018,
    "median_mae": -0.007
  },
  "confidence": "medium",
  "status": "active",
  "version": 3
}
```

---

## 11. ★ 新增: `failure_memories`

## 11.1 用途

保存失败教训和风险提醒。

FailureMemory 必须进入 context pack 的 Active Warnings 区域，除非状态已经 resolved 或 archived。

---

## 11.2 SQL

```sql
CREATE TABLE IF NOT EXISTS failure_memories (
  id TEXT PRIMARY KEY,
  failure_type TEXT NOT NULL,
  symbol TEXT,
  setup_name TEXT,
  root_cause TEXT NOT NULL,
  lesson TEXT NOT NULL,
  affected_patterns_json TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

---

## 11.3 `failure_type` 枚举

```text
false_breakout
late_entry
weak_market_confirmation
data_quality_failure
source_conflict
llm_explanation_error
risk_gate_missed
pattern_degraded
overfit_pattern
macro_event_ignored
```

---

## 11.4 `status` 枚举

```text
active_warning
resolved
archived
```

---

## 11.5 索引

```sql
CREATE INDEX IF NOT EXISTS idx_failure_memories_symbol
ON failure_memories(symbol);

CREATE INDEX IF NOT EXISTS idx_failure_memories_setup
ON failure_memories(setup_name);

CREATE INDEX IF NOT EXISTS idx_failure_memories_status
ON failure_memories(status);

CREATE INDEX IF NOT EXISTS idx_failure_memories_type
ON failure_memories(failure_type);
```

---

## 11.6 写入规则

以下情况必须写入：

```text
data_quality_failure
source_conflict
llm_explanation_error
risk_gate_missed
setup_invalidated_quickly
pattern_degraded
false_positive
```

写入时必须包含：

```text
failure_type
root_cause
lesson
status
```

---

## 12. ★ 新增: `session_context_packs`

## 12.1 用途

保存每次 CLI 启动生成的 context pack。

输出文件路径：

```text
.runtime/context/context_pack.md
```

数据库保留历史版本，便于追踪某次会话加载了哪些记忆。

---

## 12.2 SQL

```sql
CREATE TABLE IF NOT EXISTS session_context_packs (
  id TEXT PRIMARY KEY,
  profile TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  context_markdown TEXT NOT NULL,
  source_memory_ids_json TEXT NOT NULL
);
```

---

## 12.3 字段说明

| 字段                       | 说明                             |
| ------------------------ | ------------------------------ |
| `id`                     | context pack id                |
| `profile`                | default / paper / research 等配置 |
| `generated_at`           | 生成时间                           |
| `context_markdown`       | 完整 context_pack.md 内容          |
| `source_memory_ids_json` | 本次上下文引用了哪些 memory              |

---

## 12.4 索引

```sql
CREATE INDEX IF NOT EXISTS idx_session_context_packs_profile_time
ON session_context_packs(profile, generated_at);
```

---

## 12.5 写入规则

每次运行：

```bash
trader memory bootstrap --profile default
```

都应该：

```text
1. 生成 .runtime/context/context_pack.md
2. 写入 session_context_packs
3. 保存 source_memory_ids_json
```

---

## 12a. ★ 新增: `pattern_status_events`（Pattern 事件溯源）

## 12a.1 用途

记录 pattern 每次状态变更的完整历史。支持审计查询和回溯。
每次 `pattern_memories` 状态变更（candidate→active, active→degraded 等）
必须同步写入一条事件记录。

## 12a.2 SQL

```sql
CREATE TABLE IF NOT EXISTS pattern_status_events (
  id TEXT PRIMARY KEY,
  pattern_id TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  reason TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  source_report_id TEXT,
  evidence_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(pattern_id) REFERENCES pattern_memories(id)
);

CREATE INDEX IF NOT EXISTS idx_pattern_events_pattern
  ON pattern_status_events(pattern_id, created_at);
```

## 12a.3 `triggered_by` 枚举

```text
evaluation_graph
outcome_graph
manual_review
```

---

## 12b. ★ 新增: `daemon_heartbeat`（守护进程心跳）

## 12b.1 用途

MarketAgent 守护进程架构中，Master 通过此表监控 Worker 存活。
Worker 每 5 秒写入最新心跳。Master 每 30 秒检查：
`last_beat < now - 30s` → 判定失联 → kill + respawn。

## 12b.2 SQL

```sql
CREATE TABLE IF NOT EXISTS daemon_heartbeat (
  worker_id TEXT PRIMARY KEY,
  last_beat TEXT NOT NULL,
  current_tick TEXT,
  status TEXT NOT NULL DEFAULT 'alive'
);
```

---

## 13. 推荐 Repository 接口

## 13.1 `DecisionMemoryRepository`

```python
class DecisionMemoryRepository:
    def create(self, decision: DecisionMemoryCreate) -> DecisionMemory:
        ...

    def get(self, decision_id: str) -> DecisionMemory | None:
        ...

    def list_by_symbol(self, symbol: str, limit: int = 20) -> list[DecisionMemory]:
        ...

    def list_unlabeled(self, outcome_window: str, limit: int = 100) -> list[DecisionMemory]:
        ...
```

---

## 13.2 `OutcomeMemoryRepository`

```python
class OutcomeMemoryRepository:
    def create(self, outcome: OutcomeMemoryCreate) -> OutcomeMemory:
        ...

    def get_by_decision(self, decision_id: str) -> list[OutcomeMemory]:
        ...

    def list_by_label(self, label: str, limit: int = 100) -> list[OutcomeMemory]:
        ...
```

---

## 13.3 `InsightCandidateRepository`

```python
class InsightCandidateRepository:
    def create(self, candidate: InsightCandidateCreate) -> InsightCandidate:
        ...

    def get(self, candidate_id: str) -> InsightCandidate | None:
        ...

    def list_by_status(self, status: str, limit: int = 100) -> list[InsightCandidate]:
        ...

    def mark_promoted(self, candidate_id: str, pattern_id: str) -> InsightCandidate:
        ...
```

---

## 13.4 `PatternMemoryRepository`

```python
class PatternMemoryRepository:
    def create(self, pattern: PatternMemoryCreate) -> PatternMemory:
        ...

    def get(self, pattern_id: str) -> PatternMemory | None:
        ...

    def list_active(self, symbols: list[str] | None = None) -> list[PatternMemory]:
        ...

    def list_degraded(self, symbols: list[str] | None = None) -> list[PatternMemory]:
        ...

    def update_status(
        self,
        pattern_id: str,
        status: str,
        reason: str | None = None,
    ) -> PatternMemory:
        ...
```

---

## 13.5 `FailureMemoryRepository`

```python
class FailureMemoryRepository:
    def create(self, failure: FailureMemoryCreate) -> FailureMemory:
        ...

    def list_active_warnings(self, symbols: list[str] | None = None) -> list[FailureMemory]:
        ...

    def resolve(self, failure_id: str) -> FailureMemory:
        ...

    def archive(self, failure_id: str) -> FailureMemory:
        ...
```

---

## 13.6 `SessionContextPackRepository`

```python
class SessionContextPackRepository:
    def create(self, pack: SessionContextPackCreate) -> SessionContextPack:
        ...

    def get_latest(self, profile: str = "default") -> SessionContextPack | None:
        ...
```

---

## 14. Migration 要求

开发 Agent 应实现一个可重复运行的 migration。

要求：

```text
1. 所有 CREATE TABLE 使用 IF NOT EXISTS。
2. 所有 CREATE INDEX 使用 IF NOT EXISTS。
3. migration 可多次运行不报错。
4. 不破坏现有 workflow recording。
5. 不删除现有表。
6. 不修改已有表结构，除非另有明确任务卡。
```

---

## 15. 测试要求

### 15.1 必须测试

```text
1. 所有表可创建。
2. 所有 repository 可 create。
3. 所有 repository 可 get。
4. 所有 repository 可 list。
5. pattern status 可更新。
6. failure status 可更新。
7. session_context_pack 可保存和读取 latest。
8. foreign key 不破坏基础写入链路。
9. migration 可重复运行。
```

---

### 15.2 推荐测试文件

```text
tests/market_agent/test_memory_schema.py
tests/market_agent/test_decision_memory_repository.py
tests/market_agent/test_outcome_memory_repository.py
tests/market_agent/test_insight_candidate_repository.py
tests/market_agent/test_pattern_memory_repository.py
tests/market_agent/test_failure_memory_repository.py
tests/market_agent/test_session_context_pack_repository.py
```

---

## 16. Task 001：Memory Schema & Repository

### 16.1 目标

实现永久记忆系统的数据库表和基础 repository。

---

### 16.2 范围

必须实现：

```text
market_snapshots
feature_snapshots
setup_events
decision_memories
outcome_memories
insight_candidates
pattern_memories
failure_memories
session_context_packs
```

---

### 16.3 不做

本任务不做：

```text
1. 不接实时行情。
2. 不做 setup detection。
3. 不做 LLM 总结。
4. 不做 live trading。
5. 不做复杂回测。
6. 不做向量数据库。
```

---

### 16.4 验收标准

Task 001 完成后必须满足：

```text
1. migration 可运行。
2. 新增 9 张表。
3. 所有表有必要索引。
4. repository 支持 create / get / list / update。
5. 单元测试通过。
6. 不接行情。
7. 不做 setup detection。
8. 不做 LLM 总结。
9. 不做 live trading。
10. 不破坏现有项目结构。
```

---

## 17. 下一步

阅读并实现：

```text
05_market_data_service.md
```

重点完成：

```text
1. MarketDataService
2. SourceRouter
3. LongbridgeAdapter
4. AlphaVantageAdapter
5. YFinanceAdapter
6. DataNormalizer
7. DataQualityGate
```