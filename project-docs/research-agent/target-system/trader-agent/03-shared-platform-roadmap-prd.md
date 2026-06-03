# 03 — Shared Platform Layer 与实施路线 PRD

版本：`v0.2`  
文档定位：共享基础设施、数据库 Schema、RulePack、开发路线、MVP 验收标准。  
当前边界：本文仍作为 Shared Platform / Schema 的历史规格来源；Web Cockpit 路线已移除，当前 operator surface 是 workflow runtime、CLI/TUI 和 backend API。
建议读者：平台工程 agent、后端基础设施 agent、DevOps agent、数据库 agent。

---

# Part 4：Layer 3 PRD — Shared Platform Layer

---

## 1. Layer 3 总目标

Shared Platform Layer 是 Agent Core、workflow runtime、CLI/TUI operator interface 和 backend API 之间的基础设施层。它负责：

```text
数据存储
实时事件
任务调度
API 网关
工具网关
权限管理
审计日志
缓存
向量检索
错误处理
配置管理
```

### 1.1 技术栈分层原则

本系统不把 PostgreSQL、Redis、Vector DB、分布式 worker 作为第一版硬依赖。第一版的核心目标是跑通“语料导入 → 结构化事件 → 市场上下文 → setup → rule/risk → signal → 解释”的闭环。

```text
MVP-lite：
SQLite 或本地文件型存储
进程内缓存
本地事件日志
单进程 APScheduler
本地 Tool Adapter

Production-ready：
PostgreSQL
Redis
Vector DB
Celery / Prefect worker
集中式 Tool Gateway
```

升级触发条件：

```text
1. 数据量或查询复杂度超过 SQLite / 本地文件可维护范围。
2. 需要多用户同时访问 cockpit。
3. 需要多进程 worker 或跨机器任务调度。
4. WebSocket / SSE 事件需要跨进程广播。
5. tool rate limit、approval、audit 需要跨服务共享状态。
6. playbook / historical case 检索需要大规模向量索引。
```

---

## 2. 模块总览

```text
Shared Platform Layer
├── 1. Database Layer
├── 2. Cache & Pub/Sub
├── 3. Vector Store
├── 4. REST API Gateway
├── 5. WebSocket Event Bus
├── 6. SSE Streaming Layer
├── 7. Scheduler & Worker Queue
├── 8. Tool Gateway
├── 9. Auth & Permission Service
├── 10. Audit Logging Service
├── 11. Configuration Service
├── 12. Secrets Management
├── 13. Error Handling & Retry
├── 14. Observability
└── 15. Backup & Migration
```

---

## 3. 模块 1：Database Layer

### 3.1 功能目标

提供核心数据持久化。MVP-lite 可使用 SQLite 或本地文件型存储承载逻辑 schema；生产化再迁移 PostgreSQL。文档中的 SQL 表是逻辑数据模型，不代表第一版必须直接使用 PostgreSQL。

### 3.2 核心表

```text
trader_raw_messages
trader_semantic_events
market_context_snapshots
event_outcomes
playbooks
playbook_examples
signals
signal_outcomes
trade_tickets
rule_versions
rule_proposals
rule_candidates
rule_candidate_evidence_requirements
lite_backtest_reports
human_feedback
agent_messages
agent_events
agent_tasks
agent_rules
agent_capabilities
approval_requests
tool_call_logs
agent_runs
learning_summaries
failure_cases
```

### 3.3 验收标准

```text
1. 所有表有 migration。
2. 所有核心对象有 created_at / updated_at。
3. 高频查询字段有索引。
4. signal、task、agent_event 可以按时间查询。
5. 支持回滚 migration。
6. MVP-lite 可以在不启动 PostgreSQL 的情况下完成本地闭环。
```

### 3.4 MVP-lite Storage Contract

详细 SQL 使用 PostgreSQL 风格表达逻辑模型。MVP-lite 实现必须使用以下类型映射，避免 SQLite 和 PostgreSQL 路线摇摆：

| Logical Type | SQLite MVP-lite | PostgreSQL Production |
|---|---|---|
| UUID | `TEXT`，由应用层生成 UUID 字符串 | `UUID` |
| TIMESTAMPTZ | ISO-8601 `TEXT`，由应用层写入 | `TIMESTAMPTZ` |
| JSONB | `TEXT` 保存 JSON 字符串，或 SQLAlchemy JSON adapter | `JSONB` |
| NUMERIC | `REAL` 或 decimal string，按字段精度选择 | `NUMERIC` |
| BOOLEAN | `INTEGER` 0/1 | `BOOLEAN` |
| DEFAULT now() | 应用层写入 `created_at` / `updated_at` | `DEFAULT now()` |

