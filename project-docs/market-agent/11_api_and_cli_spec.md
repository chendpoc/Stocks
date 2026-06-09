# 11. API and CLI Spec

## 1. 文档目的

本文档定义 `Permanent Memory Market Agent` 的 FastAPI 接口与 CLI 命令规格。

本系统同时支持：

```text
1. CLI 本地开发与日常运行
2. FastAPI Web Dashboard / 外部调用
3. Agent 工具调用
4. 后续自动化任务编排
```

CLI 是 MVP 阶段的优先入口。
FastAPI 用于 Web Dashboard、外部服务和后续可视化工作台。

---

## 2. 设计原则

### 2.1 CLI 优先

MVP 阶段优先保证 CLI 可运行：

```text
trader memory init
trader memory bootstrap
trader monitor run
trader memory label-outcomes
trader memory evaluate
trader memory generate-insights
trader memory promote-pattern
```

原因：

```text
1. 便于本地开发。
2. 便于 Agent 调用。
3. 便于调试。
4. 便于和现有 workflow recording 对齐。
```

---

### 2.2 API 与 CLI 共享 Service 层

禁止：

```text
CLI 一套逻辑
FastAPI 一套逻辑
Graph 内部再写一套逻辑
```

正确方式：

```text
CLI / FastAPI
  ↓
Application Service
  ↓
Graph / Repository / Data Service
```

---

### 2.3 所有高风险动作必须显式确认

以下操作必须带确认参数：

```text
1. promote-pattern
2. degraded → active
3. invalidated → testing
4. trading mandate 权限升级
5. paper trading 启用
6. live trading 启用
```

MVP 不实现 live trading。

---

### 2.4 输出默认人类可读，支持 JSON Debug

CLI 默认输出简洁人类可读格式。

所有关键命令支持：

```bash
--json
```

用于 Agent / 自动化系统解析。

---

## 3. CLI 命令总览

```text
trader memory init
trader memory bootstrap
trader memory context
trader memory decisions
trader memory outcomes
trader memory label-outcomes
trader memory evaluate
trader memory insights
trader memory generate-insights
trader memory patterns
trader memory promote-pattern
trader memory degrade-pattern
trader memory failures

trader monitor run

trader market-data fetch
trader market-data health
trader market-data quality
```

---

# Part A：Memory CLI

---

## 4. `trader memory init`

### 4.1 目的

初始化永久记忆数据库表。

---

### 4.2 命令

```bash
trader memory init
```

---

### 4.3 行为

执行数据库 migration，创建以下表：

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

### 4.4 参数

| 参数          | 说明              |
| ----------- | --------------- |
| `--db-path` | 可选，指定 SQLite 路径 |
| `--json`    | 输出 JSON         |

---

### 4.5 输出示例

```text
Memory database initialized.

Tables:
- market_snapshots
- feature_snapshots
- setup_events
- decision_memories
- outcome_memories
- insight_candidates
- pattern_memories
- failure_memories
- session_context_packs
```

---

### 4.6 验收标准

```text
1. 可重复运行。
2. 不删除已有数据。
3. 不破坏已有 workflow recording。
4. 所有表和索引创建成功。
```

---

## 5. `trader memory bootstrap`

### 5.1 目的

生成 CLI 启动上下文包：

```text
.runtime/context/context_pack.md
```

---

### 5.2 命令

```bash
trader memory bootstrap --profile default
```

---

### 5.3 参数

| 参数          | 说明                      |
| ----------- | ----------------------- |
| `--profile` | 配置 profile，默认 `default` |
| `--symbols` | 可选，指定股票池，如 `TSLA,NVDA`  |
| `--output`  | 可选，指定输出路径               |
| `--json`    | 输出 JSON                 |

---

### 5.4 行为

读取：

```text
1. Trading Mandate
2. Watchlist
3. Active Patterns
4. Degraded Patterns
5. Active Warnings
6. Recent Decisions
7. Data Source Status
```

