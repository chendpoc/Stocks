# 27. Order Agent — 交易执行层架构（预留）

> 状态: placeholder | 依赖: Phase 1-3 分析基建完成后 | 更新: 2026-06-11

## 1. 文档目的

Phase 1-3 构建的是**分析基建**——行情、Regime、Setup、证据、决策、复盘、记忆、因子发现。本文档预留在分析基建之上构建**交易执行层**——把 DecisionEnvelope 转化为下单信号，经过 Risk Engine 和 Human Approval，最终通过券商 API 执行。

**本文档是 placeholder**——不包含详细实现。等 Phase 1-3 分析基建稳定运行后，再展开为完整设计。

---

## 2. 完整闭环

```text
Phase 1-3（分析基建 — 已有）          Phase 4（交易执行 — 预留）

  Market Data                         
    ↓                                  
  Regime Detection                     
    ↓                                  
  Setup Scan                           
    ↓                                  
  build_evidence (多源)                
    ↓                                  
  generate_contra (反向辩论)            
    ↓                                  
  DecisionEnvelope                     
    ├→ model_decisions                 
    ↓                                  
  ┌─ OutcomeGraph (回标) ──────┐       
  │                             ↓       
  │  PatternMemory              Order Agent ← 预留
  │     ↓                        ├─ 读取 DecisionEnvelope
  │  Factor Discovery Pipeline   ├─ Risk Engine 评估
  └→ 反馈到下一轮                 ├─ 转化为下单信号
                                 ├─ Human Approval
                                 └─ → 券商 API 下单
                                      ↓
                                 Outcome (Triple Barrier 回标)
                                      ↓
                                 PatternMemory 更新
                                      ↓
                                 反馈到下一轮分析
```

---

## 3. Order Agent 核心架构

```text
Order Agent:
  ├─ Signal Generator: DecisionEnvelope → OrderCandidate
  ├─ Risk Engine: 仓位检查 + 敞口检查 + 相关性检查 + 连续亏损熔断
  ├─ Human Approval: 提交待审批 → 用户确认 → 执行
  └─ Order Executor: 券商 API 下单 → 回执 → 持久化
```

### 3.1 Signal Generator

```text
输入: DecisionEnvelope (已有)
  ├─ symbol + setup_name
  ├─ confidence_contribution (0.0-1.0)
  ├─ evidence_text + contra_text + risk_flags
  └─ market_regime

输出: OrderCandidate
  ├─ symbol
  ├─ direction: LONG | SHORT
  ├─ quantity: 股数（基于仓位配置计算）
  ├─ order_type: MARKET | LIMIT | STOP_LIMIT
  ├─ limit_price?: number
  ├─ stop_price?: number
  ├─ confidence: number (0.0-1.0)
  ├─ invalidation_condition: string
  └─ rationale: string（为什么这个信号应该被下单）
```

### 3.2 Risk Engine

```text
输入: OrderCandidate + 当前持仓状态

检查项:
  ├─ 单标的仓位上限: 不超过总资金的 X%
  ├─ 组合总敞口上限: 不超过总资金的 Y%
  ├─ 相关性检查: 新订单与现有持仓的相关性
  ├─ 连续亏损熔断: 最近 N 笔订单亏损 → 暂停
  ├─ 事件窗口检查: FOMC/财报日 降低信号权重
  ├─ Regime 适应性: 危机市场禁止新开仓
  └─ 滑点估算: ±0.5%/±1% 滑点下的净收益

输出: RiskAssessment
  ├─ approved: boolean
  ├─ adjusted_quantity?: number（风控调整后的数量）
  ├─ risk_score: number (0.0-1.0)
  ├─ warnings: string[]
  └─ block_reason?: string（如果被拒绝）
```

### 3.3 Human Approval

```text
流程:
  1. Order Candidate 通过 Risk Engine
  2. 推送到用户（CLI/Web/Slack/Electron 托盘）
  3. 展示: 信号摘要 + 证据 + 风险评分 + 建议下单量
  4. 用户操作:
     - /approve <order_id>     → 转交 Order Executor
     - /reject <order_id>      → 标记 rejected，记录原因
     - /adjust <order_id> Q=50 → 调整数量后批准
     - /ignore                  → 超过 TTL 自动过期
  5. 审批记录持久化到 order_approvals 表
```

**设计参照**：Shannon 的 Human Approval Workflow（26 号文档 §6）。

### 3.4 Order Executor

```text
输入: 已批准的 OrderCandidate

流程:
  1. 券商 API 下单
  2. 回执: order_id + fill_price + fill_quantity + status
  3. 持久化到 orders 表
  4. 触发 scheduled_outcome（Triple Barrier 回标）
  5. 通知用户: "TSLA 50股 @ 408.32 已成交"
```

**券商接口**：第一阶段 Longbridge（已有 22 个工具的集成基础），后续可扩展 Interactive Brokers / Alpaca。

---

## 4. 数据库扩展

Phase 4 需要新增表：

