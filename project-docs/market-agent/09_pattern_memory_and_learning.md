# 09. Pattern Memory and Learning

## 1. 文档目的

本文档定义 `Permanent Memory Market Agent` 的规律记忆与学习闭环：

```text
InsightCandidate
PatternMemory
FailureMemory
Pattern 状态机
规律晋升 / 降级 / 失效 / 归档
```

本模块负责将 `OutcomeGraph` 和 `EvaluationGraph` 产生的统计结果、失败教训和规律候选转化为可长期复用的市场记忆。

注意：

> PatternMemory 不是交易信号本身，而是系统用于后续判断、证据构建、风险提示和 CLI 启动上下文恢复的长期经验库。

---

## 2. 核心定位

完整学习闭环：

```text
MarketMonitorGraph
  ↓
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
context_pack.md
  ↓
下一次 MarketMonitorGraph
```

`PatternMemory` 的核心价值：

```text
1. 保存已验证规律。
2. 保存规律适用条件。
3. 保存规律失效条件。
4. 保存规律历史表现。
5. 保存规律当前状态。
6. 防止 Agent 每次从零分析。
7. 防止 Agent 复述已经失效的旧规律。
```

---

## 3. 非目标

本模块不做：

```text
1. 不自动实盘交易。
2. 不自动生成订单。
3. 不承诺收益。
4. 不把 insight_candidate 直接当成有效规律。
5. 不让一次成功案例升级为 active pattern。
6. 不自动删除历史规律。
7. 不让 LLM 单独决定规律有效性。
8. 不用自然语言替代结构化 pattern。
```

---

## 4. 核心对象关系

```text
insight_candidates
  ↓ promote
pattern_memories
  ↓ degrade / invalidate / archive
failure_memories
  ↓ active warnings
session_context_packs
```

关系说明：

| 对象                   | 含义                 |
| -------------------- | ------------------ |
| `InsightCandidate`   | 规律候选，不代表有效         |
| `PatternMemory`      | 长期规律记忆，有状态、有版本、有证据 |
| `FailureMemory`      | 失败教训和风险提醒          |
| `SessionContextPack` | CLI 启动时加载的当前相关记忆   |

---

## 5. InsightCandidate

## 5.1 定义

`InsightCandidate` 是系统从 outcome 统计、复盘、失败记忆或用户观察中生成的规律候选。

它不是有效规律。

示例：

```json
{
  "source": "evaluation_graph",
  "hypothesis": "TSLA VWAP_RECLAIM performs better when QQQ is above VWAP and 5m volume_ratio exceeds 1.5.",
  "scope_json": {
    "symbol": "TSLA",
    "setup_name": "VWAP_RECLAIM",
    "timeframe": "5m",
    "market_state": "pullback_reclaim_attempt"
  },
  "evidence_json": {
    "sample_size": 42,
    "good_signal_rate": 0.62,
    "false_positive_rate": 0.21,
    "median_mfe": 0.014,
    "median_mae": -0.006
  },
  "status": "new"
}
```

---

## 5.2 来源

`InsightCandidate` 可来自：

```text
1. EvaluationGraph 统计结果。
2. OutcomeGraph 复盘结果。
3. FailureMemory 反向总结。
4. 用户手动输入观察。
5. LLM 基于结构化评估结果生成的假设初稿。
```

---

## 5.3 状态

`InsightCandidate.status` 枚举：

```text
new
testing
rejected
promoted
archived
```

状态说明：

| status     | 含义                 |
| ---------- | ------------------ |
| `new`      | 新生成，尚未验证           |
| `testing`  | 进入观察 / 纸交易验证阶段     |
| `rejected` | 证据不足或验证失败          |
| `promoted` | 已晋升为 PatternMemory |
| `archived` | 归档，不再处理            |

---

## 5.4 Candidate 生成最低要求

生成 `InsightCandidate` 时必须包含：

```text
1. hypothesis
2. scope_json
3. evidence_json
4. source
5. status
```

如果 evidence 不足，可以生成 `new`，但不能进入 `testing`。

---

## 6. PatternMemory

## 6.1 定义

`PatternMemory` 是系统长期保存的结构化规律。

每条 Pattern 必须回答：

```text
1. 规律主张是什么？
2. 适用于哪些标的？
3. 适用于哪些周期？
4. 适用于什么市场状态？
5. 触发条件是什么？
6. 失效条件是什么？
7. 样本证据是什么？
8. 最近表现如何？
9. 当前状态是什么？
10. 版本是多少？
```

