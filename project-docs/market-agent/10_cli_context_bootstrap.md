# 10. CLI Context Bootstrap

## 1. 文档目的

本文档定义 `Permanent Memory Market Agent` 的 CLI 启动上下文恢复机制：`SessionContextBootstrap`。

本模块负责在每次 CLI 会话启动前，从长期记忆系统中读取当前最相关的规律、失败教训、最近决策和交易约束，生成：

```text
.runtime/context/context_pack.md
```

这个文件是 Agent 当前会话的启动记忆。

核心目标：

> 让 Agent 每次启动时不是从零开始，而是自动恢复系统过去学习到的有效规律、失效规律、风险边界和失败教训。

---

## 2. 核心定位

`SessionContextBootstrap` 是永久记忆系统到 CLI Agent 的桥接层。

完整链路：

```text
DecisionEnvelope
  ↓
decision_memories
  ↓
OutcomeGraph
  ↓
outcome_memories
  ↓
EvaluationGraph
  ↓
insight_candidates
  ↓
PatternMemory / FailureMemory
  ↓
SessionContextBootstrap
  ↓
.runtime/context/context_pack.md
  ↓
CLI Agent
```

---

## 3. 模块目标

`SessionContextBootstrap` 需要做到：

```text
1. 读取用户交易约束。
2. 读取当前 watchlist。
3. 读取相关 active patterns。
4. 读取相关 degraded patterns。
5. 读取 active failure warnings。
6. 读取最近 DecisionEnvelope 摘要。
7. 读取当前数据源健康状态。
8. 生成 context_pack.md。
9. 将 context_pack 写入 session_context_packs。
10. 确保 CLI Agent 启动时能加载该上下文。
```

---

## 4. 非目标

本模块不做：

```text
1. 不拉取实时行情。
2. 不做 setup detection。
3. 不做交易判断。
4. 不做 outcome labeling。
5. 不晋升 pattern。
6. 不修改交易权限。
7. 不自动下单。
8. 不把全量历史数据塞进 context_pack。
```

`context_pack.md` 不是数据库，也不是全量记忆。
它只是当前会话需要加载的高价值记忆切片。

---

## 5. 核心原则

## 5.1 Context Pack 不是全量记忆

禁止：

```text
1. 把 30 年历史行情写入 context_pack。
2. 把所有 decision_memories 全量写入 context_pack。
3. 把所有 archived patterns 写入 context_pack。
4. 把原始 API 响应写入 context_pack。
5. 把过长自然语言总结写入 context_pack。
```

允许：

```text
1. 写入当前 watchlist 相关 active patterns。
2. 写入当前 watchlist 相关 degraded patterns。
3. 写入 active warnings。
4. 写入最近关键 decisions 摘要。
5. 写入交易约束。
6. 写入 Required Behavior。
```

---

## 5.2 Context Pack 应稳定、短小、可读

建议限制：

```text
Active Patterns：最多 10 条
Degraded Patterns：最多 10 条
Active Warnings：最多 20 条
Recent Decisions：最多 20 条摘要
Current Focus：最多 10 条
```

如果超过限制，应按相关性和重要性排序。

---

## 5.3 失败教训必须进入上下文

系统每次启动时，不能只加载成功规律。

必须加载：

```text
1. degraded patterns
2. active warnings
3. recent false positives
4. source conflict warnings
5. data quality warnings
6. risk gate failure lessons
```

这些内容用于防止 Agent 重复犯错。

---

## 5.4 Context Pack 必须可追溯

每次生成 context pack，都必须写入：

```text
session_context_packs
```

并保存：

```text
source_memory_ids_json
```

这样后续可以知道某次 CLI 会话加载了哪些长期记忆。

---

## 6. 输入来源

`SessionContextBootstrap` 需要读取以下来源：

```text
TradingMandateStore
WatchlistStore
PatternMemoryRepository
FailureMemoryRepository
DecisionMemoryRepository
SessionContextPackRepository
MarketDataHealthStore / SourceHealthStore
```

如果当前项目尚无 `TradingMandateStore` 或 `WatchlistStore`，MVP 可以先使用默认配置文件。