生成：

```text
.runtime/context/context_pack.md
```

并写入：

```text
session_context_packs
```

---

### 5.5 输出示例

```text
Context pack generated.

Path:
.runtime/context/context_pack.md

Included:
- Active Patterns: 3
- Degraded Patterns: 1
- Active Warnings: 4
- Recent Decisions: 12
```

---

### 5.6 JSON 输出示例

```json
{
  "context_pack_id": "ctx_20260610_001",
  "profile": "default",
  "path": ".runtime/context/context_pack.md",
  "active_patterns": 3,
  "degraded_patterns": 1,
  "active_warnings": 4,
  "recent_decisions": 12
}
```

---

## 6. `trader memory context`

### 6.1 目的

查看最近生成的 context pack。

---

### 6.2 命令

```bash
trader memory context --latest
```

---

### 6.3 参数

| 参数            | 说明         |
| ------------- | ---------- |
| `--latest`    | 查看最近一次     |
| `--profile`   | 指定 profile |
| `--json`      | 输出 JSON    |
| `--path-only` | 只输出文件路径    |

---

### 6.4 输出示例

```text
Latest Context Pack:
- ID: ctx_20260610_001
- Profile: default
- Generated At: 2026-06-10T09:00:00-04:00
- Path: .runtime/context/context_pack.md
```

---

## 7. `trader memory decisions`

### 7.1 目的

查看历史 `DecisionEnvelope` 记录。

---

### 7.2 命令

```bash
trader memory decisions --symbol TSLA --limit 20
```

---

### 7.3 参数

| 参数         | 说明         |
| ---------- | ---------- |
| `--symbol` | 股票代码       |
| `--setup`  | setup 名称   |
| `--action` | action 过滤  |
| `--limit`  | 返回数量，默认 20 |
| `--json`   | 输出完整 JSON  |

---

### 7.4 输出示例

```text
Recent Decisions for TSLA:

1. dec_20260610_tsla_001
   - Setup: VWAP_RECLAIM
   - Action: watch
   - Risk: watch_only
   - Confidence: 0.64
   - Time: 2026-06-10T09:45:00-04:00
```

---

## 8. `trader memory outcomes`

### 8.1 目的

查看历史回标结果。

---

### 8.2 命令

```bash
trader memory outcomes --symbol TSLA --limit 20
```

---

### 8.3 参数

| 参数         | 说明            |
| ---------- | ------------- |
| `--symbol` | 股票代码          |
| `--setup`  | setup 名称      |
| `--window` | 30m / 2h / 1d |
| `--label`  | outcome_label |
| `--limit`  | 返回数量          |
| `--json`   | 输出 JSON       |

---

### 8.4 输出示例

```text
Recent Outcomes for TSLA:

1. dec_20260610_tsla_001
   - Window: 2h
   - Label: good_watch_signal
   - MFE: 0.018
   - MAE: -0.006
   - Final Return: 0.011
```

---

## 9. `trader memory label-outcomes`

### 9.1 目的

对历史 `DecisionEnvelope` 进行结果回标。

---

### 9.2 命令

```bash
trader memory label-outcomes --window 2h
```

---

### 9.3 参数

| 参数          | 说明                           |
| ----------- | ---------------------------- |
| `--window`  | outcome window：30m / 2h / 1d |
| `--symbol`  | 可选，指定股票                      |
| `--setup`   | 可选，指定 setup                  |
| `--limit`   | 批量处理数量                       |
| `--dry-run` | 只计算不写入                       |
| `--json`    | 输出 JSON                      |

---

### 9.4 行为

执行：

```text
1. 读取未回标 decision_memories。
2. 拉取后续价格窗口。
3. 计算 MFE / MAE / final_return。
4. 判断 hit_entry / hit_invalidation。
5. 生成 outcome_label。
6. 写入 outcome_memories。
```

---

### 9.5 输出示例