---

## 6.2 PatternMemory Schema

```json
{
  "id": "pat_tsla_vwap_reclaim_risk_on_001",
  "name": "TSLA VWAP Reclaim in Risk-On Session",
  "claim": "When TSLA reclaims VWAP within the first 90 minutes while QQQ is above VWAP and 5m volume_ratio exceeds 1.5, continuation probability improves over baseline.",
  "scope_json": {
    "symbols": ["TSLA"],
    "setup_name": "VWAP_RECLAIM",
    "timeframe": "5m",
    "market_state": ["pullback_reclaim_attempt", "trend_up"],
    "session": "regular"
  },
  "conditions_json": [
    "price_crosses_above_vwap",
    "volume_ratio_5m > 1.5",
    "qqq_above_vwap",
    "no_active_data_quality_warning"
  ],
  "invalidations_json": [
    "two_5m_closes_below_vwap",
    "qqq_breaks_intraday_low",
    "volume_ratio_falls_below_0.8"
  ],
  "evidence_json": {
    "sample_size": 84,
    "good_signal_rate": 0.61,
    "false_positive_rate": 0.19,
    "median_mfe": 0.018,
    "median_mae": -0.007,
    "source_evaluation_id": "eval_20260610_001"
  },
  "performance_json": {
    "recent_sample_size": 20,
    "recent_good_signal_rate": 0.55,
    "recent_false_positive_rate": 0.25,
    "recent_median_mfe": 0.012,
    "recent_median_mae": -0.008
  },
  "confidence": "medium",
  "status": "active",
  "version": 3,
  "source_insight_id": "insight_001",
  "created_at": "2026-06-10T09:45:00-04:00",
  "updated_at": "2026-06-10T09:45:00-04:00",
  "last_reviewed_at": "2026-06-10T09:45:00-04:00"
}
```

---

## 6.3 必填字段