建议路径：

```text
config/trading_mandate.yaml
config/watchlist.yaml
```

---

## 7. 输出文件

默认输出路径：

```text
.runtime/context/context_pack.md
```

同时写入数据库：

```text
session_context_packs
```

---

## 8. CLI 命令

## 8.1 生成 Context Pack

```bash
trader memory bootstrap --profile default
```

---

## 8.2 指定股票池

```bash
trader memory bootstrap --profile default --symbols TSLA,NVDA,AAPL
```

---

## 8.3 查看最近 Context Pack

```bash
trader memory context --latest
```

---

## 8.4 输出到指定路径

```bash
trader memory bootstrap --profile default --output .runtime/context/context_pack.md
```

---

## 8.5 JSON Debug 输出

```bash
trader memory bootstrap --profile default --json
```

---

## 9. FastAPI 接口

## 9.1 生成 Context Pack

```http
POST /api/memory/context-pack/build
```

请求：

```json
{
  "profile": "default",
  "symbols": ["SPY", "QQQ", "TSLA", "NVDA", "AAPL"]
}
```

响应：

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

## 9.2 读取最近 Context Pack

```http
GET /api/memory/context-pack/latest?profile=default
```

---

## 10. Context Pack 内容结构

`context_pack.md` 必须包含以下章节：

```text
1. Header
2. Trading Mandate
3. Watchlist
4. Data Source Status
5. Active Patterns
6. Degraded Patterns
7. Active Warnings
8. Recent Decisions
9. Current Focus
10. Required Behavior
11. Prohibited Behavior
12. Source Memory References
```

---

## 11. Context Pack 模板

```markdown
# Trader Agent Context Pack

Generated At: {{ generated_at }}
Profile: {{ profile }}
Mode: {{ trading_mode }}

---

## 1. Trading Mandate

- Mode: monitor_only
- Live trading: disabled
- Paper trading: requires user confirmation
- Primary timeframes: 5m, 1d
- Allowed symbols: SPY, QQQ, TSLA, NVDA, AAPL
- Allowed actions: ignore, watch, alert, blocked, invalidated, review
- Prohibited actions: live_order, auto_order

---

## 2. Watchlist

- SPY
- QQQ
- TSLA
- NVDA
- AAPL

---

## 3. Data Source Status

- Longbridge: ok
- Alpha Vantage: ok
- yfinance: fallback_only

Rules:
- Prefer Longbridge for realtime / snapshot.
- Prefer Alpha Vantage or yfinance for daily historical fallback.
- Do not use yfinance as final realtime trading source.

---

## 4. Active Patterns

### Pattern: TSLA VWAP Reclaim in Risk-On Session

- Pattern ID: pat_tsla_vwap_reclaim_001
- Status: active
- Confidence: medium
- Scope:
  - Symbols: TSLA
  - Timeframe: 5m
  - Session: regular
- Conditions:
  - price_crosses_above_vwap
  - volume_ratio_5m > 1.5
  - QQQ above VWAP
- Invalidations:
  - two_5m_closes_below_vwap
  - QQQ breaks intraday low
- Evidence:
  - sample_size: 84
  - good_signal_rate: 0.61
  - false_positive_rate: 0.19
  - median_mfe: 0.018
  - median_mae: -0.007

---

## 5. Degraded Patterns

### Pattern: Opening Range Breakout on Weak Index Days

- Pattern ID: pat_orb_weak_index_001
- Status: degraded
- Reason: recent false_positive_rate increased.
- Required Behavior:
  - Do not confirm ORB if QQQ is below VWAP.
  - Treat ORB as watch_only under weak index confirmation.

---

## 6. Active Warnings

- If source_conflict exists, block setup detection.
- If data quality fails, do not generate trading judgment.
- Do not confirm ORB when index confirmation is absent.
- Avoid setup_confirmed during major macro event windows.

---

## 7. Recent Decisions

### dec_20260610_tsla_001

- Symbol: TSLA
- Setup: VWAP_RECLAIM
- Action: watch
- Outcome: good_watch_signal
- Lesson: QQQ confirmation improved after TSLA reclaimed VWAP.

### dec_20260610_nvda_001

- Symbol: NVDA
- Setup: RELATIVE_STRENGTH_PULLBACK
- Action: blocked
- Outcome: blocked_correctly
- Lesson: RiskGate correctly blocked weak index setup.

---

## 8. Current Focus

- Monitor TSLA VWAP reclaim only if QQQ is not risk_off.
- Monitor NVDA relative strength pullback.
- Avoid ORB confirmation when SPY / QQQ are below VWAP.

---

## 9. Required Behavior

- Generate DecisionEnvelope only.
- Use structured evidence.
- Include opposing evidence.
- Include invalidation conditions.
- Apply RiskGate before alert.
- Persist every DecisionEnvelope.
- Stop setup detection if data quality is failed or blocked.
- Require user confirmation before paper trading.
- Never generate live_order in MVP.

---

## 10. Prohibited Behavior

- Do not output buy / sell / short / live_order.
- Do not bypass RiskGate.
- Do not treat candidate patterns as active.
- Do not use degraded patterns as high-confidence signals.
- Do not rely on LLM memory for market facts.
- Do not invent market data or news.
- Do not ignore source_conflict.

---

## 11. Source Memory References

- Active Patterns: pat_tsla_vwap_reclaim_001
- Degraded Patterns: pat_orb_weak_index_001
- Failure Memories: fail_orb_weak_index_001
- Recent Decisions: dec_20260610_tsla_001, dec_20260610_nvda_001
```