```text
Outcome labeling completed.

Window: 2h
Processed: 32
Created: 30
Skipped: 2
Unknown: 1
```

---

## 10. `trader memory evaluate`

### 10.1 目的

统计 setup / pattern 历史表现。

---

### 10.2 命令

```bash
trader memory evaluate --setup VWAP_RECLAIM --window 2h
```

---

### 10.3 参数

| 参数            | 说明             |
| ------------- | -------------- |
| `--symbol`    | 股票代码           |
| `--setup`     | setup 名称       |
| `--window`    | outcome window |
| `--timeframe` | 周期             |
| `--group-by`  | 聚合维度           |
| `--json`      | 输出 JSON        |

---

### 10.4 输出示例

```text
Evaluation Result

Group:
- setup: VWAP_RECLAIM
- window: 2h

Metrics:
- Sample Size: 42
- Good Signal Rate: 0.62
- False Positive Rate: 0.21
- Median MFE: 0.014
- Median MAE: -0.006
- Recent Degradation: false
```

---

## 11. `trader memory generate-insights`

### 11.1 目的

根据评估结果生成 `InsightCandidate`。

---

### 11.2 命令

```bash
trader memory generate-insights --setup VWAP_RECLAIM --symbol TSLA
```

---

### 11.3 参数

| 参数                  | 说明             |
| ------------------- | -------------- |
| `--symbol`          | 股票代码           |
| `--setup`           | setup 名称       |
| `--window`          | outcome window |
| `--min-sample-size` | 最小样本量，默认 20    |
| `--json`            | 输出 JSON        |

---

### 11.4 输出示例

```text
Insight Candidate generated.

ID: insight_20260610_001
Hypothesis:
TSLA VWAP_RECLAIM performs better when QQQ is above VWAP and 5m volume_ratio exceeds 1.5.

Evidence:
- Sample Size: 42
- Good Signal Rate: 0.62
- False Positive Rate: 0.21
- Median MFE: 0.014
- Median MAE: -0.006

Status: new
```

---

## 12. `trader memory insights`

### 12.1 目的

查看规律候选。

---

### 12.2 命令

```bash
trader memory insights --status new
```

---

### 12.3 参数

| 参数         | 说明                                             |
| ---------- | ---------------------------------------------- |
| `--status` | new / testing / rejected / promoted / archived |
| `--source` | 来源                                             |
| `--limit`  | 数量                                             |
| `--json`   | 输出 JSON                                        |

---

## 13. `trader memory patterns`

### 13.1 目的

查看长期规律记忆。

---

### 13.2 命令

```bash
trader memory patterns --status active
```

---

### 13.3 参数

| 参数         | 说明                                                               |
| ---------- | ---------------------------------------------------------------- |
| `--status` | candidate / testing / active / degraded / invalidated / archived |
| `--symbol` | 股票代码                                                             |
| `--setup`  | setup 名称                                                         |
| `--limit`  | 数量                                                               |
| `--json`   | 输出 JSON                                                          |

---

### 13.4 输出示例

```text
Active Patterns:

1. pat_tsla_vwap_reclaim_001
   - Name: TSLA VWAP Reclaim in Risk-On Session
   - Confidence: medium
   - Sample Size: 84
   - Good Signal Rate: 0.61
   - Status: active
```

---

## 14. `trader memory promote-pattern`

### 14.1 目的

将 `InsightCandidate` 晋升为 `PatternMemory`。

---

### 14.2 命令

```bash
trader memory promote-pattern --candidate-id insight_001
```

---

### 14.3 参数

| 参数               | 说明                   |
| ---------------- | -------------------- |
| `--candidate-id` | insight_candidate ID |
| `--status`       | 晋升状态，默认 active       |
| `--confirm`      | 显式确认                 |
| `--json`         | 输出 JSON              |

---

### 14.4 用户确认门禁

MVP 阶段必须要求用户确认。

推荐交互：