写入 `pattern_memories` 时必须包含：

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
created_at
updated_at
```

---

## 6.4 Pattern 不是交易指令

Pattern 只能用于：

```text
1. 提供 setup 检测上下文。
2. 提供 evidence graph 参考。
3. 提供 risk gate 参考。
4. 提供 failure warning 参考。
5. 进入 context_pack。
```

Pattern 不能直接变成：

```text
buy
sell
short
live_order
auto_order
```

---

## 7. Pattern 状态机

## 7.1 状态枚举

```text
candidate
testing
active
degraded
invalidated
archived
```

---

## 7.2 状态说明

| 状态            | 含义          | 是否进入 context_pack      |
| ------------- | ----------- | ---------------------- |
| `candidate`   | 新规律候选       | 否，除非 debug             |
| `testing`     | 观察 / 纸交易验证中 | 可进入 Testing Patterns   |
| `active`      | 当前有效规律      | 是                      |
| `degraded`    | 最近表现衰退      | 是，进入 Degraded Patterns |
| `invalidated` | 已失效         | 默认否                    |
| `archived`    | 历史归档        | 否                      |

---

## 7.3 标准状态路径

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

---

## 7.4 允许旁路

```text
candidate → archived
candidate → rejected insight
testing → archived
degraded → active
invalidated → testing
```

要求：

```text
1. 旁路必须有 review 记录。
2. degraded → active 必须用户确认。
3. invalidated → testing 必须用户确认。
4. archived 默认不再进入 context_pack。
```

---

## 8. 晋升规则

## 8.1 InsightCandidate → Testing

可以自动发生，但必须满足：

```text
1. hypothesis 明确。
2. scope_json 明确。
3. conditions_json 可构造。
4. invalidations_json 可构造。
5. evidence_json 不为空。
6. 不与 active warning 强冲突。
```

如果不满足：

```text
status = new
```

或：

```text
status = rejected
```

---

## 8.2 Testing → Active

MVP 阶段必须用户确认。

晋升为 active 前必须满足：

```text
1. sample_size 达到最低要求。
2. good_signal_rate 高于 baseline。
3. false_positive_rate 可接受。
4. median_mfe 明显大于 abs(median_mae)。
5. invalidation 条件明确。
6. 反方验证已记录。
7. 不存在 unresolved high severity failure warning。
8. 用户明确确认。
```

---

## 8.3 推荐样本量阈值

MVP 建议：

```text
sample_size < 20：只能作为 observation
sample_size >= 20：允许生成 insight_candidate
sample_size >= 50：允许 testing
sample_size >= 100：可考虑 active，但仍需用户确认
```

注意：

```text
样本量不是唯一标准。
必须结合市场 regime、时间窗口、false positive、MAE 和失效条件判断。
```

---

## 8.4 Active → Degraded

可以自动发生。

触发条件：

```text
1. 最近 N 次表现显著低于历史表现。
2. false_positive_rate 明显上升。
3. invalidated_quickly_rate 明显上升。
4. recent_median_mfe 下降。
5. recent_median_mae 恶化。
6. 与 active failure warning 冲突。
7. 市场 regime 改变后表现恶化。
```

处理：

```text
1. status = degraded
2. 写入 degraded reason
3. 更新 performance_json
4. 生成 failure_memory 或 active_warning
5. 进入 context_pack 的 Degraded Patterns
```

---

## 8.5 Degraded → Invalidated

可以自动发生，但需要保守处理。

触发条件：

```text
1. degraded 状态持续多个评估周期。
2. 最近表现持续低于 baseline。
3. false_positive_rate 继续上升。
4. 失效条件反复被触发。
5. 人工 review 后确认不再适用。
```

MVP 建议：

```text
自动建议 invalidated，但最终状态变更需要用户确认。
```

---

## 8.6 Invalidated → Archived

可以自动或手动发生。

条件：

```text
1. 不再作为当前市场规律使用。
2. 仅保留历史研究价值。
3. 不进入 context_pack。
```

---

## 9. Pattern 版本管理

## 9.1 版本号

每条 pattern 必须包含：

```text
version
```

初始值：

```text
1
```

---

## 9.2 需要递增版本的情况

```text
1. conditions_json 变化。
2. invalidations_json 变化。
3. scope_json 变化。
4. claim 变化。
5. evidence_json 大幅更新。
6. 从 degraded 恢复 active。
```

---

## 9.3 不需要递增版本的情况

```text
1. performance_json 常规更新。
2. last_reviewed_at 更新。
3. status 从 active → degraded。
```

是否递增版本可由实现配置。
MVP 建议：条件、范围、主张变化时递增版本。

---

## 10. FailureMemory 与 PatternMemory 的关系

## 10.1 FailureMemory 作用

FailureMemory 用于保存：

```text
1. 失败原因。
2. 风险提醒。
3. 已知误判模式。
4. 数据源问题。
5. 规律失效原因。
```

---

## 10.2 Failure 触发 Pattern 降级

如果 FailureMemory 与 active pattern 相关：

```text
1. active pattern 应进入 review。
2. 若失败反复出现，pattern 应降级 degraded。
3. failure lesson 应进入 context_pack。
```

---

## 10.3 示例

```json
{
  "failure_type": "false_breakout",
  "symbol": "TSLA",
  "setup_name": "OPENING_RANGE_BREAKOUT",
  "root_cause": "QQQ was below VWAP and volume faded after breakout",
  "lesson": "Do not confirm ORB when index confirmation is absent.",
  "affected_patterns_json": ["pat_tsla_orb_001"],
  "status": "active_warning"
}
```

对应处理：

```text
1. 如果 affected pattern 是 active，则检查最近表现。
2. 若 false_positive 增加，active → degraded。
3. 在 context_pack 的 Active Warnings 中加入 lesson。
```

---

## 11. Pattern 检索规则

## 11.1 Active Patterns

用于当前监控时：

```text
symbol in scope_json.symbols
setup_name matches
timeframe matches
status = active
```

---

## 11.2 Degraded Patterns

用于风险提醒：

```text
symbol in scope_json.symbols
setup_name matches
status = degraded
```

---

## 11.3 Invalidated Patterns

默认不进入实时判断。
仅在研究、复盘、debug 时使用。

---

## 11.4 Archived Patterns

默认不加载。
仅用于长期研究。

---

## 12. Pattern 如何进入 MarketMonitorGraph

`MarketMonitorGraph` 启动时通过 `session_context` 或 repository 读取：

```text
1. active_patterns
2. degraded_patterns
3. active_warnings
```

用途：

```text
1. SetupDetector：作为 setup 条件参考。
2. EvidenceGraphBuilder：作为支持或反方证据。
3. ContraCaseGenerator：生成反方验证。
4. RiskGate：发现 degraded pattern 冲突。
5. DecisionEnvelope：写入 risk_notes。
```

---

## 13. Pattern 如何进入 context_pack

`SessionContextBootstrap` 生成 context pack 时，应加载：

```text
1. 当前 watchlist 相关 active patterns
2. 当前 watchlist 相关 degraded patterns
3. active failure warnings
4. 最近重要 decisions
```

限制建议：

```text
Active Patterns：最多 10 条
Degraded Patterns：最多 10 条
Active Warnings：最多 20 条
Recent Decisions：最多 20 条摘要
```

---

## 14. Context Pack 输出示例

```markdown
# Trader Agent Context Pack