---

## 12. ContextPackBuilder 设计

## 12.1 模块职责

`ContextPackBuilder` 负责从 repository 中读取长期记忆并生成 Markdown。

推荐路径：

```text
trader_workflow/
  market_agent/
    memory/
      context_pack_builder.py
```

---

## 12.2 输入

```python
from dataclasses import dataclass

@dataclass
class ContextPackBuildRequest:
    profile: str = "default"
    symbols: list[str] | None = None
    max_active_patterns: int = 10
    max_degraded_patterns: int = 10
    max_active_warnings: int = 20
    max_recent_decisions: int = 20
    output_path: str = ".runtime/context/context_pack.md"
```

---

## 12.3 输出

```python
from dataclasses import dataclass
from datetime import datetime

@dataclass
class ContextPackBuildResult:
    id: str
    profile: str
    generated_at: datetime
    output_path: str
    context_markdown: str
    source_memory_ids: list[str]
```

---

## 12.4 Builder 接口

```python
class ContextPackBuilder:
    def __init__(
        self,
        trading_mandate_store,
        watchlist_store,
        pattern_repository,
        failure_repository,
        decision_repository,
        session_context_repository,
        source_health_store=None,
    ):
        ...

    def build(self, request: ContextPackBuildRequest) -> ContextPackBuildResult:
        ...
```

---

## 13. Build 流程

```text
1. load_trading_mandate
2. resolve_watchlist
3. load_data_source_status
4. load_active_patterns
5. load_degraded_patterns
6. load_active_warnings
7. load_recent_decisions
8. derive_current_focus
9. render_markdown
10. write_context_pack_file
11. persist_session_context_pack
12. return result
```

---

## 14. 节点 1：`load_trading_mandate`

### 14.1 目标

读取用户交易约束。

MVP 默认：

```yaml
mode: monitor_only
live_trading_enabled: false
paper_trading_requires_confirmation: true
allowed_actions:
  - ignore
  - watch
  - alert
  - blocked
  - invalidated
  - review
prohibited_actions:
  - buy
  - sell
  - short
  - live_order
  - auto_order
```

---

### 14.2 失败处理

如果读取失败，使用安全默认值：

```text
mode = monitor_only
live_trading_enabled = false
paper_trading_requires_confirmation = true
```

禁止因为配置缺失而提升权限。

---

## 15. 节点 2：`resolve_watchlist`

### 15.1 目标

确定本次 context pack 的股票池。

优先级：

```text
CLI symbols 参数
  ↓
profile watchlist
  ↓
default watchlist
```

