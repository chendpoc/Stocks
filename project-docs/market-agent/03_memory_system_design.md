# 03. Memory System Design

> **⚠️ 表名映射**: 本文档中的概念表名在实际系统中对应：
> - `DecisionMemory` → `model_decisions`（已存在）
> - `OutcomeMemory` → `decision_outcomes` + `insight_candidate_outcomes`（已存在）
> - `PatternMemory` → `pattern_memories`（★新增）
> - `FailureMemory` → `failure_memories`（★新增）

## 1. 文档目的

本文档定义 `Permanent Memory Market Agent` 的长期记忆系统。

系统的核心不是让 LLM 记住更多内容，而是让系统通过数据库、事件库、规律库和上下文包实现可审计、可检索、可版本化、可降级的长期记忆。

本文档回答：

```text
1. 系统要记住什么？
2. 哪些内容是事实，哪些内容是判断？
3. 规律如何从候选变成长期记忆？
4. 规律失效后如何处理？
5. CLI 每次启动时如何恢复历史经验？
```

---

## 2. 记忆系统总目标

构建一个长期市场记忆系统，使 Agent 能够：

```text
1. 保存历史市场事实。
2. 保存每次 Agent 判断。
3. 保存每次判断之后的真实结果。
4. 保存系统总结出的规律。
5. 保存失败教训。
6. 识别规律失效。
7. 每次 CLI 启动时加载相关记忆。
```

系统不应该依赖聊天历史来延续记忆。

正确方式是：

```text
市场事实 → 数据库 / 数据湖
特征结果 → Feature Store
Agent 判断 → DecisionMemory
判断结果 → OutcomeMemory
长期规律 → PatternMemory
失败教训 → FailureMemory
启动上下文 → context_pack.md
```

---

## 3. 核心原则

### 3.1 原始数据不是 LLM 记忆

30 年历史数据不应该塞入 prompt。
长期数据应保存到数据库、Parquet 或 DuckDB 中。

LLM 只读取当前任务相关的记忆切片。

错误方式：

```text
把 30 年 K 线塞进上下文
把所有历史总结塞进 system prompt
让模型自己“记得”过去的规律
```

正确方式：

```text
30 年数据存入结构化存储
特征和事件可按需检索
规律以 PatternMemory 形式版本化保存
CLI 启动时只加载当前相关的 Context Pack
```

---

### 3.2 事实、判断、结果、规律分离

系统必须区分：

```text
事实：行情数据、成交量、价格、指标
判断：Agent 当时输出的 DecisionEnvelope
结果：判断之后市场实际走势
规律：经过统计和确认的长期 pattern
失败：错误判断、失效条件、数据问题
```

这些内容不能混在同一张表或同一段自然语言记忆中。

---

### 3.3 规律必须版本化

每条 pattern 必须有：

```text
version
status
created_at
updated_at
last_reviewed_at
performance_json
```

不能覆盖旧规律。
如果规律条件发生变化，应该创建新版本或更新 version，而不是直接抹掉历史。

---

### 3.4 失败记忆必须进入上下文

系统每次启动时，不能只加载有效规律，还必须加载：

```text
active warnings
degraded patterns
recent false positives
data source issues
risk gate misses
```

失败记忆是防止 Agent 反复犯同类错误的关键。

---

## 4. 记忆分层

系统记忆分为 6 层：

```text
Layer 1：Raw Market Memory
Layer 2：Feature Memory
Layer 3：Decision Memory
Layer 4：Outcome Memory
Layer 5：Pattern Memory
Layer 6：Failure Memory
```

外加：

```text
Session Context Pack
```

整体结构：

```text
Raw Market Memory
  ↓
Feature Memory
  ↓
Decision Memory
  ↓
Outcome Memory
  ↓
Pattern Memory / Failure Memory
  ↓
Session Context Pack
  ↓
CLI Agent
```

---

## 5. Layer 1：Raw Market Memory

### 5.1 定义

保存原始或标准化后的市场行情数据。

内容：

```text
symbol
timestamp
timeframe
open
high
low
close
volume
source
session
quality_status
raw_json
```

---

### 5.2 用途

```text
1. 支持历史回放。
2. 支持特征重算。
3. 支持回测。
4. 支持数据问题排查。
5. 支持规律证据追溯。
```

---

### 5.3 存储建议

MVP：

```text
SQLite 保存 market_snapshots
```

中期：

```text
Parquet / DuckDB 保存大规模历史数据
SQLite 保存索引和元数据
```

---

### 5.4 关键要求