```text
You are about to promote this insight to active PatternMemory.

Candidate:
- ID: insight_001
- Hypothesis: TSLA VWAP_RECLAIM performs better when QQQ is above VWAP.
- Sample Size: 42
- Good Signal Rate: 0.62
- False Positive Rate: 0.21

Type "PROMOTE" to confirm:
```

非交互模式必须传：

```bash
--confirm
```

---

### 14.5 输出示例

```text
Pattern promoted.

Pattern ID:
pat_tsla_vwap_reclaim_001

Status:
active
```

---

## 15. `trader memory degrade-pattern`

### 15.1 目的

将 pattern 标记为 degraded。

---

### 15.2 命令

```bash
trader memory degrade-pattern --pattern-id pat_tsla_vwap_reclaim_001 --reason "recent false_positive increased"
```

---

### 15.3 参数

| 参数             | 说明         |
| -------------- | ---------- |
| `--pattern-id` | Pattern ID |
| `--reason`     | 降级原因       |
| `--json`       | 输出 JSON    |

---

### 15.4 输出示例

```text
Pattern degraded.

Pattern ID:
pat_tsla_vwap_reclaim_001

Reason:
recent false_positive increased
```

---

## 16. `trader memory failures`

### 16.1 目的

查看失败记忆和 active warnings。

---

### 16.2 命令

```bash
trader memory failures --status active_warning
```

---

### 16.3 参数

| 参数         | 说明                                   |
| ---------- | ------------------------------------ |
| `--status` | active_warning / resolved / archived |
| `--symbol` | 股票代码                                 |
| `--setup`  | setup 名称                             |
| `--type`   | failure_type                         |
| `--limit`  | 数量                                   |
| `--json`   | 输出 JSON                              |

---

# Part B：Market Monitor CLI

---

## 17. `trader monitor run`

### 17.1 目的

运行 `MarketMonitorGraph`，生成当前市场监控判断。

---

### 17.2 命令

```bash
trader monitor run --symbols SPY,QQQ,TSLA,NVDA,AAPL --timeframes 5m,1d
```

---

### 17.3 参数

| 参数             | 说明                           |
| -------------- | ---------------------------- |
| `--symbols`    | 股票池                          |
| `--timeframes` | 周期                           |
| `--mode`       | monitor_only / paper_trading |
| `--dry-run`    | 只运行不写入                       |
| `--json`       | 输出 JSON                      |
| `--context`    | 指定 context_pack 路径           |

---

### 17.4 行为

执行：

```text
1. 加载 trading mandate。
2. 加载 watchlist。
3. 加载 context_pack。
4. 调用 MarketDataService。
5. 执行 DataQualityGate。
6. 执行 FeatureEngine。
7. 执行 SetupDetector。
8. 构建 EvidenceGraph。
9. 生成 ContraCase。
10. 执行 RiskGate。
11. 生成 DecisionEnvelope。
12. 写入 decision_memories。
13. 输出 alert / watch / blocked / invalidated。
```

---

### 17.5 输出示例

```text
Market Monitor Run Completed.

Run ID:
run_20260610_001

Decisions:
1. [WATCH] TSLA 5m — VWAP_RECLAIM forming
   - Risk: watch_only
   - Confidence: 0.64
   - Next Check: next_5m_close

2. [BLOCKED] AAPL 5m — OPENING_RANGE_BREAKOUT
   - Reason: QQQ below VWAP
```

---

### 17.6 JSON 输出示例

```json
{
  "run_id": "run_20260610_001",
  "decisions": [
    {
      "id": "dec_20260610_tsla_001",
      "symbol": "TSLA",
      "timeframe": "5m",
      "setup": "VWAP_RECLAIM",
      "status": "setup_forming",
      "action": "watch",
      "risk_gate_status": "watch_only"
    }
  ],
  "failures": [],
  "created_at": "2026-06-10T09:45:00-04:00"
}
```

---

# Part C：Market Data CLI

---

## 18. `trader market-data fetch`

### 18.1 目的

通过 `MarketDataService` 拉取行情数据。