## Active Patterns

### TSLA VWAP Reclaim in Risk-On Session
- Status: active
- Confidence: medium
- Scope: TSLA / 5m / regular session
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
  - median_mfe: 0.018
  - median_mae: -0.007

## Degraded Patterns

### Opening Range Breakout on Weak Index Days
- Status: degraded
- Reason: recent false_positive_rate increased
- Required Behavior:
  - Do not confirm ORB if QQQ is below VWAP.

## Active Warnings

- Do not confirm ORB when index confirmation is absent.
- Avoid setup_confirmed during macro event windows.
- If source_conflict exists, block setup detection.
```

---

## 15. 用户确认门禁

## 15.1 必须确认的动作

```text
1. Testing → Active
2. Degraded → Active
3. Invalidated → Testing
4. Pattern 权重大幅上调
5. Active pattern 永久删除
6. 风控规则放宽
7. 允许 degraded pattern 参与高优先级 alert
```

---

## 15.2 可以自动执行的动作

MVP 可自动执行：

```text
1. Candidate → Testing
2. Active → Degraded
3. 生成 FailureMemory
4. 生成 InsightCandidate
5. 更新 performance_json
6. 将 active warning 写入 context_pack
```

但自动执行动作必须写入审计记录或 notes。

---

## 16. PatternMemory Repository 接口

推荐接口：

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

    def list_by_setup(
        self,
        setup_name: str,
        status: str | None = None,
    ) -> list[PatternMemory]:
        ...

    def update_status(
        self,
        pattern_id: str,
        status: str,
        reason: str | None = None,
    ) -> PatternMemory:
        ...

    def update_performance(
        self,
        pattern_id: str,
        performance_json: dict,
    ) -> PatternMemory:
        ...
```

---

## 17. InsightCandidate Repository 接口

推荐接口：

```python
class InsightCandidateRepository:
    def create(self, candidate: InsightCandidateCreate) -> InsightCandidate:
        ...

    def get(self, candidate_id: str) -> InsightCandidate | None:
        ...

    def list_by_status(self, status: str, limit: int = 100) -> list[InsightCandidate]:
        ...

    def mark_testing(self, candidate_id: str) -> InsightCandidate:
        ...

    def mark_rejected(self, candidate_id: str, reason: str) -> InsightCandidate:
        ...

    def mark_promoted(self, candidate_id: str, pattern_id: str) -> InsightCandidate:
        ...
```

---

## 18. FailureMemory Repository 接口

推荐接口：

```python
class FailureMemoryRepository:
    def create(self, failure: FailureMemoryCreate) -> FailureMemory:
        ...

    def list_active_warnings(self, symbols: list[str] | None = None) -> list[FailureMemory]:
        ...

    def list_by_setup(self, setup_name: str) -> list[FailureMemory]:
        ...

    def resolve(self, failure_id: str) -> FailureMemory:
        ...

    def archive(self, failure_id: str) -> FailureMemory:
        ...
```

---

## 19. CLI 命令建议

### 19.1 查看规律候选

```bash
trader memory insights --status new
```

---

### 19.2 查看活跃规律

```bash
trader memory patterns --status active
```

---

### 19.3 查看衰退规律

```bash
trader memory patterns --status degraded
```

---

### 19.4 晋升规律

```bash
trader memory promote-pattern --candidate-id insight_001
```

要求：

```text
1. 展示 candidate 证据。
2. 展示风险和反方。
3. 要求用户确认。
4. 确认后写入 pattern_memories。
```

---

### 19.5 降级规律

```bash
trader memory degrade-pattern --pattern-id pat_tsla_vwap_001 --reason "recent false_positive increased"
```

---

### 19.6 查看失败警告

```bash
trader memory failures --status active_warning
```

---

## 20. FastAPI 接口建议

### 20.1 查看 InsightCandidate