Raw Market Memory 是事实层。

禁止：

```text
1. 由 LLM 写入价格事实。
2. 由 LLM 修改历史行情。
3. 把未通过数据质量检查的数据写成高置信事实。
```

允许：

```text
1. 保存原始响应 raw_json。
2. 保存不同数据源的并行快照。
3. 标记 source_conflict。
4. 标记 data_quality_failed。
```

---

## 6. Layer 2：Feature Memory

### 6.1 定义

保存由行情计算出的特征快照。

内容：

```text
vwap
ema_9
ema_20
ema_50
atr
volume_ratio
gap_pct
relative_strength_spy
relative_strength_qqq
distance_to_vwap
price_above_vwap
```

---

### 6.2 用途

```text
1. 支持 setup detection。
2. 支持历史相似案例检索。
3. 支持 pattern 统计。
4. 避免重复计算。
```

---

### 6.3 原则

Feature Memory 是事实层，不允许 LLM 写入。

LLM 可以读取这些特征并生成解释，但不能直接生成或修正这些特征。

---

### 6.4 写入条件

只有当数据质量至少达到以下状态时才允许写入 feature memory：

```text
quality_status = pass
quality_status = warning
```

如果数据质量为：

```text
failed
blocked
```

则不写入高置信 feature snapshot。

---

## 7. Layer 3：Decision Memory

### 7.1 定义

保存 Agent 每一次结构化判断。

核心对象：

```text
DecisionEnvelope
```

每条决策必须保存：

```text
symbol
timestamp
timeframe
market_state
setup_name
action
confidence
evidence_json
contra_json
risk_json
decision_envelope_json
```

---

### 7.2 用途

```text
1. 保存 Agent 当时如何判断。
2. 支持后续结果回标。
3. 支持判断质量评估。
4. 支持复盘。
5. 支持避免重复犯错。
```

---

### 7.3 重要要求

不能只保存最后结论。
必须保存：

```text
支持证据
反方证据
风险门禁
失效条件
下一次检查条件
```

错误示例：

```text
TSLA 看涨。
```

正确示例：

```json
{
  "symbol": "TSLA",
  "setup": "VWAP_RECLAIM",
  "action": "watch",
  "supporting_evidence": [
    "price reclaimed VWAP",
    "volume_ratio > 1.5"
  ],
  "opposing_evidence": [
    "QQQ is still below VWAP"
  ],
  "invalidation_conditions": [
    "two 5m closes below VWAP",
    "QQQ breaks intraday low"
  ],
  "risk_gate_status": "watch_only"
}
```

---

### 7.4 写入规则

每个 `DecisionEnvelope` 都必须写入 `decision_memories`。

即使 action 是：

```text
ignore
blocked
invalidated
review
```

也必须写入。

原因：

```text
1. blocked 判断可以评估风控是否正确。
2. ignore 判断可以评估是否错过机会。
3. invalidated 判断可以用于失败教训。
4. review 判断可以用于人工复盘。
```

---

## 8. Layer 4：Outcome Memory

### 8.1 定义

保存某个 `DecisionEnvelope` 之后市场实际发生了什么。

核心字段：

```text
decision_id
outcome_window
hit_entry
hit_invalidation
mfe
mae
final_return
time_to_mfe_seconds
time_to_invalidation_seconds
outcome_label
```

---

### 8.2 用途

```text
1. 判断 Agent 输出是否有效。
2. 统计 setup 表现。
3. 发现 false positive。
4. 发现 late signal。
5. 为 pattern memory 提供证据。
```

---

### 8.3 Outcome Window

MVP 支持：

```text
30m
2h
1d
```

解释：

```text
30m：短线提示是否过早或过晚
2h：日内 setup 是否有效
1d：隔日或日线背景是否有延续
```

---

### 8.4 Outcome Label

枚举：

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

### 8.5 回标原则

OutcomeGraph 回标时必须基于实际后续价格窗口，不允许由 LLM 判断涨跌是否正确。

LLM 可以参与：

```text
1. 复盘摘要。
2. 失败原因解释。
3. 规律候选描述。
```

LLM 不允许参与：

```text
1. MFE 计算。
2. MAE 计算。
3. hit_entry 判定。
4. hit_invalidation 判定。
5. final_return 计算。
```

---

## 9. Layer 5：Pattern Memory

### 9.1 定义

保存系统长期总结出的市场规律。

Pattern 不是一句自然语言经验，而是结构化、可证伪、可评估的规则对象。

---

### 9.2 Pattern 必须包含