```sql
-- 订单候选
CREATE TABLE order_candidates (
    id TEXT PRIMARY KEY,
    decision_id TEXT NOT NULL REFERENCES model_decisions(id),
    symbol TEXT,
    direction TEXT,         -- LONG | SHORT
    quantity INTEGER,
    order_type TEXT,        -- MARKET | LIMIT | STOP_LIMIT
    limit_price REAL,
    stop_price REAL,
    confidence REAL,
    invalidation_condition TEXT,
    rationale TEXT,
    risk_score REAL,
    status TEXT,            -- pending_approval | approved | rejected | expired
    created_at TEXT NOT NULL
);

-- 审批记录
CREATE TABLE order_approvals (
    id TEXT PRIMARY KEY,
    order_candidate_id TEXT NOT NULL REFERENCES order_candidates(id),
    approved_by TEXT,       -- user_id 或 "auto"
    action TEXT,            -- approve | reject | adjust
    adjusted_quantity INTEGER,
    reason TEXT,
    created_at TEXT NOT NULL
);

-- 已执行订单
CREATE TABLE orders (
    id TEXT PRIMARY KEY,
    order_candidate_id TEXT REFERENCES order_candidates(id),
    broker_order_id TEXT,
    symbol TEXT,
    direction TEXT,
    requested_quantity INTEGER,
    filled_quantity INTEGER,
    fill_price REAL,
    commission REAL,
    status TEXT,            -- submitted | filled | partially_filled | cancelled | rejected
    created_at TEXT NOT NULL,
    filled_at TEXT
);
```

---

## 5. 与现有系统的衔接

| 现有组件 | Phase 4 如何使用 |
|---|---|
| `DecisionEnvelope` | Signal Generator 的输入 |
| `RiskGate` (07 号文档) | 扩展到 Order Agent 的 Risk Engine |
| `OutcomeGraph` | Order 执行后触发 Triple Barrier 回标 |
| `PatternMemory` | Order 结果反哺规律评估 |
| `Daemon` | 定时扫描待审批订单 |
| `chatReAct` | Human Approval 的交互界面 |
| `Slack/Feishu Bot` (25 号文档) | 推送审批请求 |
| `Electron 桌面` (25 号文档) | 托盘通知 + 审批面板 |

---

## 6. 关键安全原则

| 原则 | 说明 |
|---|---|
| **绝不自动下单** | 所有订单必须通过 Human Approval——即使 Risk Engine 通过 |
| **审批 TTL** | 超过 TTL（默认 5 分钟）的审批请求自动过期——市场已变 |
| **连续亏损熔断** | N 笔连续亏损 → 暂停所有新订单生成 |
| **Risk Engine 独立** | Risk Engine 的否决权 > Signal Generator 的建议权 |
| **可审计** | 所有订单从生成 → 审批 → 执行 → 回标的完整链路可追溯 |
| **paper trading 先行** | 先跑纸交易（不做真实下单），积累 100+ 笔回标数据后再考虑实盘 |

---

## 7. 分阶段实施

```text
Phase 4a — Paper Trading（纸交易）:
  [ ] Signal Generator: DecisionEnvelope → OrderCandidate
  [ ] Risk Engine 基础版（仓位上限 + 连续亏损熔断）
  [ ] Order Executor（纸交易模式——不连券商，只记录）
  [ ] Order Outcome 回标
  [ ] 积累 100+ 笔纸交易数据

Phase 4b — Human Approval:
  [ ] 审批 UI（CLI + Web + Slack）
  [ ] 审批记录持久化
  [ ] TTL 过期机制

Phase 4c — 实盘对接:
  [ ] Risk Engine 完整版（相关性 + 事件窗口 + Regime + 滑点）
  [ ] Longbridge 下单 API 对接
  [ ] 最小仓位测试（1 股）
  [ ] 逐步放量

Phase 4d — 优化:
  [ ] 订单执行质量分析（滑点 vs VWAP）
  [ ] Risk Engine 参数自优化
  [ ] 多券商支持
```

---

## 8. 关键决策汇总

| 决策 | 选型 | 理由 |
|---|---|---|
| 自动下单 | **禁止** | 所有订单需 Human Approval |
| 纸交易先行 | **必须** | 100+ 笔回标后再实盘 |
| Risk Engine | 独立否决权 | Risk Engine > Signal Generator |
| 券商 | Longbridge 优先 | 已有 22 个工具的集成基础 |
| 审批通道 | CLI + Web + Slack/Feishu | 多端覆盖 |
| TTL | 5 分钟 | 市场变化快，过期信号无效 |
| 审计 | 全链路可追溯 | 从 DecisionEnvelope 到券商回执 |

---

## 9. 参考源

- 本仓库 `07_decision_envelope.md` — RiskGate 设计
- 本仓库 `08_outcome_and_evaluation.md` — Triple Barrier 回标
- 本仓库 `25_web_desktop_interface.md` — 桌面应用 + 消息 Bot
- 本仓库 `26_kocoro_architecture_reference.md` — Human Approval 参考
- Shannon Human Approval Workflow: https://github.com/Kocoro-lab/Shannon