---

### 18.2 命令

```bash
trader market-data fetch --symbol TSLA --timeframe 5m --mode historical
```

---

### 18.3 参数

| 参数              | 说明                               |
| --------------- | -------------------------------- |
| `--symbol`      | 股票代码                             |
| `--timeframe`   | 1m / 5m / 1d                     |
| `--mode`        | realtime / historical / snapshot |
| `--start`       | 开始时间                             |
| `--end`         | 结束时间                             |
| `--source`      | 指定数据源                            |
| `--no-fallback` | 禁用 fallback                      |
| `--json`        | 输出 JSON                          |

---

### 18.4 输出示例

```text
Market data fetched.

Symbol: TSLA
Timeframe: 5m
Source: longbridge
Bars: 78
Quality: pass
Fallback Used: false
```

---

## 19. `trader market-data health`

### 19.1 目的

检查数据源健康状态。

---

### 19.2 命令

```bash
trader market-data health
```

---

### 19.3 输出示例

```text
Market Data Source Health:

- Longbridge: ok
- Alpha Vantage: rate_limited
- yfinance: fallback_only
```

---

## 20. `trader market-data quality`

### 20.1 目的

查看指定标的最近行情数据质量。

---

### 20.2 命令

```bash
trader market-data quality --symbol TSLA --timeframe 5m
```

---

### 20.3 输出示例

```text
Data Quality Report:

Symbol: TSLA
Timeframe: 5m
Source: longbridge
Status: pass
Missing Bars: 0
Duplicate Bars: 0
Source Conflict: false
```

---

# Part D：FastAPI Spec

---

## 21. API 总览

```text
POST /api/market-data/fetch
GET  /api/market-data/health

POST /api/market-monitor/run

GET  /api/memory/decisions
GET  /api/memory/outcomes
POST /api/memory/outcomes/label
POST /api/memory/outcomes/label-batch

POST /api/memory/evaluate
GET  /api/memory/insights
POST /api/memory/insights/generate

GET  /api/memory/patterns
POST /api/memory/patterns/promote
POST /api/memory/patterns/{pattern_id}/status

GET  /api/memory/failures

POST /api/memory/context-pack/build
GET  /api/memory/context-pack/latest
```

---

## 22. `POST /api/market-data/fetch`

### 22.1 请求

```json
{
  "symbol": "TSLA",
  "timeframe": "5m",
  "mode": "historical",
  "start": "2026-06-10T09:30:00-04:00",
  "end": "2026-06-10T16:00:00-04:00",
  "preferred_source": "longbridge",
  "allow_fallback": true
}
```

---

### 22.2 响应

```json
{
  "symbol": "TSLA",
  "timeframe": "5m",
  "mode": "historical",
  "source": "longbridge",
  "bars_count": 78,
  "quality": {
    "quality_status": "pass",
    "missing_bars": 0,
    "warnings": [],
    "errors": []
  },
  "fallback_used": false
}
```

---

## 23. `GET /api/market-data/health`

### 23.1 响应

```json
{
  "sources": {
    "longbridge": {
      "status": "ok",
      "last_success_at": "2026-06-10T09:45:00-04:00"
    },
    "alphavantage": {
      "status": "rate_limited",
      "last_error": "API limit reached"
    },
    "yfinance": {
      "status": "fallback_only"
    }
  }
}
```

---

## 24. `POST /api/market-monitor/run`

### 24.1 请求

```json
{
  "symbols": ["SPY", "QQQ", "TSLA", "NVDA", "AAPL"],
  "timeframes": ["5m", "1d"],
  "mode": "monitor_only"
}
```

---

### 24.2 响应

```json
{
  "run_id": "run_20260610_001",
  "decisions": [
    {
      "id": "dec_20260610_tsla_001",
      "symbol": "TSLA",
      "timeframe": "5m",
      "setup": "VWAP_RECLAIM",
      "status": "setup_forming",
      "action": "watch",
      "risk_gate_status": "watch_only"
    }
  ],
  "quality_reports": [],
  "failures": [],
  "created_at": "2026-06-10T09:45:00-04:00"
}
```

