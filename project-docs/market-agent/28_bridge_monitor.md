# 28. Bridge Monitor — 券商连接与资产监控系统设计

> 状态: design | 依赖: `25_web_desktop_interface.md`, `27_order_agent_placeholder.md`, 现有 Longbridge 模块 | 优先级: Phase 2 | 更新: 2026-06-11

## 1. 文档目的

设计一个券商连接与资产监控系统（Bridge Monitor），它负责：

- **连接状态检查**：检测 Longbridge CLI/OpenAPI 的认证状态、市场连接状态，并在认证过期、市场断连时告警
- **资产/仓位快照**：定期获取用户持仓、账户资产、可用保证金等关键数据，为 Risk Engine 和 Order Agent 提供仓位上下文
- **异常熔断**：在连接丢失、资产异常变动时触发保护机制

---

## 2. 架构定位

```
Bridge Monitor (独立服务进程)
├─ LongbridgeProbe (认证检测 - 已有)
│   ├─ `longbridge check` → authOk, region, API status
│   └─ 定时检测 + 异常告警
│
├─ PositionSnapshot (持仓快照 - 新增)
│   ├─ `longbridge positions --json` → 持仓列表
│   └─ 定时获取 + 变更检测
│
├─ AccountSummary (账户概览 - 新增)
│   ├─ `longbridge portfolio --json` → 总资产/盈亏
│   ├─ `longbridge assets --json` → 购买力/保证金
│   └─ 定时获取 + 异常告警
│
└─ MonitorReporter (上报 + 熔断 - 新增)
    ├─ 上报到 Backend API (持久化)
    ├─ 推送到 Slack/Feishu/Electron
    └─ 触发 Risk Engine 熔断
```

---

## 3. 核心组件设计

### 3.1 LongbridgeProbe 扩展（连接状态监控）

**已有能力**（`longbridgeAgent.ts`）：
- `probeLongbridge()` — 检测 CLI 是否安装、认证是否有效
- `cachedProbe()` — 30 秒 TTL 缓存
- 启动时自动检测，失败则禁用 Longbridge Agent

**新增能力**：
```typescript
interface LongbridgeProbeExtended {
  // 已有
  installed: boolean;
  authOk: boolean;
  message: string;

  // 新增
  region: string;             // US | HK | CN
  apiStatus: string;          // ok | degraded | error
  tradeSession: string;       // pre_market | regular | after_hours | closed
  lastCheckedAt: string;      // ISO 时间戳
}
```

**实现方式**：
```bash
longbridge check --json
# 返回: { "region": "US", "auth": true, "api": "ok", "trade_session": "regular" }
```

### 3.2 PositionSnapshot（持仓快照）

**数据来源**：`longbridge positions --json`

**数据结构**：
```typescript
interface PositionSnapshot {
  timestamp: string;
  positions: Position[];
  totalMarketValue: number;
  totalUnrealizedPnl: number;
  totalUnrealizedPnlPct: number;
}

interface Position {
  symbol: string;
  market: string;             // US | HK | CN
  quantity: number;           // 持仓数量
  availableQuantity: number;  // 可卖数量
  avgCost: number;            // 平均成本
  currentPrice: number;       // 当前价格
  marketValue: number;        // 市值
  unrealizedPnl: number;      // 未实现盈亏
  unrealizedPnlPct: number;   // 未实现盈亏百分比
}
```

**快照频率**：
- 启动时：立即获取
- 运行时：每 5 分钟（可配置）
- 市场开盘期间：每 1 分钟
- 异常时：立即获取（用于熔断判断）

### 3.3 AccountSummary（账户概览）

**数据来源**：`longbridge portfolio --json` + `longbridge assets --json`

**数据结构**：
```typescript
interface AccountSummary {
  timestamp: string;
  totalAssets: number;         // 总资产
  netAssets: number;           // 净资产
  totalMarketValue: number;    // 持仓市值
  availableCash: number;       // 可用资金
  frozenCash: number;          // 冻结资金
  buyingPower: number;         // 购买力
  marginRatio: number;         // 保证金比例
  totalPnl: number;            // 总盈亏
  totalPnlPct: number;         // 总盈亏百分比
  dayPnl: number;              // 当日盈亏
  dayPnlPct: number;           // 当日盈亏百分比
}
```

---

## 4. 监控逻辑与熔断规则

### 4.1 连接状态监控

| 检测项 | 检测周期 | 异常阈值 | 告警动作 |
|---|---|---|---|
| CLI 安装 | 启动时 | 未安装 | 禁用 Longbridge Agent |
| 认证状态 | 启动时 / 每 5 分钟 | 认证过期 | 告警：`[Longbridge] 认证过期，请重新登录` |
| API 状态 | 每 1 分钟 | `degraded` / `error` | 告警 + 暂停 Order Agent |
| 市场连接 | 每 1 分钟 | 连接丢失 | 告警 + 暂停数据拉取 |

### 4.2 资产/仓位异常监控

| 检测项 | 检测方式 | 异常阈值 | 告警动作 |
|---|---|---|---|
| **总资产异常变动** | 与上一次快照对比 | 变动 > 5% | 告警：`[资产异常] 总资产变动 X%` |
| **单标的高仓位** | 单股票市值 / 总资产 | > 30% | 告警：`[仓位集中] TSLA 占组合 X%` |
| **连续亏损** | 最近 N 笔订单亏损 | 连续 5 笔亏损 | 熔断：暂停所有新订单生成 |
| **保证金风险** | `marginRatio` | > 80% | 告警：`[保证金风险] margin ratio = X%` |
| **可用资金不足** | `availableCash` vs 最小仓位要求 | < 最小仓位资金 | 告警：`[资金不足] 可用资金低于最小仓位要求` |