```text
name
claim
scope
conditions
invalidations
evidence
performance
confidence
status
version
created_at
updated_at
last_reviewed_at
```

---

### 9.3 示例

```json
{
  "name": "TSLA VWAP Reclaim in Risk-On Session",
  "claim": "When TSLA reclaims VWAP within the first 90 minutes while QQQ is above VWAP and 5m volume_ratio exceeds 1.5, continuation probability improves over baseline.",
  "scope": {
    "symbols": ["TSLA"],
    "timeframe": "5m",
    "market_regime": ["risk_on", "index_confirmed"],
    "session": "regular"
  },
  "conditions": [
    "price_crosses_above_vwap",
    "volume_ratio_5m > 1.5",
    "qqq_above_vwap"
  ],
  "invalidations": [
    "two_5m_closes_below_vwap",
    "qqq_breaks_intraday_low"
  ],
  "evidence": {
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

### 9.4 Pattern 不是交易指令

Pattern 只能作为：

```text
1. setup 检测参考
2. 证据链参考
3. 风险提示参考
4. context_pack 的长期经验
```

Pattern 不能直接变成：

```text
buy
sell
short
live_order
```

---

## 10. Layer 6：Failure Memory

### 10.1 定义

保存失败教训、误判原因和风险提醒。

---

### 10.2 Failure 类型

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

### 10.3 示例

```json
{
  "failure_type": "false_breakout",
  "symbol": "TSLA",
  "setup": "OPENING_RANGE_BREAKOUT",
  "root_cause": "QQQ was below VWAP and volume faded after breakout",
  "lesson": "Do not confirm ORB when index confirmation is absent.",
  "affected_patterns": ["pat_orb_001"],
  "status": "active_warning"
}
```

---

### 10.4 写入触发条件

以下情况必须写入 FailureMemory：

```text
1. data_quality_failed
2. source_conflict
3. llm_explanation_error
4. risk_gate_missed
5. setup_invalidated_quickly
6. pattern_degraded
7. false_positive
8. overfit_pattern
```

---

### 10.5 Failure 状态

```text
active_warning
resolved
archived
```

解释：

```text
active_warning：仍应进入 context_pack
resolved：问题已解决，默认不进入 context_pack
archived：历史归档，仅用于研究
```

---

## 11. Session Context Pack

### 11.1 定义

每次 CLI 会话启动前，系统生成当前上下文包：

```text
.runtime/context/context_pack.md
```

这个文件是 Agent 的启动记忆。

---

### 11.2 Context Pack 内容

必须包含：

```text
1. Trading Mandate
2. Watchlist
3. Active Patterns
4. Degraded Patterns
5. Active Warnings
6. Recent Decisions
7. Current Focus
8. Required Behavior
```

---

### 11.3 设计原则

Context Pack 不是全量记忆。
它是当前任务相关的高价值记忆切片。

禁止：

```text
1. 把所有历史行情塞入 context_pack。
2. 把所有旧 decision 全量塞入 context_pack。
3. 把 archived pattern 默认塞入 context_pack。
```

应该：

```text
1. 加载当前 watchlist 相关 active patterns。
2. 加载当前 watchlist 相关 degraded patterns。
3. 加载 active warnings。
4. 加载最近关键 decisions 的摘要。
5. 加载用户交易约束。
```

---

### 11.4 示例结构

```markdown
# Trader Agent Context Pack

## Trading Mandate
- Mode: monitor_only
- Live trading: disabled
- Paper trading: requires user confirmation

## Watchlist
- SPY
- QQQ
- TSLA
- NVDA
- AAPL

## Active Patterns
1. TSLA VWAP Reclaim in Risk-On Session
   - Status: active
   - Confidence: medium
   - Conditions: TSLA > VWAP, QQQ > VWAP, volume_ratio > 1.5
   - Invalidation: two 5m closes below VWAP

## Degraded Patterns
1. Opening Range Breakout on weak index days
   - Status: degraded
   - Reason: recent false breakouts increased

## Active Warnings
- Do not confirm ORB when QQQ is below VWAP.
- If data quality fails, stop setup detection.
- Avoid setup_confirmed during macro event windows.

## Recent Decisions
- Last 20 DecisionEnvelope summaries.

## Current Focus
- Monitor TSLA VWAP reclaim.
- Monitor NVDA relative strength pullback.