```http
GET /api/memory/insights?status=new
```

---

### 20.2 晋升 Pattern

```http
POST /api/memory/patterns/promote
```

请求：

```json
{
  "insight_candidate_id": "insight_001",
  "user_confirmed": true
}
```

响应：

```json
{
  "pattern_id": "pat_tsla_vwap_reclaim_001",
  "status": "active"
}
```

---

### 20.3 查看 Active Patterns

```http
GET /api/memory/patterns?status=active&symbol=TSLA
```

---

### 20.4 更新 Pattern 状态

```http
POST /api/memory/patterns/{pattern_id}/status
```

请求：

```json
{
  "status": "degraded",
  "reason": "recent false_positive_rate increased"
}
```

---

### 20.5 查看 FailureMemory

```http
GET /api/memory/failures?status=active_warning
```

---

## 21. LLM 使用边界

## 21.1 允许 LLM 参与

```text
1. 将 EvaluationResult 改写为 hypothesis。
2. 将 FailureMemory 总结为 lesson。
3. 将 PatternMemory 压缩为 context_pack 文案。
4. 生成反方验证初稿。
```

---

## 21.2 禁止 LLM 参与

```text
1. 计算 win rate。
2. 计算 MFE / MAE。
3. 判断 sample_size。
4. 直接决定 active pattern。
5. 绕过用户确认。
6. 修改原始行情事实。
7. 自动生成实盘交易权限。
```

---

## 22. 测试计划

### 22.1 PatternMemory 测试

必须覆盖：

```text
test_create_pattern_memory
test_pattern_required_fields
test_pattern_status_candidate
test_pattern_status_testing
test_pattern_status_active
test_pattern_status_degraded
test_pattern_status_invalidated
test_pattern_status_archived
test_list_active_patterns_by_symbol
test_list_degraded_patterns_by_symbol
test_update_pattern_status
test_update_pattern_performance
```

---

### 22.2 InsightCandidate 测试

必须覆盖：

```text
test_create_insight_candidate
test_insight_candidate_status_new
test_insight_candidate_mark_testing
test_insight_candidate_mark_rejected
test_insight_candidate_mark_promoted
test_promoted_candidate_has_pattern_id
```

---

### 22.3 FailureMemory 测试

必须覆盖：

```text
test_create_failure_memory
test_list_active_warnings
test_list_failures_by_setup
test_resolve_failure_memory
test_archive_failure_memory
```

---

### 22.4 晋升规则测试

必须覆盖：

```text
test_candidate_cannot_promote_without_confirmation
test_candidate_cannot_promote_without_evidence
test_candidate_promotes_to_active_with_confirmation
test_degraded_pattern_enters_context_pack
test_archived_pattern_does_not_enter_context_pack
```

---

## 23. Task 007：PatternMemory MVP

### 23.1 目标

实现规律记忆系统 MVP，使 insight_candidate 可以经过确认后晋升为 pattern_memory，并支持 active / degraded / invalidated / archived 状态。

---

### 23.2 范围

必须实现：

```text
1. InsightCandidateRepository
2. PatternMemoryRepository
3. FailureMemoryRepository
4. Pattern 状态机
5. promote-pattern CLI
6. degrade-pattern CLI
7. active / degraded pattern 查询
8. active warning 查询
```

---

### 23.3 不做

本任务不做：

```text
1. 不做实时行情获取。
2. 不做 MarketMonitorGraph。
3. 不做 OutcomeGraph。
4. 不做 live trading。
5. 不做向量数据库。
6. 不做复杂深度学习训练。
```

---

### 23.4 验收标准

Task 007 完成后必须满足：

```text
1. 可以创建 insight_candidate。
2. insight_candidate 默认不是 active pattern。
3. 用户确认后可以 promote 为 pattern_memory。
4. pattern_memory 支持 candidate / testing / active / degraded / invalidated / archived。
5. active pattern 可以被查询。
6. degraded pattern 可以被查询。
7. failure_memory 可以保存 active_warning。
8. active warning 可以被查询。
9. archived pattern 默认不进入 context_pack。
10. 所有状态变更有测试。
```

---

## 24. 下一步

阅读并实现：

```text
10_cli_context_bootstrap.md
```

重点完成：

```text
1. context_pack.md 生成
2. Active Patterns 加载
3. Degraded Patterns 加载
4. Active Warnings 加载
5. Recent Decisions 摘要
6. CLI 启动记忆恢复机制
```