默认：

```text
SPY
QQQ
TSLA
NVDA
AAPL
```

---

### 15.2 规则

如果 CLI 传入 symbol 不在默认 watchlist：

```text
1. 不自动加入。
2. 标记为 out_of_scope。
3. 需要用户确认后才能加入长期 watchlist。
```

---

## 16. 节点 3：`load_data_source_status`

### 16.1 目标

读取数据源健康状态。

MVP 可先使用简单状态：

```text
Longbridge: unknown / ok / failed
Alpha Vantage: unknown / ok / rate_limited / failed
yfinance: fallback_only / ok / failed
```

---

### 16.2 输出示例

```markdown
## Data Source Status

- Longbridge: ok
- Alpha Vantage: rate_limited
- yfinance: fallback_only

Rules:
- Longbridge is preferred for realtime.
- yfinance is fallback only.
- If source conflict exists, block setup detection.
```

---

## 17. 节点 4：`load_active_patterns`

### 17.1 目标

读取当前 watchlist 相关 active patterns。

查询条件：

```text
status = active
symbol intersects watchlist
```

排序建议：

```text
1. confidence 高优先
2. sample_size 高优先
3. 最近 reviewed 优先
4. 与当前 watchlist 高相关优先
```

---

### 17.2 限制

默认最多加载：

```text
10 条
```

---

### 17.3 输出要求

每条 active pattern 必须包含：

```text
1. pattern_id
2. name
3. status
4. confidence
5. scope
6. conditions
7. invalidations
8. key evidence
```

---

## 18. 节点 5：`load_degraded_patterns`

### 18.1 目标

读取当前 watchlist 相关 degraded patterns。

查询条件：

```text
status = degraded
symbol intersects watchlist
```

---

### 18.2 输出要求

每条 degraded pattern 必须包含：

```text
1. pattern_id
2. name
3. degraded reason
4. required behavior
5. related setup
6. affected symbols
```

---

### 18.3 作用

Degraded pattern 不用于增强信号，而用于降低置信度、触发风控或生成反方证据。

---

## 19. 节点 6：`load_active_warnings`

### 19.1 目标

读取 active failure warnings。

查询条件：

```text
failure_memories.status = active_warning
symbol intersects watchlist OR symbol is null
```

---

### 19.2 输出要求

每条 warning 包含：

```text
1. failure_id
2. failure_type
3. symbol
4. setup_name
5. lesson
6. affected_patterns
```

---

### 19.3 排序建议

```text
1. high severity 优先
2. 与当前 watchlist 相关优先
3. 最近创建优先
4. 反复出现优先
```

---

## 20. 节点 7：`load_recent_decisions`

### 20.1 目标

读取最近关键 `DecisionEnvelope` 摘要。

查询条件：

```text
symbol intersects watchlist
limit = 20
```

---

### 20.2 建议筛选

优先加载：

```text
1. action = alert
2. action = blocked
3. action = invalidated
4. outcome_label = false_positive
5. outcome_label = invalidated_quickly
6. outcome_label = blocked_correctly
7. outcome_label = good_watch_signal
```

---

### 20.3 摘要字段

每条 recent decision 摘要包含：

```text
1. decision_id
2. symbol
3. setup
4. action
5. risk_gate_status
6. outcome_label
7. key lesson
```

---

## 21. 节点 8：`derive_current_focus`

### 21.1 目标

根据 active patterns、degraded patterns、active warnings 和 recent decisions 生成当前重点观察事项。

---

### 21.2 输出示例

```markdown
## Current Focus

- Monitor TSLA VWAP reclaim only if QQQ is not risk_off.
- Monitor NVDA relative strength pullback.
- Avoid ORB confirmation when SPY / QQQ are below VWAP.
```

---

### 21.3 LLM 使用边界

可以使用 LLM 压缩 current focus，但必须基于结构化输入。

禁止：

```text
1. 凭空添加新标的。
2. 凭空添加未验证规律。
3. 添加买卖建议。
4. 添加收益目标。
```

---

## 22. 节点 9：`render_markdown`