## Required Behavior
- Generate DecisionEnvelope only.
- Do not suggest live order.
- Stop if data quality fails.
```

---

## 12. Pattern 状态机

### 12.1 状态枚举

```text
candidate
testing
active
degraded
invalidated
archived
```

---

### 12.2 状态解释

| 状态            | 含义                    |
| ------------- | --------------------- |
| `candidate`   | 新发现的规律候选              |
| `testing`     | 进入观察或纸交易验证            |
| `active`      | 当前有效，可进入 context_pack |
| `degraded`    | 最近表现下降，需要谨慎           |
| `invalidated` | 已失效，不再作为有效规律          |
| `archived`    | 历史归档，仅供研究             |

---

### 12.3 状态转换

标准路径：

```text
candidate
  ↓
testing
  ↓
active
  ↓
degraded
  ↓
invalidated
  ↓
archived
```

允许旁路：

```text
candidate → archived
testing → archived
degraded → active
invalidated → testing
```

但旁路必须有人工确认或明确 review 记录。

---

## 13. 规律晋升规则

### 13.1 Candidate 生成

来源：

```text
1. EvaluationGraph 统计结果。
2. InsightExplorationGraph 总结。
3. 用户手动输入观察。
4. FailureMemory 反向提炼。
```

---

### 13.2 Candidate 晋升 Testing

可以自动发生，但必须满足：

```text
1. 有明确 scope。
2. 有明确 conditions。
3. 有明确 invalidations。
4. 有初步 evidence。
5. 不与 active warning 冲突。
```

---

### 13.3 Testing 晋升 Active

MVP 阶段必须用户确认。

要求：

```text
1. 样本量达到最低要求。
2. 有 outcome 统计。
3. 有反方验证。
4. 有失效条件。
5. 有最近表现。
6. 用户确认。
```

---

### 13.4 Active 降级 Degraded

可以自动发生。

触发条件：

```text
1. 最近 N 次表现低于历史 baseline。
2. false_positive 明显增加。
3. invalidated_quickly 明显增加。
4. 市场 regime 改变。
5. 与 failure_memory 冲突。
```

---

### 13.5 Degraded 恢复 Active

MVP 阶段必须用户确认。

要求：

```text
1. 最近表现恢复。
2. 失效原因已解释。
3. 条件范围已修正。
4. 用户确认。
```

---

## 14. 记忆检索方式

系统不应只依赖向量搜索。

需要三类检索。

---

### 14.1 结构化检索

用于找可靠规律：

```sql
symbol = 'TSLA'
setup_name = 'VWAP_RECLAIM'
status = 'active'
timeframe = '5m'
```

适合：

```text
1. active pattern 查询
2. degraded pattern 查询
3. outcome 统计
4. failure warning 查询
```

---

### 14.2 相似案例检索

用于寻找历史 analog：

```text
current feature snapshot
  ↓
similar historical feature snapshots
  ↓