---

## 25. `GET /api/memory/decisions`

### 25.1 Query 参数

```text
symbol
setup
action
limit
```

---

### 25.2 示例

```http
GET /api/memory/decisions?symbol=TSLA&limit=20
```

---

## 26. `POST /api/memory/outcomes/label`

### 26.1 请求

```json
{
  "decision_id": "dec_20260610_tsla_001",
  "outcome_window": "2h"
}
```

---

### 26.2 响应

```json
{
  "decision_id": "dec_20260610_tsla_001",
  "outcome_window": "2h",
  "outcome_label": "good_watch_signal",
  "mfe": 0.018,
  "mae": -0.006,
  "final_return": 0.011
}
```

---

## 27. `POST /api/memory/outcomes/label-batch`

### 27.1 请求

```json
{
  "symbols": ["TSLA", "NVDA"],
  "outcome_window": "2h",
  "limit": 100
}
```

---

### 27.2 响应

```json
{
  "processed": 100,
  "created": 96,
  "skipped": 4,
  "unknown": 2
}
```

---

## 28. `POST /api/memory/evaluate`

### 28.1 请求

```json
{
  "symbols": ["TSLA"],
  "setup_name": "VWAP_RECLAIM",
  "outcome_window": "2h"
}
```

---

### 28.2 响应

```json
{
  "group_key": {
    "symbol": "TSLA",
    "setup_name": "VWAP_RECLAIM",
    "outcome_window": "2h"
  },
  "sample_size": 42,
  "good_signal_rate": 0.62,
  "false_positive_rate": 0.21,
  "median_mfe": 0.014,
  "median_mae": -0.006,
  "recent_degradation": false
}
```

---

## 29. `GET /api/memory/insights`

### 29.1 示例

```http
GET /api/memory/insights?status=new
```

---

## 30. `POST /api/memory/insights/generate`

### 30.1 请求

```json
{
  "symbol": "TSLA",
  "setup_name": "VWAP_RECLAIM",
  "outcome_window": "2h",
  "min_sample_size": 20
}
```

---

### 30.2 响应

```json
{
  "insight_candidate_id": "insight_20260610_001",
  "status": "new",
  "hypothesis": "TSLA VWAP_RECLAIM performs better when QQQ is above VWAP and 5m volume_ratio exceeds 1.5."
}
```

---

## 31. `GET /api/memory/patterns`

### 31.1 示例

```http
GET /api/memory/patterns?status=active&symbol=TSLA
```

---

## 32. `POST /api/memory/patterns/promote`

### 32.1 请求

```json
{
  "insight_candidate_id": "insight_001",
  "user_confirmed": true
}
```

---

### 32.2 响应

```json
{
  "pattern_id": "pat_tsla_vwap_reclaim_001",
  "status": "active"
}
```

---

### 32.3 约束

如果：

```json
"user_confirmed": false
```

必须拒绝晋升：

```json
{
  "error": "user_confirmation_required"
}
```

---

## 33. `POST /api/memory/patterns/{pattern_id}/status`

### 33.1 请求

```json
{
  "status": "degraded",
  "reason": "recent false_positive_rate increased"
}
```

---

### 33.2 响应

```json
{
  "pattern_id": "pat_tsla_vwap_reclaim_001",
  "status": "degraded",
  "updated_at": "2026-06-10T09:45:00-04:00"
}
```

---

## 34. `GET /api/memory/failures`

### 34.1 示例

```http
GET /api/memory/failures?status=active_warning
```

---

## 35. `POST /api/memory/context-pack/build`

### 35.1 请求

```json
{
  "profile": "default",
  "symbols": ["SPY", "QQQ", "TSLA", "NVDA", "AAPL"]
}
```

---

### 35.2 响应

