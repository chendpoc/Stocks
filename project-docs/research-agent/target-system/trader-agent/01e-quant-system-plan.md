# 日内/短线量化系统实施计划

Status: confirmed
Owner: codex
Created: 2026-05-30
Confirmed: 2026-05-30 (all 6 decisions resolved)

## Specification Gate Check

- [x] Source checked — Agent Core 管线 ✓, RulePack 5 setups ✓, M0-M6 ✓, LocalToolAdapter ✓
- [x] Decisions frozen — 6 user ✓ + 3 technical ✓
- [x] Scope bounded — per-phase file list
- [x] Verification mapped — 见测试表
- [x] Prompt self-contained — worker prompt 独立文件
- [x] Behavior preserved — 不改管线核心逻辑，增量添加

## Pre-plan Decision Inventory

| # | 决策 | 结论 |
|---|---|---|
| 1 | Cockpit Phase B-C | 不做。terminal 交互替代 Web UI |
| 2 | 交互形态 | TS CLI + agent 对话，都做 |
| 3 | 行情数据源 | yfinance 主力，Alpha Vantage + Longbridge 备援。架构支持多源，默认只启 yfinance |
| 4 | 数据缓存 | SQLite 缓存表，TTL 60s |
| 5 | 回测窗口 | 10 个交易日 walk-forward |
| 6 | Outcome 追踪 | T+1 + T+5 |

---

## 1. 目标

将当前系统从"研究工具"升级为可独立运行的日内/短线量化系统：

1. 接入真实行情（yfinance 主力）
2. Walk-forward 回测（10 日窗口）
3. Outcome 自动追踪（T+1, T+5）
4. TypeScript CLI + agent 对话终端
5. 数据缓存层

不做 Web UI。Terminal 是人机交互界面。

## 2. 非目标

- 不做 Cockpit 前端开发
- 不接入港股
- 不涉及实盘交易执行
- 不修改 RulePack setup 逻辑
- 不做高频/秒级数据
- 不引入 Redis / PostgreSQL

## 3. Context Pack

### 已有基础设施

```
数据:
  source_artifacts (1599 files, 1280 summaries, 34 张 chat images)
  document_sections (10216 sections, FTS5 indexed)
  memory_items / memory_candidates (M3-M4)
  event_outcomes (schema 已有，数据空)

管线:
  runtime_orchestrator.run_symbol() → market_snapshot → setup_detection
    → rule_engine → scoring → risk_engine → signal_manager

工具:
  LocalToolAdapter (fixture mock 模式)
  yfinance 相关代码尚未存在

API:
  27 个 endpoint (16 knowledge + 11 agent)
  全量可用
```

### 当前数据流缺陷

```
build_market_snapshot(symbol)
  → LocalToolAdapter.get_bars(symbol)   # fixture mock
  → LocalToolAdapter.get_news(symbol)   # fixture mock
  → LocalToolAdapter.get_filings(symbol) # fixture mock
```

`LocalToolAdapter` 需要新增真实行情实现。

## 4. Phase 0: 行情数据层

### 目标
yfinance 接入，Alpha Vantage + Longbridge 架构就绪。多源统一接口。

### 架构

```python
# 新增: app/modules/market_data.py

class MarketDataSource(Protocol):
    """数据源统一接口"""
    def get_bars(self, symbol: str, interval: str, start: str, end: str) -> list[Bar]:
        ...
    def get_quote(self, symbol: str) -> Quote:
        ...
    def is_available(self) -> bool:
        ...

class YFinanceSource:
    """yfinance 实现。默认启用。"""

class AlphaVantageSource:
    """Alpha Vantage 实现。需 API key。默认关闭。"""

class LongbridgeSource:
    """Longbridge 实现。需 SDK 配置。默认关闭。"""

class MarketDataProvider:
    """多源汇聚。按 market 分流，按 priority 降级。
       US stocks: yfinance → Alpha Vantage (fallback)
       每个 source 有 is_available() 健康检查
    """
```

### 缓存

```sql
-- 新增表（models.py）
market_data_cache (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    symbol TEXT NOT NULL,
    interval TEXT NOT NULL,    -- 1m / 5m / 15m / 1d
    data_json TEXT NOT NULL,   -- 序列化的 bar list / quote
    fetched_at TEXT NOT NULL,
    ttl_seconds INTEGER NOT NULL DEFAULT 60
)
```

缓存命中：`fetched_at + ttl_seconds > now` 且 data_json 非空 → 直接返回。

### 文件
- `apps/trader-agent/backend/app/modules/market_data.py` — NEW
- `apps/trader-agent/backend/app/db/models.py` — 新增 `market_data_cache` 表

## 5. Phase 1: Walk-forward 回测

### 目标
10 个交易日窗口，逐日推进，模拟真实决策时序。

### 逻辑