开发 agent 必须先实现逻辑模型和 repository contract，再绑定具体数据库方言。

---

## 4. 模块 2：Cache & Pub/Sub

### 4.1 功能目标

提供缓存、实时状态和事件发布。MVP-lite 默认使用进程内缓存和本地事件日志；Redis 是多进程、多用户或远程部署后的升级组件。

### 4.2 用途

```text
market snapshot cache
active signal cache
task running state
rate limit counters
websocket pub/sub
tool call cache
approval pending cache
```

### 4.3 验收标准

```text
1. MarketSnapshot 可缓存。
2. MVP-lite 不依赖 Redis 也能完成单进程扫描和 dashboard 刷新。
3. WebSocket 事件在生产化部署中可通过 Redis pub/sub 分发。
4. Rate limit 在生产化部署中可使用 Redis 计数。
5. Redis 挂掉时系统降级但不崩溃。
```

---

## 5. 模块 3：Vector Store

### 5.1 功能目标

支持交易员语料、playbook 和历史案例检索。

### 5.2 数据类型

```text
raw message embedding
semantic event embedding
playbook embedding
failure case embedding
reflection summary embedding
```

### 5.3 API

```text
POST /api/vector/upsert
POST /api/vector/search
```

### 5.4 验收标准

```text
1. 可通过 symbol + setup + context 搜索相似案例。
2. 检索结果包含 source_id 和 similarity。
3. 可更新 embedding。
4. 可删除无效文档。
```

---

## 6. 模块 4：REST API Gateway

### 6.1 功能目标

为前端和 agent 提供统一 API。

### 6.2 API 分类

```text
Corpus API
Extraction API
Market API
Signals API
Tickets API
Playbooks API
Tasks API
Rules API
Capabilities API
Approvals API
Learning API
Chat API
Audit API
```

### 6.3 验收标准

```text
1. 所有 API 有统一错误格式。
2. 所有写操作有 audit log。
3. API 支持分页、过滤、排序。
4. API schema 可自动生成文档。
```

---

## 7. 模块 5：WebSocket Event Bus

### 7.1 功能目标

实时推送 agent 和市场事件。

### 7.2 事件格式

```typescript
type RealtimeEvent = {
  event_id: string;
  event_type: string;
  timestamp: string;
  source: string;
  scope?: {
    symbol?: string;
    signal_id?: string;
    task_id?: string;
    rule_id?: string;
    approval_id?: string;
  };
  payload: Record<string, unknown>;
  priority?: "info" | "watch" | "action_required" | "risk" | "critical";
};
```

### 7.3 Channel

```text
/ws/events
/ws/signals
/ws/agent
/ws/tasks
/ws/approvals
```

### 7.4 验收标准

```text
1. 前端可实时收到 signal.updated。
2. 断线后可重连。
3. 支持事件去重。
4. 支持按用户权限过滤事件。
```

---

## 8. 模块 6：SSE Streaming Layer

### 8.1 功能目标

支持 agent chat 流式回复。

### 8.2 用途

```text
agent chat response
long-running deep search summary
reflection report streaming
```

### 8.3 验收标准

```text
1. 用户提问后可以逐步显示回答。
2. 连接中断可以终止当前回复。
3. 回复完成后保存 chat thread。
```

---

## 9. 模块 7：Scheduler & Worker Queue

### 9.1 功能目标

运行定时任务和后台任务。

### 9.2 任务类型

```text
daily learning job
weekly reflection job
market monitor
signal monitor
outcome labeling
tool refresh
rule backtest
news watch
```

### 9.3 验收标准

```text
1. 支持 cron。
2. 支持 interval。
3. 支持手动触发。
4. 任务失败可重试。
5. 任务状态写入 agent_tasks / agent_events。
```

---

## 10. 模块 8：Tool Gateway

### 10.1 功能目标

统一代理外部 API 和 MCP tools。

### 10.2 功能

```text
tool registry
schema validation
permission check
rate limit
cost policy
approval check
retry
timeout
logging
fallback
```