```json
{
  "context_pack_id": "ctx_20260610_001",
  "profile": "default",
  "path": ".runtime/context/context_pack.md",
  "generated_at": "2026-06-10T09:00:00-04:00",
  "source_memory_count": 42
}
```

---

## 36. `GET /api/memory/context-pack/latest`

### 36.1 示例

```http
GET /api/memory/context-pack/latest?profile=default
```

---

# Part E：错误响应规范

---

## 37. 标准错误结构

```json
{
  "error": "user_confirmation_required",
  "message": "Promoting an insight candidate to active pattern requires user confirmation.",
  "details": {
    "candidate_id": "insight_001"
  }
}
```

---

## 38. 常见错误码

```text
user_confirmation_required
data_quality_failed
source_conflict
not_found
invalid_status_transition
invalid_action_in_monitor_only
insufficient_sample_size
context_pack_missing
market_data_source_failed
```

---

# Part F：安全约束

---

## 39. API / CLI 必须强制的约束

```text
1. MVP 不允许 live_order。
2. monitor_only 不允许 paper_trade_candidate。
3. promote-pattern 必须 user_confirmed。
4. 数据质量 failed / blocked 时不允许 setup_confirmed。
5. source_conflict blocked 时不允许生成 alert。
6. degraded pattern 不允许作为高置信正向证据。
7. candidate pattern 不允许进入 active evidence。
```

---

## 40. 测试计划

### 40.1 CLI 测试

必须覆盖：

```text
test_cli_memory_init
test_cli_memory_bootstrap
test_cli_monitor_run
test_cli_label_outcomes
test_cli_evaluate
test_cli_generate_insights
test_cli_promote_pattern_requires_confirmation
test_cli_patterns_list_active
test_cli_failures_list_active_warning
```

---

### 40.2 API 测试

必须覆盖：

```text
test_api_market_data_fetch
test_api_market_monitor_run
test_api_list_decisions
test_api_label_outcome
test_api_evaluate
test_api_generate_insight
test_api_promote_pattern_requires_confirmation
test_api_build_context_pack
```

---

## 41. Task 009：API and CLI MVP

### 41.1 目标

实现 MVP 阶段所需 CLI 命令与 FastAPI 接口。

---

### 41.2 范围

必须实现：

```text
1. trader memory init
2. trader memory bootstrap
3. trader monitor run
4. trader memory decisions
5. trader memory label-outcomes
6. trader memory evaluate
7. trader memory generate-insights
8. trader memory patterns
9. trader memory promote-pattern
10. trader memory failures
11. POST /api/market-monitor/run
12. POST /api/memory/context-pack/build
13. POST /api/memory/outcomes/label
14. POST /api/memory/evaluate
15. POST /api/memory/patterns/promote
```

---

### 41.3 不做

```text
1. 不做 live trading API。
2. 不做自动下单 CLI。
3. 不做复杂权限系统。
4. 不做 Web Dashboard。
5. 不做新数据源接入。
```

---

### 41.4 验收标准

```text
1. CLI 可以初始化数据库。
2. CLI 可以生成 context_pack.md。
3. CLI 可以运行 MarketMonitorGraph。
4. CLI 可以查询 DecisionMemory。
5. CLI 可以执行 outcome labeling。
6. CLI 可以执行 evaluation。
7. CLI 可以生成 insight_candidate。
8. CLI 可以在用户确认后 promote pattern。
9. API 可以触发 monitor run。
10. API 可以触发 context pack build。
11. API 可以触发 outcome labeling。
12. API 可以触发 evaluation。
13. API promote pattern 未确认时必须拒绝。
14. 所有关键命令支持 --json。
15. 所有安全约束测试通过。
```

---

## 42. 下一步

阅读并实现：

```text
12_development_phases.md
```

重点完成：

```text
1. 分阶段开发顺序
2. 每阶段任务边界
3. 每阶段不做什么
4. 每阶段验收标准
5. 推荐提交顺序
```