historical outcome windows
```

适合：

```text
1. 当前行情与历史相似案例对比。
2. 判断当前 setup 的历史胜率。
3. 查找类似波动环境下的后续走势。
```

MVP 可以先不实现复杂相似度算法，但 schema 要保留扩展空间。

---

### 14.3 语义检索

用于研究和解释：

```text
“高开后承接失败”
“QQQ 弱势时的 TSLA 假突破”
“财报后第二天冲高回落”
```

MVP 可以先不实现向量库。
优先实现结构化检索。

---

## 15. MemoryGraph 设计

### 15.1 节点列表

```text
record_decision_memory
record_outcome_memory
evaluate_pattern_performance
generate_insight_candidate
validate_insight_candidate
promote_to_pattern_memory
degrade_or_invalidate_pattern
build_cli_context_pack
```

---

### 15.2 MVP 必做节点

```text
1. record_decision_memory
2. record_outcome_memory
3. generate_insight_candidate
4. promote_to_pattern_memory
5. build_cli_context_pack
```

---

### 15.3 节点说明

#### record_decision_memory

输入：

```text
DecisionEnvelope
```

输出：

```text
decision_memories row
```

要求：

```text
所有 DecisionEnvelope 都必须写入。
```

---

#### record_outcome_memory

输入：

```text
decision_id
outcome_window
future price window
```

输出：

```text
outcome_memories row
```

要求：

```text
MFE / MAE 等指标必须由确定性代码计算。
```

---

#### generate_insight_candidate

输入：

```text
outcome statistics
decision memories
failure memories
```

输出：

```text
insight_candidate
```

要求：

```text
candidate 不能直接当成 active pattern。
```

---

#### promote_to_pattern_memory

输入：

```text
insight_candidate
user_confirmed
```

输出：

```text
pattern_memory
```

要求：

```text
MVP 阶段 user_confirmed 必须为 true 才能晋升 active。
```

---

#### build_cli_context_pack

输入：

```text
trading_mandate
watchlist
active_patterns
degraded_patterns
active_warnings
recent_decisions
```

输出：

```text
.runtime/context/context_pack.md
session_context_packs row
```

---

## 16. 写入规则

### 16.1 Decision 写入

每个 `DecisionEnvelope` 都必须写入 `decision_memories`。

禁止只写 alert。
即使 action = blocked，也需要写入。

---

### 16.2 Outcome 写入

每个 decision 至少支持一个 outcome window：

```text
30m
2h
1d
```

---

### 16.3 Pattern 写入

Pattern 写入必须包含：

```text
claim
scope
conditions
invalidations
evidence
confidence
status
version
```

---

### 16.4 Failure 写入

以下情况必须写入 failure memory：

```text
data_quality_failed
source_conflict
llm_explanation_error
risk_gate_missed
setup_invalidated_quickly
pattern_degraded
```

---

## 17. 读取规则

### 17.1 CLI 启动读取

CLI 启动必须读取：

```text
.runtime/context/context_pack.md
```

如果文件不存在，则先运行：

```bash
trader memory bootstrap --profile default
```

---

### 17.2 Agent 分析时读取

Agent 进行市场分析前，应读取：

```text
1. trading mandate
2. active patterns for symbols
3. degraded patterns for symbols
4. active warnings
5. recent decisions
```

---

### 17.3 MarketMonitorGraph 读取

MarketMonitorGraph 运行时，应读取：

```text
1. watchlist
2. active patterns
3. degraded patterns
4. active warnings
5. data source health
```

这些信息用于：

```text
1. setup 优先级调整。
2. risk gate 检查。
3. evidence graph 构建。
4. 避免重复触发已知失效模式。
```

---

## 18. 记忆冲突处理

### 18.1 冲突类型

```text
1. 旧规律 active，但最近表现 degraded。
2. 不同 pattern 对同一 setup 给出相反解释。
3. FailureMemory 与 PatternMemory 冲突。
4. 数据源错误污染了旧规律。
```

---

### 18.2 处理方式

```text
1. 不删除旧记忆。
2. 标记 conflict。
3. 降级相关 pattern。
4. 生成 review task。
5. 在 context_pack 中提示。
```

---

### 18.3 冲突示例

```text
Pattern:
TSLA VWAP Reclaim 在 QQQ 上方 VWAP 时表现较好。

FailureMemory:
最近 10 次 TSLA VWAP Reclaim 中，QQQ 虽然在 VWAP 上方，但成交量显著衰退，false_positive 增加。

处理：
1. 不删除 Pattern。
2. 标记 Pattern degraded。
3. 新增条件：volume_ratio 不能快速下降。
4. 在 context_pack 中提示该 pattern 表现衰退。
```

---

## 19. 记忆膨胀处理

### 19.1 原则

```text
原始数据可以长期保存。
上下文只能加载高相关切片。
```

---

### 19.2 策略

```text
1. archived pattern 默认不进入 context_pack。
2. old decisions 只保留摘要进入 context_pack。
3. raw market data 不进入 context_pack。
4. high-frequency features 可以重算，不必全部长期放 SQLite。
5. pattern memory 保留版本历史。
```

---

### 19.3 Context Pack 限制

Context Pack 应保持可读和稳定。

建议限制：

```text
Active Patterns：最多 10 条
Degraded Patterns：最多 10 条
Active Warnings：最多 20 条
Recent Decisions：最多 20 条摘要
Raw Market Data：不允许进入
```

---

## 20. MVP 完成定义

Memory System MVP 完成后必须做到：

```text
1. DecisionEnvelope 可以写入 decision_memories。
2. Outcome label 可以写入 outcome_memories。
3. Insight candidate 可以生成并保存。
4. Pattern 可以 candidate / testing / active / degraded / invalidated / archived。
5. FailureMemory 可以保存 active_warning。
6. context_pack.md 可以生成。
7. CLI Agent 可以读取 context_pack.md。
8. 下一次会话能恢复之前保存的规律和失败教训。
```

---

## 21. 下一步

阅读并实现：

```text
04_database_schema.md
```

重点完成：

```text
1. market_snapshots
2. feature_snapshots
3. setup_events
4. decision_memories
5. outcome_memories
6. insight_candidates
7. pattern_memories
8. failure_memories
9. session_context_packs
```