### 22.1 目标

将上下文数据渲染为稳定 Markdown。

---

### 22.2 要求

```text
1. 章节顺序固定。
2. 不输出过长段落。
3. 使用 bullet list。
4. 保留 pattern_id / failure_id / decision_id。
5. Required Behavior 和 Prohibited Behavior 必须明确。
```

---

## 23. 节点 10：`write_context_pack_file`

### 23.1 目标

写入文件：

```text
.runtime/context/context_pack.md
```

---

### 23.2 要求

```text
1. 如果目录不存在，自动创建。
2. 覆盖旧 context_pack.md。
3. 同时可保存历史副本。
```

建议历史路径：

```text
.runtime/context/history/context_pack_{timestamp}.md
```

---

## 24. 节点 11：`persist_session_context_pack`

### 24.1 目标

写入数据库表：

```text
session_context_packs
```

---

### 24.2 写入字段

```text
id
profile
generated_at
context_markdown
source_memory_ids_json
```

---

### 24.3 `source_memory_ids_json`

必须记录本次加载的记忆 ID：

```json
{
  "active_patterns": ["pat_tsla_vwap_reclaim_001"],
  "degraded_patterns": ["pat_orb_weak_index_001"],
  "failure_memories": ["fail_orb_weak_index_001"],
  "recent_decisions": ["dec_20260610_tsla_001"]
}
```

---

## 25. CLI Agent 启动规则

任何 CLI Agent 开始分析前，应执行：

```text
1. 检查 .runtime/context/context_pack.md 是否存在。
2. 如果不存在，运行 trader memory bootstrap --profile default。
3. 读取 context_pack.md。
4. 将 context_pack 作为本轮分析的系统上下文输入。
```

---

## 26. 缺失 Context Pack 的处理

如果 `context_pack.md` 不存在且 bootstrap 失败：

```text
1. 允许 monitor_only 模式继续运行。
2. 禁止 paper_trade_candidate。
3. 禁止 alert 升级。
4. 所有判断必须标记 context_missing。
5. CLI 输出提示用户运行 bootstrap。
```

输出示例：

```text
Context pack missing. Running in safe monitor_only mode.
No paper_trade_candidate or high-priority alert will be generated.
Please run: trader memory bootstrap --profile default
```

---

## 27. Required Behavior 固定内容

每个 context pack 必须包含以下行为约束：

```text
- Generate DecisionEnvelope only.
- Use structured evidence.
- Include opposing evidence.
- Include invalidation conditions.
- Apply RiskGate before alert.
- Persist every DecisionEnvelope.
- Stop setup detection if data quality is failed or blocked.
- Require user confirmation before paper trading.
- Never generate live_order in MVP.
```

---

## 28. Prohibited Behavior 固定内容

每个 context pack 必须包含以下禁止事项：

```text
- Do not output buy / sell / short / live_order.
- Do not bypass RiskGate.
- Do not treat candidate patterns as active.
- Do not use degraded patterns as high-confidence signals.
- Do not rely on LLM memory for market facts.
- Do not invent market data or news.
- Do not ignore source_conflict.
- Do not promote patterns without user confirmation.
```

---

## 29. Context Pack 与 MarketMonitorGraph 的关系

`MarketMonitorGraph` 读取 context pack 后，应将其中内容用于：

```text
1. active_patterns → EvidenceGraphBuilder
2. degraded_patterns → RiskGate / ContraCaseGenerator
3. active_warnings → RiskGate
4. recent_decisions → 避免重复误判
5. required_behavior → 输出约束
6. prohibited_behavior → 安全边界
```

---

## 30. Context Pack 与 PatternMemory 的关系

只有以下 Pattern 默认进入 context pack：

```text
status = active
status = degraded
```

以下 Pattern 默认不进入：

```text
candidate
invalidated
archived
```

`testing` 是否进入 context pack 由配置决定。
MVP 建议：

```text
testing patterns 只进入 Testing Patterns 章节，不作为 active evidence。
```

---

## 31. Context Pack 与 FailureMemory 的关系