### 10.3 ToolCallLog 字段

```text
tool_name
input_summary
output_summary
status
duration_ms
error
cost_estimate
called_by_task
called_by_signal
timestamp
```

### 10.4 验收标准

```text
1. 所有工具调用经过 Tool Gateway。
2. 未授权工具无法调用。
3. deep search 可触发 approval。
4. 工具失败有错误日志。
```

---

## 11. 模块 9：Auth & Permission Service

### 11.1 功能目标

控制用户、agent、工具和审批权限。

### 11.2 权限类型

```text
view_dashboard
create_task
modify_rule
approve_ticket
approve_tool_call
enable_capability
override_risk
view_audit
```

### 11.3 验收标准

```text
1. 不同用户可有不同权限。
2. 高风险操作需要权限。
3. 所有审批记录用户 ID。
```

---

## 12. 模块 10：Audit Logging Service

### 12.1 功能目标

记录所有关键行为，保证可审计。

### 12.2 需要审计

```text
agent run
tool call
rule change
task change
capability change
approval decision
risk block
ticket generation
user feedback
```

### 12.3 验收标准

```text
1. 所有写操作可追踪。
2. 所有 tool call 可追踪。
3. 所有审批可追踪。
4. audit log 不可随意删除。
```

---

## 13. 模块 11：Configuration Service

### 13.1 功能目标

管理系统配置。

### 13.2 配置类型

```text
universe config
ticker profile
risk config
rulepack config
tool config
dashboard config
notification config
```

### 13.3 验收标准

```text
1. RulePack 可版本化。
2. 配置变更可审计。
3. 配置支持环境区分：dev / staging / prod。
```

---

## 14. 模块 12：Secrets Management

### 14.1 功能目标

安全管理 API key。

### 14.2 管理对象

```text
Longbridge credentials
Alpha Vantage key
Unusual Whales key
News API key
LLM API key
Database credentials
```

### 14.3 验收标准

```text
1. API key 不进入前端。
2. API key 不写入普通日志。
3. 配置可按环境隔离。
```

---

## 15. 模块 13：Error Handling & Retry

### 15.1 功能目标

系统稳定处理失败。

### 15.2 需要处理

```text
market data timeout
tool call failure
LLM extraction failure
database error
websocket disconnect
worker failure
rate limit exceeded
approval expired
```

### 15.3 验收标准

```text
1. 工具失败不会让整个 agent run 崩溃。
2. 失败事件写入 agent_events。
3. 可配置重试次数。
4. 前端能看到失败状态。
```

---

## 16. 模块 14：Observability

### 16.1 功能目标

监控系统健康。

### 16.2 指标

```text
agent runs per day
tool calls per day
tool failure rate
average tool latency
signal count
approval count
websocket connected clients
worker queue length
daily learning duration
```

### 16.3 验收标准

```text
1. 有基础 metrics endpoint。
2. agent run 可按 run_id 追踪。
3. 错误可按模块聚合。
```

---

## 17. 模块 15：Backup & Migration

### 17.1 功能目标

保护数据和支持版本升级。

### 17.2 内容

```text
database migration
scheduled backup
vector store backup
rulepack version backup
restore process
```

### 17.3 验收标准

```text
1. 数据库支持 migration。
2. 核心表可备份。
3. RulePack 可回滚。
```

---

# Part 5：共享数据库核心 Schema

以下为 MVP 必须实现的核心表。

---

## 1. trader_raw_messages

```sql
CREATE TABLE trader_raw_messages (
    id UUID PRIMARY KEY,
    source TEXT NOT NULL,
    source_url TEXT,
    author TEXT,
    timestamp TIMESTAMPTZ NOT NULL,
    raw_text TEXT NOT NULL,
    attachments JSONB,
    reply_to UUID,
    imported_at TIMESTAMPTZ DEFAULT now(),
    content_hash TEXT UNIQUE
);
```

---

## 2. trader_semantic_events