### 4.3 熔断机制

```
级别 1 — 降级（自动）:
  - 认证过期 → 禁用 Longbridge Agent
  - API degraded → 暂停实时数据拉取，使用缓存数据

级别 2 — 告警（自动 + 通知）:
  - 总资产异常变动 → 通知用户
  - 仓位集中度过高 → 通知用户
  - 保证金风险 → 通知用户

级别 3 — 熔断（自动 + 通知 + 暂停）:
  - 连续亏损 5 笔 → 暂停 Order Agent
  - 市场断连 → 暂停所有数据拉取 + Order Agent
  - 可用资金不足 → 暂停 Order Agent
```

---

## 5. 数据持久化

### 5.1 新增表

```sql
-- 连接状态快照
CREATE TABLE bridge_status_snapshots (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    bridge_type TEXT NOT NULL,   -- longbridge | ibkr | alpaca
    installed INTEGER NOT NULL,  -- 0 | 1
    auth_ok INTEGER NOT NULL,    -- 0 | 1
    api_status TEXT,             -- ok | degraded | error
    trade_session TEXT,          -- pre_market | regular | after_hours | closed
    message TEXT
);

-- 持仓快照
CREATE TABLE position_snapshots (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    snapshot_data TEXT NOT NULL, -- JSON: PositionSnapshot
    snapshot_hash TEXT            -- SHA256 用于快速对比
);

-- 账户快照
CREATE TABLE account_snapshots (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    snapshot_data TEXT NOT NULL, -- JSON: AccountSummary
    snapshot_hash TEXT            -- SHA256 用于快速对比
);

-- 监控事件
CREATE TABLE monitor_events (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    event_type TEXT NOT NULL,    -- connection | position | account | alert | circuit_breaker
    severity TEXT NOT NULL,      -- info | warning | critical
    message TEXT NOT NULL,
    details_json TEXT
);
```

### 5.2 Backend API

```
GET    /api/bridge/status            → 当前连接状态
GET    /api/bridge/positions         → 最新持仓快照
GET    /api/bridge/account           → 最新账户快照
GET    /api/bridge/events?limit=20   → 最近监控事件
POST   /api/bridge/refresh           → 手动触发刷新
```

---

## 6. 与现有系统的衔接

| 现有组件 | Bridge Monitor 如何使用 |
|---|---|
| `longbridgeAgent.ts` | 复用 `probeLongbridge()` 作为连接状态检测器 |
| `longbridgeCli.ts` | 复用 `runLongbridgeJson()` 执行 positions/portfolio/assets 命令 |
| `Daemon` | Daemon 启动时自动启动 Bridge Monitor；Daemon 定时触发快照刷新 |
| `Risk Engine` (Phase 4) | 读取持仓快照和账户概览，用于仓位检查、敞口检查、连续性亏损检测 |
| `Order Agent` (Phase 4) | 熔断时暂停 Order Agent；恢复时继续执行 |
| `Slack/Feishu Bot` (Phase 2) | 推送告警：认证过期、仓位异常、熔断事件 |
| `Electron 桌面` (Phase 2) | 托盘状态指示：连接状态、当日盈亏 |

---

## 7. 实施计划

```
Phase 2a — Bridge Monitor 基础 (主流程稳定后):
  [ ] LongbridgeProbe 扩展（region + apiStatus + tradeSession）
  [ ] 定时检测循环（Daemon 集成）
  [ ] 连接状态持久化 + API 端点

Phase 2b — 持仓/账户监控:
  [ ] PositionSnapshot 定时获取 + 持久化
  [ ] AccountSummary 定时获取 + 持久化
  [ ] 快照对比 + 异常检测规则

Phase 2c — 告警与熔断集成:
  [ ] 监控事件上报（Slack/Feishu/Electron）
  [ ] 熔断规则实现（降级/告警/熔断三级）
  [ ] 与 Risk Engine 接口对接

Phase 4 — 与 Order Agent 联调:
  [ ] 下单前自动触发持仓快照刷新
  [ ] 下单后立即更新持仓
  [ ] 连续性亏损检测与自动熔断
```

---

## 8. 关键决策汇总

| 决策 | 选型 | 理由 |
|---|---|---|
| 连接检测方式 | `longbridge check --json` | 已有 CLI 命令，无需额外 API 调用 |
| 快照频率 | 市场开盘 1 分 / 收盘 5 分 | 避免 API 限流，开盘时需要更及时的数据 |
| 异常检测方式 | 快照对比（差值 > 阈值） | 避免复杂逻辑，降低误报 |
| 熔断级别 | 3 级（降级/告警/熔断） | 区分轻重缓急，避免过度反应 |
| 持久化 | SQLite（bridge_status/position/account snapshots） | 与现有架构一致 |

---

## 9. 参考源

- 本仓库 `apps/trader-cli/src/services/longbridgeAgent.ts` — 已有 Longbridge 连接检测
- 本仓库 `apps/trader-cli/src/services/longbridge.ts` — Longbridge CLI 调用封装
- 本仓库 `apps/trader-cli/src/services/longbridgeCli.ts` — `runLongbridgeJson()` 实现
- 本仓库 `07_decision_envelope.md` — RiskGate 设计（复用已有熔断逻辑）
- 本仓库 `27_order_agent_placeholder.md` — Risk Engine 设计
- 本仓库 `25_web_desktop_interface.md` — 告警推送通道设计