以下 FailureMemory 必须进入 context pack：

```text
status = active_warning
```

以下 FailureMemory 默认不进入：

```text
resolved
archived
```

---

## 32. Context Pack 与 Recent Decisions 的关系

Recent Decisions 用于提醒 Agent：

```text
1. 最近哪些 setup 有效。
2. 最近哪些 setup 失败。
3. 哪些 blocked 是正确的。
4. 哪些 ignore 可能错过机会。
5. 哪些风险反复出现。
```

但 Recent Decisions 不能直接替代 PatternMemory。

---

## 33. 幂等性要求

重复运行：

```bash
trader memory bootstrap --profile default
```

必须满足：

```text
1. 不重复创建 pattern。
2. 不重复创建 failure。
3. 可以重复生成新的 session_context_pack 记录。
4. 可以覆盖 .runtime/context/context_pack.md。
5. 不能修改 trading mandate。
6. 不能修改 pattern 状态。
```

---

## 34. 测试计划

### 34.1 单元测试

必须覆盖：

```text
test_context_pack_loads_trading_mandate
test_context_pack_loads_watchlist
test_context_pack_loads_active_patterns
test_context_pack_loads_degraded_patterns
test_context_pack_loads_active_warnings
test_context_pack_loads_recent_decisions
test_context_pack_limits_active_patterns
test_context_pack_limits_recent_decisions
test_context_pack_renders_required_behavior
test_context_pack_renders_prohibited_behavior
test_context_pack_records_source_memory_ids
test_context_pack_writes_file
test_context_pack_persists_session_context_pack
```

---

### 34.2 集成测试

必须覆盖：

```text
PatternMemory
  ↓
FailureMemory
  ↓
DecisionMemory
  ↓
ContextPackBuilder
  ↓
.runtime/context/context_pack.md
  ↓
session_context_packs
```

---

### 34.3 缺失数据测试

必须覆盖：

```text
1. 没有 active patterns。
2. 没有 degraded patterns。
3. 没有 active warnings。
4. 没有 recent decisions。
5. trading mandate 缺失。
6. watchlist 缺失。
```

系统应能生成安全默认 context pack。

---

## 35. Task 008：SessionContextBootstrap MVP

### 35.1 目标

实现 CLI 启动上下文恢复机制，使 Agent 每次启动时能加载长期记忆。

---

### 35.2 范围

必须实现：

```text
1. ContextPackBuildRequest
2. ContextPackBuildResult
3. ContextPackBuilder
4. load_trading_mandate
5. resolve_watchlist
6. load_active_patterns
7. load_degraded_patterns
8. load_active_warnings
9. load_recent_decisions
10. render_markdown
11. write_context_pack_file
12. persist_session_context_pack
13. trader memory bootstrap CLI
```

---

### 35.3 不做

本任务不做：

```text
1. 不做实时行情获取。
2. 不做 setup detection。
3. 不做 OutcomeGraph。
4. 不做 Pattern 晋升。
5. 不做 live trading。
6. 不做复杂向量检索。
```

---

### 35.4 验收标准

Task 008 完成后必须满足：

```text
1. 可以运行 trader memory bootstrap --profile default。
2. 可以生成 .runtime/context/context_pack.md。
3. context_pack 包含 Trading Mandate。
4. context_pack 包含 Watchlist。
5. context_pack 包含 Active Patterns。
6. context_pack 包含 Degraded Patterns。
7. context_pack 包含 Active Warnings。
8. context_pack 包含 Recent Decisions。
9. context_pack 包含 Required Behavior。
10. context_pack 包含 Prohibited Behavior。
11. context_pack 写入 session_context_packs。
12. source_memory_ids_json 可追溯。
13. 缺少 pattern / warning / decision 时仍能生成安全默认上下文。
```

---

## 36. 下一步

阅读并实现：

```text
11_api_and_cli_spec.md
```

重点完成：

```text
1. API 路由清单
2. CLI 命令清单
3. 请求 / 响应格式
4. memory bootstrap 命令
5. monitor run 命令
6. outcome labeling 命令
7. pattern management 命令
```