```sql
CREATE TABLE trader_semantic_events (
    id UUID PRIMARY KEY,
    raw_message_id UUID REFERENCES trader_raw_messages(id),
    timestamp TIMESTAMPTZ NOT NULL,

    symbol TEXT,
    aliases JSONB,
    asset_class TEXT,

    action TEXT,
    direction TEXT,
    timeframe TEXT,
    instrument TEXT,

    setup_hint TEXT,
    entry_condition TEXT,
    invalidation TEXT,
    target TEXT,
    stop TEXT,

    thesis TEXT,
    catalyst JSONB,
    risk_notes JSONB,

    language_strength TEXT,
    confidence NUMERIC,

    extractor_version TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 3. market_context_snapshots

```sql
CREATE TABLE market_context_snapshots (
    id UUID PRIMARY KEY,
    event_id UUID REFERENCES trader_semantic_events(id),
    timestamp TIMESTAMPTZ NOT NULL,
    symbol TEXT NOT NULL,

    symbol_price NUMERIC,
    symbol_vwap NUMERIC,
    symbol_above_vwap BOOLEAN,
    symbol_relative_strength_vs_qqq NUMERIC,
    symbol_relative_volume NUMERIC,

    spy_state JSONB,
    qqq_state JSONB,
    vix_state JSONB,
    btc_state JSONB,
    eth_state JSONB,

    news_summary JSONB,
    options_summary JSONB,

    context_builder_version TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 4. event_outcomes

```sql
CREATE TABLE event_outcomes (
    id UUID PRIMARY KEY,
    event_id UUID REFERENCES trader_semantic_events(id),
    symbol TEXT NOT NULL,

    return_30m NUMERIC,
    return_1h NUMERIC,
    return_eod NUMERIC,
    return_1d NUMERIC,
    return_3d NUMERIC,
    return_5d NUMERIC,
    return_10d NUMERIC,

    mfe NUMERIC,
    mae NUMERIC,

    outperformed_qqq BOOLEAN,
    hit_stop BOOLEAN,
    hit_target BOOLEAN,

    final_label TEXT,
    notes TEXT,

    calculated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 5. playbooks

```sql
CREATE TABLE playbooks (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,

    symbols JSONB,
    setup_type TEXT,
    required_market_regime JSONB,
    required_conditions JSONB,
    invalidation_conditions JSONB,

    preferred_timeframe TEXT,
    preferred_instrument JSONB,

    historical_win_rate NUMERIC,
    avg_return NUMERIC,
    avg_mfe NUMERIC,
    avg_mae NUMERIC,
    sample_size INTEGER,
    confidence NUMERIC,

    version TEXT,
    status TEXT,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 6. signals

```sql
CREATE TABLE signals (
    id UUID PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    setup_type TEXT NOT NULL,

    score NUMERIC,
    status TEXT,

    market_gate TEXT,
    trader_playbook_match NUMERIC,

    entry_trigger TEXT,
    invalidation TEXT,
    preferred_instrument TEXT,

    evidence JSONB,
    risk_flags JSONB,
    tool_outputs JSONB,

    rule_version TEXT,
    agent_version TEXT
);
```

---

## 7. trade_tickets

```sql
CREATE TABLE trade_tickets (
    id UUID PRIMARY KEY,
    signal_id UUID REFERENCES signals(id),

    symbol TEXT NOT NULL,
    direction TEXT NOT NULL,
    instrument TEXT NOT NULL,
    timeframe TEXT NOT NULL,

    entry_plan TEXT,
    stop_plan TEXT,
    target_1 TEXT,
    target_2 TEXT,

    max_loss_nav_pct NUMERIC,
    position_size_rule TEXT,

    status TEXT,
    rationale JSONB,
    invalidation JSONB,

    created_at TIMESTAMPTZ DEFAULT now(),
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ
);
```

---

## 8. agent_messages

```sql
CREATE TABLE agent_messages (
    id UUID PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),

    priority TEXT NOT NULL,
    type TEXT NOT NULL,

    title TEXT NOT NULL,
    body TEXT NOT NULL,

    scope JSONB,
    evidence JSONB,
    risk_flags JSONB,
    actions JSONB,

    requires_ack BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ
);
```

---

## 9. agent_events

```sql
CREATE TABLE agent_events (
    id UUID PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT now(),

    run_id UUID,
    task_id UUID,
    signal_id UUID,
    symbol TEXT,

    event_type TEXT NOT NULL,
    status TEXT NOT NULL,

    title TEXT,
    summary TEXT,

    input_summary JSONB,
    output_summary JSONB,

    tool_name TEXT,
    duration_ms INTEGER,
    error TEXT
);
```

---

## 10. agent_tasks

```sql
CREATE TABLE agent_tasks (
    id UUID PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    name TEXT NOT NULL,
    description TEXT,
    task_type TEXT NOT NULL,

    scope JSONB,
    schedule JSONB,
    triggers JSONB,
    allowed_tools JSONB,
    approval_policy JSONB,

    status TEXT NOT NULL
);
```

---

## 11. agent_rules

```sql
CREATE TABLE agent_rules (
    id UUID PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    name TEXT NOT NULL,
    description TEXT,

    rule_type TEXT NOT NULL,
    scope JSONB,
    condition JSONB,
    action JSONB,

    priority INTEGER DEFAULT 0,
    status TEXT NOT NULL,
    version TEXT NOT NULL
);
```

---

## 12. agent_capabilities

```sql
CREATE TABLE agent_capabilities (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,

    category TEXT NOT NULL,
    tool_name TEXT NOT NULL,

    permission_level TEXT NOT NULL,
    rate_limit JSONB,
    cost_policy JSONB,

    allowed_tasks JSONB,
    blocked_tasks JSONB,

    status TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 13. approval_requests

```sql
CREATE TABLE approval_requests (
    id UUID PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),

    request_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,

    requested_by TEXT NOT NULL,
    payload JSONB,

    risk_summary JSONB,
    evidence JSONB,

    status TEXT NOT NULL,
    expires_at TIMESTAMPTZ,

    decided_by TEXT,
    decided_at TIMESTAMPTZ,
    decision_note TEXT
);
```

---

## 14. human_feedback

```sql
CREATE TABLE human_feedback (
    id UUID PRIMARY KEY,

    object_type TEXT NOT NULL,
    object_id UUID NOT NULL,

    feedback_type TEXT NOT NULL,
    correction JSONB,
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 15. rule_candidates

```sql
CREATE TABLE rule_candidates (
    id UUID PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    source TEXT NOT NULL,
    source_ref JSONB,

    hypothesis TEXT NOT NULL,
    symbols JSONB NOT NULL,
    trigger_definition TEXT NOT NULL,
    entry_condition TEXT NOT NULL,
    exit_condition TEXT,
    invalidation TEXT NOT NULL,

    data_requirements JSONB NOT NULL,
    risk_notes JSONB,

    status TEXT NOT NULL,
    confidence NUMERIC,
    created_by TEXT NOT NULL,

    latest_report_id UUID,
    approval_request_id UUID,
    versioned_rule_id UUID
);
```

Allowed status:

```text
draft
evidence_required
backtest_pending
backtested
needs_more_data
rejected
pending_shadow_tracking
pending_manual_approval
manually_approved
versioned
archived
```

---

## 16. rule_candidate_evidence_requirements

```sql
CREATE TABLE rule_candidate_evidence_requirements (
    id UUID PRIMARY KEY,
    candidate_id UUID REFERENCES rule_candidates(id),
    created_at TIMESTAMPTZ DEFAULT now(),

    requirement_type TEXT NOT NULL,
    provider_capability TEXT NOT NULL,
    query_scope JSONB NOT NULL,
    required_quality JSONB,

    status TEXT NOT NULL,
    evidence_refs JSONB,
    gap_reason TEXT
);
```

Allowed status:

```text
missing
available
partial
conflicting
not_supported
```

---

## 17. lite_backtest_reports

```sql
CREATE TABLE lite_backtest_reports (
    id UUID PRIMARY KEY,
    candidate_id UUID REFERENCES rule_candidates(id),
    created_at TIMESTAMPTZ DEFAULT now(),

    data_window_start TIMESTAMPTZ NOT NULL,
    data_window_end TIMESTAMPTZ NOT NULL,
    sample_size INTEGER NOT NULL,

    trigger_logic JSONB NOT NULL,
    entry_logic JSONB NOT NULL,
    exit_logic JSONB,
    invalidation_logic JSONB NOT NULL,

    win_rate NUMERIC,
    avg_return NUMERIC,
    median_return NUMERIC,
    max_adverse_excursion NUMERIC,
    max_favorable_excursion NUMERIC,

    cost_model JSONB NOT NULL,
    spread_assumption TEXT,
    slippage_assumption TEXT,

    evidence_gaps JSONB,
    quality_flags JSONB,
    decision TEXT NOT NULL,
    reason TEXT NOT NULL,
    next_review_trigger TEXT
);
```

Allowed decision:

```text
needs_more_data
rejected
pending_shadow_tracking
pending_manual_approval
```

---

## 18. rule_proposals

```sql
CREATE TABLE rule_proposals (
    id UUID PRIMARY KEY,
    candidate_id UUID REFERENCES rule_candidates(id),
    report_id UUID REFERENCES lite_backtest_reports(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    title TEXT NOT NULL,
    proposed_rule JSONB NOT NULL,
    evidence_summary JSONB NOT NULL,
    risk_summary JSONB NOT NULL,
    status TEXT NOT NULL,

    approval_request_id UUID,
    version_id UUID
);
```

Allowed status follows the Rule Proposal state machine in `00-system-overview.md`.

---

## 19. rule_versions

```sql
CREATE TABLE rule_versions (
    id UUID PRIMARY KEY,
    proposal_id UUID REFERENCES rule_proposals(id),
    created_at TIMESTAMPTZ DEFAULT now(),

    version TEXT NOT NULL,
    rulepack_patch JSONB NOT NULL,
    migration_note TEXT NOT NULL,

    status TEXT NOT NULL,
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ
);
```

Allowed status:

```text
draft
approved
active
archived
rolled_back
```

`active` requires manual approval and explicit publish action. Lite backtest cannot set this status.

---

# Part 6：RulePack v0.1

第一版规则配置如下。

```yaml
version: "0.1.0"

universe:
  symbols:
    - SPY
    - QQQ
    - TSLA
    - NVDA
    - AAPL
    - COIN
    - BMNR

market_gate:
  risk_on:
    required:
      - qqq_above_vwap
      - spy_not_strong_risk_off

  risk_off:
    conditions:
      - qqq_below_vwap
      - spy_below_vwap
      - vix_rising

  high_beta_long_block:
    if:
      - qqq_risk_off
    symbols:
      - TSLA
      - NVDA
      - COIN
      - BMNR

setups:
  vwap_reclaim:
    enabled: true
    allowed_symbols:
      - TSLA
      - NVDA
      - COIN
      - QQQ
      - SPY
      - BMNR
    required:
      - symbol_reclaims_vwap
      - qqq_not_risk_off
      - relative_volume_gt_threshold
    thresholds:
      min_relative_volume: 1.5
      max_distance_from_vwap_atr: 0.75
    invalidation:
      - symbol_5m_close_below_vwap
      - qqq_loses_vwap

  relative_strength_pullback:
    enabled: true
    allowed_symbols:
      - TSLA
      - NVDA
      - AAPL
      - QQQ
    required:
      - symbol_outperforms_qqq
      - qqq_not_risk_off
      - pullback_not_high_volume_selloff
    invalidation:
      - relative_strength_turns_negative
      - symbol_breaks_20ema

  opening_range_breakout:
    enabled: true
    allowed_symbols:
      - SPY
      - QQQ
      - TSLA
      - NVDA
      - AAPL
      - COIN
    required:
      - opening_range_defined
      - break_above_opening_range_high
      - relative_volume_gt_threshold
      - qqq_confirms_direction
    thresholds:
      min_relative_volume: 1.5
    invalidation:
      - price_returns_inside_opening_range

  gap_hold:
    enabled: true
    allowed_symbols:
      - TSLA
      - NVDA
      - COIN
      - BMNR
    required:
      - gap_up
      - catalyst_exists
      - price_above_vwap_after_open
    invalidation:
      - gap_fills_quickly
      - price_loses_vwap
    symbol_specific:
      BMNR:
        required:
          - first_30m_hold_above_vwap
          - qqq_not_risk_off
          - crypto_not_weak
        risk_multiplier: 0.3

  daily_breakout_retest:
    enabled: true
    allowed_symbols:
      - SPY
      - QQQ
      - TSLA
      - NVDA
      - AAPL
    required:
      - daily_breakout_confirmed
      - retest_holds
      - qqq_not_risk_off
    invalidation:
      - daily_close_back_inside_base
      - break_below_20ema

scoring:
  weights:
    market_gate: 25
    trader_playbook_match: 20
    technical_structure: 25
    relative_strength: 15
    volume_confirmation: 10
    catalyst: 5
    options_confirmation: 5
    risk_penalty_max: -25

thresholds:
  watch: 70
  waiting_trigger: 80
  ticket: 85

risk:
  max_trade_risk_pct: 0.5
  max_daily_loss_pct: 1.2
  min_risk_reward: 1.5
  block_if_no_stop: true
  block_0dte_by_default: true
  symbol_risk_multiplier:
    SPY: 1.0
    QQQ: 0.9
    AAPL: 0.9
    NVDA: 0.7
    TSLA: 0.6
    COIN: 0.5
    BMNR: 0.3
```

---

# Part 7：开发任务拆解建议

以下任务可直接交给开发型 AI agent 逐步拆分实现。

---

## Phase 0：基础工程骨架

### 目标

建立可运行的项目基础。Phase 0 只要求本地闭环可启动，不要求先部署 PostgreSQL、Redis 或分布式 worker。

### Tasks

```text
0.1 创建 backend FastAPI 项目
0.2 创建 frontend Next.js 项目
0.3 创建本地数据库 schema / migration（默认 SQLite，保持 PostgreSQL 兼容模型）
0.4 创建缓存与事件抽象（默认进程内实现，Redis adapter 延后）
0.5 创建基础配置管理
0.6 创建日志系统
0.7 创建可选 docker-compose（用于生产化依赖，不阻塞本地 MVP）
0.8 创建 RulePack loader
```

### 验收

```text
后端可启动
前端可启动
本地数据库迁移成功
不启动 PostgreSQL / Redis 也能运行核心本地闭环
RulePack v0.1 可加载
```

---

## Phase 1：Agent Core MVP

### Tasks

```text
1.1 Corpus Ingestion Service
1.2 Semantic Extraction Service
1.3 Ticker Alias Resolver
1.4 Market Context Builder
1.5 Outcome Labeling Service
1.6 Playbook Engine v0
1.7 Market Snapshot Service
1.8 Setup Detection Engine
1.9 Rule Engine
1.10 Scoring Engine
1.11 Risk Engine
1.12 Signal Manager
1.13 Rule Discovery / Lite Backtest Engine minimal schema and API
```

### 验收

```text
能导入聊天记录
能抽取交易事件
能绑定市场上下文
能生成初始 playbook
能实时扫描固定股票池
能生成 signal
能创建 RuleCandidate 并生成 LiteBacktestReport
```

---

## Phase 2：Shared Platform MVP

### Tasks

```text
2.1 Database Layer production adapter
2.2 Redis Pub/Sub adapter
2.3 REST API Gateway
2.4 WebSocket Event Bus
2.5 SSE Chat Streaming
2.6 Scheduler
2.7 Tool Gateway
2.8 Audit Log
2.9 Approval Requests
```

### 验收

```text
Agent signal 可通过 WebSocket 推送
Agent action 可写入 agent_events
审批请求可创建和处理
工具调用可记录
```

---

## Phase 3：CLI/TUI Operator Interface

### Tasks

```text
3.1 Live Dashboard
3.2 Market Gate Bar
3.3 Watchlist Setup Board
3.4 Agent Inbox
3.5 Agent Chat
3.6 Agent Timeline
3.7 Signals Page
3.8 Approval Center
3.9 Trade Ticket Drawer
```

### 验收

```text
用户可实时看到 signal
用户可与 agent 对话
用户可看到 agent 动作
用户可审批 ticket 或工具调用
```

---

## Phase 4：Control Layer

### Tasks

```text
4.1 Task Center
4.2 Rule Studio
4.3 Capability Center
4.4 Temporary Rules
4.5 Tool Permission Guard
4.6 Rule Simulation
```

### 验收

```text
用户可创建任务
用户可创建规则
用户可授权或禁用工具
高风险工具调用需要审批
```

---

## Phase 5：Learning Layer

### Tasks

```text
5.1 Daily Learning Job
5.2 Weekly Reflection Job
5.3 Failure Case Library
5.4 Rule Proposal
5.5 Advanced Rule Backtest Queue
5.6 Rule Version Approval
5.7 Learning Center UI
```

### 验收

```text
每天生成 learning summary
每周生成 rule proposal
失败案例入库
规则升级需要回测和人工审批
长期表现复核可基于 Phase 1.5 的 LiteBacktestReport 继续扩展
```

---

## Phase 6：External Tools Expansion

### Tasks

```text
6.1 Longbridge SDK integration
6.2 yfinance historical integration
6.3 Alpha Vantage integration
6.4 News API integration
6.5 Web Search integration
6.6 Deep Search integration
6.7 Unusual Whales integration
6.8 Options Summary Service
```

### 验收

```text
工具统一经过 Tool Gateway
工具调用有权限控制
工具输出能进入 signal evidence
工具失败可降级
```

---

# Part 8：MVP 最终验收标准

系统 MVP 完成后，必须满足：

```text
1. 能导入交易员历史聊天记录。
2. 能抽取结构化交易事件。
3. 能识别 ticker、action、direction、setup_hint、language_strength。
4. 能把事件绑定当时市场上下文。
5. 能计算事件后续表现。
6. 能沉淀至少 3 个初始 playbook。
7. 能实时扫描 SPY、QQQ、TSLA、NVDA、AAPL、COIN、BMNR。
8. 能识别五类 setup。
9. 能生成 signal，并输出 watch / waiting_trigger / triggered / invalidated。
10. 能调用至少一个行情工具和一个新闻工具。
11. 能执行 Rule Engine 和 Risk Engine。
12. 能生成 trade ticket 草案，但不自动下单。
13. 能通过 WebSocket 推送 agent 主动消息。
14. Web 工作台能展示 signal、agent timeline、agent chat、approval。
15. 用户能创建任务、规则、工具权限。
16. 用户能审批高风险动作。
17. 用户能提交 human feedback。
18. 系统能生成 daily learning summary。
19. 系统能生成 weekly rule proposal。
20. 系统能为进入下一阶段的 rule candidate 生成 LiteBacktestReport。
21. 所有关键动作有 audit log。
```

---

# Part 9：最终系统定义

整个系统最终应形成以下闭环：

```text
交易员语料
    ↓
语义抽取
    ↓
市场上下文
    ↓
结果标注
    ↓
playbook 记忆
    ↓
实时市场匹配
    ↓
工具验证
    ↓
规则评分
    ↓
风控过滤
    ↓
signal / ticket
    ↓
Web 工作台交互
    ↓
用户反馈
    ↓
复盘学习
    ↓
规则建议
    ↓
回测验证
    ↓
人工审批
    ↓
规则版本升级
```

核心原则：

```text
交易员语料 = 认知核心
外部工具 = 验证能力
Rule Engine = 执行边界
Risk Engine = 最高权限
CLI/TUI Operator Interface = 人机协作入口
Reflection Engine = 自我成长机制
Shared Platform = 稳定运行基础
```

最终产品不是一个简单 bot，而是：

> **一个能理解顶级交易员语言、学习交易员 playbook、调用专业工具验证市场、发现固定股票池高胜率机会、接受用户实时控制，并通过复盘持续成长的专业交易 Agent 系统。**

---

## 附录 A：建议项目目录

```text
trader-agent/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── db/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   │   ├── corpus/
│   │   │   ├── extraction/
│   │   │   ├── market/
│   │   │   ├── playbooks/
│   │   │   ├── rules/
│   │   │   ├── scoring/
│   │   │   ├── risk/
│   │   │   ├── tools/
│   │   │   ├── reflection/
│   │   │   └── dashboard/
│   │   ├── workers/
│   │   └── main.py
│   ├── rulepacks/
│   │   └── v0.1.0.yaml
│   └── tests/
│
├── frontend/
│   ├── app/
│   │   ├── dashboard/
│   │   ├── ticker/
│   │   ├── signals/
│   │   ├── playbooks/
│   │   ├── journal/
│   │   ├── learning/
│   │   └── settings/
│   ├── components/
│   ├── lib/
│   └── stores/
│
├── mcp-server/
│   ├── tools/
│   ├── schemas/
│   └── server.py
│
├── docs/
│   ├── architecture.md
│   ├── rulepack.md
│   ├── api.md
│   └── data-model.md
│
└── docker-compose.yml
```

---

## 附录 B：关键工程原则

```text
1. LLM 负责理解，不负责最终执行。
2. Rule Engine 负责确定性判断。
3. Risk Engine 权限高于所有模块。
4. 所有 signal 必须可追溯。
5. 所有 tool call 必须经过 Tool Gateway。
6. 所有高风险动作必须审批。
7. 所有规则升级必须经过 proposal → backtest → approval → versioning。
8. Agent 自我学习必须受控，不允许黑箱自改策略。
9. 当前人机协作入口是 CLI/TUI operator interface，不是已移除的 Web Cockpit 路线。
10. MVP 先跑通闭环，再扩展工具和股票池。
```