```
for each trading day T in window:
    snapshot = build_snapshot(T, "09:30")  # 开盘快照
    candidates = detect_setups(snapshot)
    for candidate in candidates:
        signal = evaluate + score + risk + persist(candidate, snapshot, run_date=T)
        signals.append(signal)
    # 推进到 T+1，重复

# 用真实历史数据回填 outcome
for signal in signals:
    outcome = label_outcome(signal, T+1, T+5)
    update_signal_outcome(signal, outcome)
```

关键约束：
- 只用 T 日之前的数据——不能偷看未来
- 每步调用真实 `MarketDataProvider`，从缓存读取
- 复用现有管线函数，不改核心逻辑

### 文件
- `apps/trader-agent/backend/app/modules/backtest.py` — NEW

## 6. Phase 2: Outcome 追踪

### 目标
Signal 生成后，T+1 和 T+5 回填表现。

### 逻辑

```python
@dataclass
class SignalOutcome:
    signal_id: str
    symbol: str
    signal_date: str
    return_t1: float | None    # T+1 回报
    return_t5: float | None    # T+5 回报
    mfe_t5: float | None       # T+5 最大有利偏移
    mae_t5: float | None       # T+5 最大不利偏移
    final_label: str | None    # win / loss / breakeven（T+5 判定）

def label_pending_outcomes(settings: Settings) -> int:
    """扫描所有无 outcome 的 signal，回填 T+1/T+5 表现。返回更新数量。"""
```

日常命令：`python cli.py outcomes` 每天跑一次，回填到期信号。

### 文件
- `apps/trader-agent/backend/app/modules/outcome_tracker.py` — NEW

## 7. Phase 3: TypeScript CLI + Agent 对话

### 目标
Terminal 交互——命令行工具 + agent 对话。

### 技术选型

```
CLI 框架:    Commander.js / Clack / Pastel
             当前主流：Clack（Vercel 出品，交互式 prompt）
             
对话模式:   readline + SSE 流式 + 后端 /api/agent/chat (需新建)
           
构建:       tsx (直接运行 TS，不需要编译步骤)

参考项目:   Vercel AI SDK CLI、Stripe CLI、Linear CLI
```

### 命令

```bash
# 扫描
trader scan                    # 跑一次全量扫描
trader scan --symbol TSLA      # 单标的扫描

# 回测
trader backtest                # 跑 10 日 walk-forward
trader backtest --days 5       # 5 日窗口

# 结果
trader signals                 # 查看近期 signal
trader outcomes                # 回填 pending outcome
trader stats --symbol AAPL     # 查看标的历史表现

# 记忆
trader memory list             # 列出 active memory
trader memory extract "文本"   # 对话抽离 → 确认 → 存入

# 搜索
trader search "财报前减持"     # 全文搜索

# 对话
trader chat                    # 进入 agent 对话模式
```

### 文件
- `apps/trader-cli/` — NEW 目录，pnpm workspace package
- `apps/trader-agent/backend/app/api/chat.py` — NEW（SSE chat endpoint）
- `apps/trader-agent/backend/app/modules/chat_service.py` — NEW

## 8. 允许修改的文件

| Phase | 文件 | 性质 |
|---|---|---|
| P0 | `app/modules/market_data.py` | NEW |
| P0 | `app/db/models.py` | 新增 `market_data_cache` 表 |
| P0 | `app/tools/local_adapter.py` | 增加 yfinance 调用路径（保留 fixture 路径） |
| P1 | `app/modules/backtest.py` | NEW |
| P2 | `app/modules/outcome_tracker.py` | NEW |
| P3 | `apps/trader-cli/` | NEW directory |
| P3 | `app/api/chat.py` | NEW |
| P3 | `app/modules/chat_service.py` | NEW |

## 9. 禁止修改的范围

- Rule Engine / Risk Engine / Scoring 核心逻辑
- M0-M6 模块（market_data 可导入但不修改）
- `document_chunks` / `document_chunks_fts`
- Cockpit 前端代码（保留不动，但不再开发）

## 10. 测试

| Phase | 测试 |
|---|---|
| P0 | yfinance get_bars 返回数据，缓存命中/过期，fallback 切换 |
| P0 | `market_data_cache` 表创建，TTL 逻辑 |
| P1 | walk-forward 10 日，不偷看未来，信号生成，outcome 回填 |
| P2 | T+1/T+5 回报计算，MFE/MAE，final_label |
| P3 | CLI scan / backtest / signals / search 命令可运行 |

## 11. 验收命令

```powershell
# P0
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_market_data.py -v --tb=short

# P1
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_backtest.py -v --tb=short

# P2
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_outcome_tracker.py -v --tb=short

# Full regression
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/ -v --tb=short
```

## 12. 完成后文档更新

- [ ] 本 plan Status: done
