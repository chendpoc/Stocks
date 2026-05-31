# Forward Market Intelligence — MVP Worker Prompt

Target model: Cursor Composer 2.5
Source plan: [03-forward-market-intel-mvp-plan.md](./03-forward-market-intel-mvp-plan.md)
Source design: `docs/01-forward-market-intelligence-system-design.md`, `docs/02-mvp-module-development-plan.md`
Generated: 2026-05-30
Updated: 2026-05-30 (architecture decision: LLM in CLI only, Python backend = pure data/tool layer)

---

## Architecture Decision (Confirmed)

```
┌─────────────────────────────────────────────────┐
│  CLI (Agent Layer) — TypeScript + Vercel AI SDK  │
│                                                   │
│  LLM 在这里运行。通过 tool call 调用后端能力：      │
│    buildContext / getSignals / searchCorpus /      │
│    getLessons / saveHypothesis / ...               │
│                                                   │
│  ✅ LLM API key 配置在 CLI 侧 (.env)               │
│  ✅ Auditor 在 CLI 侧运行（TS）                    │
└───────────────┬─────────────────────────────────┘
                │ HTTP POST /api/intel/*
                ▼
┌─────────────────────────────────────────────────┐
│  Python FastAPI 后端 (Tool Layer)                  │
│                                                   │
│  只做数据检索和结构化输出。不做推理，不调 LLM。     │
│    /api/intel/context/build     ← 核心端点         │
│    /api/intel/market/ingest                        │
│    /api/intel/signals/scan                         │
│    /api/intel/hypotheses (CRUD)                    │
│    /api/intel/lessons (CRUD)                       │
│    /api/intel/jobs/premarket                       │
│    /api/intel/jobs/close                           │
│                                                   │
│  内部依赖: select_context() / search_corpus()      │
│           market_bars / events / patterns DB       │
│                                                   │
│  ❌ 不需要 LLM API key                             │
│  ❌ 不包含 app/intel/llm/ 目录                     │
└─────────────────────────────────────────────────┘
```

---

Implement the Forward Market Intelligence MVP. This is a new system built as a subdirectory
`app/intel/` inside the existing `apps/trader-agent/backend/` project.

## What stays vs what's new

```
KEEP (read-only import):
  app/modules/evidence_ref.py        → EvidenceRef, RefType, ResolverStatus
  app/modules/corpus_search.py       → search_corpus(settings, query, symbol=..., limit=...)
  app/modules/_json.py               → dumps(), loads()
  app/core/events.py                 → record_agent_event()
  app/core/time.py                   → utc_now_iso()
  app/core/config.py                 → Settings
  app/db/session.py                  → create_sqlite_engine()

NOTE: context_selector.py and memory_service.py are NOT imported.
The new system uses its own context/intel/selector.py (reads from market_intel.db's lessons table).

DO NOT MODIFY any file under app/modules/ or app/core/.

NEW:
  app/intel/                          → Python 后端（纯数据层，不包括 LLM）
  data/market_intel.db                → 新 SQLite 数据库
  apps/trader-cli/                    → TypeScript CLI（包含 LLM + tool use）
```

## Repository root

D:\workspace\01-products\stock-community-summary

---

## Cross-Cutting Requirements (ALL Phases)

### Logging

Python 后端使用 `logging` 模块。在 `app/intel/__init__.py` 中创建 logger：

```python
import logging
import os
import sys

logger = logging.getLogger("intel")
_level = os.getenv("INTEL_LOG_LEVEL", "INFO").upper()
logger.setLevel(getattr(logging, _level, logging.INFO))
_handler = logging.StreamHandler(sys.stderr)
_handler.setFormatter(logging.Formatter("[%(asctime)s] %(levelname)s %(name)s:%(lineno)d — %(message)s"))
logger.addHandler(_handler)
logger.propagate = False
```

每个 `app/intel/` 下的模块导入 `from app.intel import logger` 并记录关键操作。

### Error Handling

所有外部调用（yfinance、HTTP fetch、DB write）必须包裹 try/except：

- **yfinance 超时/无数据**: 返回空列表，log warning，继续下一个 symbol
- **DB 写入失败**: log error，raise（让 FastAPI 返回 500）
- **select_context / search_corpus 失败**: 返回空结果，log warning，继续（优雅降级）

### API Authentication

MVP（单用户、本机部署）不做认证。所有 `/api/intel/*` 端点开放。
**已知缺口** — 网络部署前必须解决。

### Testing

每个 Phase 至少一个集成测试：

```bash
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_intel_phase{N}_{feature}.py -v --tb=short
```

CLI 侧不需要测试（MVP 阶段 CLI 通过手动词法验证）。

---

## Phase 0: Project Init + Schema

### Files
- `apps/trader-agent/backend/app/intel/__init__.py`（含 logger 配置）
- `apps/trader-agent/backend/app/intel/db/__init__.py`
- `apps/trader-agent/backend/app/intel/db/connection.py`
- `apps/trader-agent/backend/app/intel/db/schema.py`

### `intel/db/connection.py`

```python
from sqlalchemy import create_engine, event
from pathlib import Path

INTEL_DB_PATH = Path("data/market_intel.db")

def get_intel_engine():
    engine = create_engine(f"sqlite:///{INTEL_DB_PATH}", echo=False)
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()
    return engine
```

### `intel/db/schema.py`

11 张表，基于 `docs/02-mvp-module-development-plan.md` §5.1-5.12 的 SQL，做以下调整：

1. **`events.affected_symbols`**: JSON 数组 `'["TSLA","TSLL"]'`（不用逗号分隔 TEXT），查询用 `_json.json_array_like_pattern`
2. **`predictions`**: 增加 `reference_price REAL` 列（prediction 创建时的收盘价，Phase 6 评估必需）
3. **`signal_id` 格式**: `{SYMBOL}_{YYYY}_{MM}_{DD}_{HH}_{signal_type}`（小时粒度，允许同日多次触发）
4. **`lessons` 表扩展**（见下方 §5.11 修订）

Tables: `symbols`, `market_bars`, `events`, `smart_money_actions`, `patterns`, `signals`, `hypotheses`, `predictions`, `outcomes`, `lessons`, `trade_ideas`.

#### lessons 表扩展

基于 02-mvp-plan §5.11 的原始定义，新增以下列以支持 context injection：

```sql
CREATE TABLE IF NOT EXISTS lessons (
  lesson_id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  symbol TEXT,
  symbols_json TEXT,          -- NEW: 多 symbol JSON 数组 '["TSLA","TSLL"]'
  pattern_id TEXT,
  explanation_type TEXT,
  market_regime TEXT,
  lesson_text TEXT NOT NULL,
  summary TEXT,               -- NEW: 200 字摘要，供 context injection 截断
  rule_text TEXT,             -- NEW: 提炼后的规则文本
  tags_json TEXT,             -- NEW: 标签数组 '["lesson","postmortem","supported"]'
  confidence REAL DEFAULT 0.5,-- NEW: 0-1，复盘 verdict="supported"→0.7-0.9
  source_type TEXT,           -- NEW: seed / postmortem / manual
  when_to_apply TEXT,
  when_not_to_apply TEXT,
  weight_update TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Seed Data

**8 个 MVP 标的**:

```python
MVP_SYMBOLS = [
    ("TSLA", "Tesla Inc", "stock", "Consumer Discretionary", "QQQ", None),
    ("TSLL", "Direxion Daily TSLA Bull 2X", "leveraged_etf", None, "QQQ", "TSLA"),
    ("QQQ", "Invesco QQQ Trust", "etf", None, None, None),
    ("SPY", "SPDR S&P 500 ETF", "etf", None, None, None),
    ("ARKK", "ARK Innovation ETF", "etf", None, "QQQ", None),
    ("NVDA", "NVIDIA Corp", "stock", "Technology", "QQQ", None),
    ("COIN", "Coinbase Global", "stock", "Financials", "QQQ", None),
    ("BMNR", "Bitcoin Miner", "stock", "Crypto", "QQQ", None),
]
```

**5 条初始 patterns**:

```python
MVP_PATTERNS = [
    ("higher_low_accumulation", "technical",
     "更高低点+下跌缩量=卖压可能衰竭。确认需反弹放量或站回关键位。风险：缩量也可能是无人买入。",
     "回踩→低点高于前低→成交量低于前次下跌",
     "回踩不破前低+下跌缩量", "放量跌破前低且无收回",
     '["TSLA","TSLL","NVDA"]', 0.65, 0),
    ("volume_contraction_pullback", "technical",
     "缩量回踩支撑位是潜在吸筹信号。必须等放量反弹确认，不能单独作为入场依据。",
     "下跌→缩量→触及支撑区域",
     "触及支撑+缩量+未破位", "放量跌破支撑且无收回",
     '["TSLA","TSLL","QQQ"]', 0.60, 0),
    ("vwap_reclaim", "technical",
     "价格站回VWAP上方且放量=盘中买方重新控盘。风险：无量站回VWAP后快速回落。",
     "盘中跌破VWAP→反弹→站回VWAP",
     "站回VWAP+放量+QQQ配合", "无量站回或QQQ反向破位",
     '["TSLA","TSLL","NVDA","QQQ"]', 0.70, 0),
    ("relative_strength_divergence", "technical",
     "个股在QQQ下跌时抗跌=有独立买盘支撑。需区分真实强势vs滞后补跌。",
     "QQQ下跌→个股不跟跌或跌幅明显更小",
     "QQQ跌>1%且个股跌<0.3%或上涨", "个股补跌且放量跌破前低",
     '["TSLA","NVDA","COIN","BMNR"]', 0.60, 0),
    ("taco_pattern", "macro",
     "Trump强硬威胁→市场恐慌下跌→政策软化/延期→反弹。宏观节奏模式，非精确入场信号。风险：政策可能不软化。",
     "政策威胁→市场Risk-off→后续软化信号",
     "威胁言论+VIX上升+后续出现软化迹象", "政策升级而非软化，或VIX持续上行",
     '["QQQ","SPY","TSLA","TSLL","ARKK"]', 0.55, 0),
]
```

### Seed Lessons（冷启动）

Phase 0 通过 `app/intel/ingestion/seed_lessons.py` 批量扫描 `docs/summaries/`，用 LLM 提取 3-5 条典型交易规律，写入 `lessons` 表。

```python
# app/intel/ingestion/seed_lessons.py
"""扫描 docs/summaries/ 中最近的总结文档，用 LLM 提取可复用交易规律，
作为 seed lessons 写入新 DB。Phase 0 运行一次。"""

def extract_seed_lessons(settings) -> int:
    """返回写入的 lesson 数量。LLM 不可用时返回 0（不阻塞 Phase 0）。"""
    ...
```

输出格式（写入 lessons 表）：
```json
{
  "lesson_id": "seed_001",
  "symbols_json": "[\"TSLA\",\"TSLL\"]",
  "summary": "TSLL 回踩高于前低且缩量=卖压衰减信号",
  "rule_text": "回踩低点高于前低 + 下跌成交量低于前次 → 观察。确认需反弹放量站回关键位。",
  "tags_json": "[\"seed\",\"technical\",\"higher_low\"]",
  "confidence": 0.7,
  "source_type": "seed"
}
```

### API 路由注册

在 `app/main.py` 中：

```python
from app.intel.api import intel_router
app.include_router(intel_router, prefix="/api/intel")
```

---

## Phase 1: Market Data Ingestion

### Files
- `apps/trader-agent/backend/app/intel/ingestion/__init__.py`
- `apps/trader-agent/backend/app/intel/ingestion/market_data.py`

### `market_data.py`

```python
import yfinance as yf
import pandas as pd
import time
from dataclasses import dataclass
from app.intel import logger

@dataclass
class Bar:
    symbol: str; timeframe: str; ts: str
    open: float; high: float; low: float; close: float; volume: float
    vwap: float | None; source: str

def _estimate_vwap(row) -> float:
    """VWAP 降级：yfinance 不提供时用 (H+L+C)/3 近似。"""
    return round((row.get("High", 0) + row.get("Low", 0) + row.get("Close", 0)) / 3, 2)

def fetch_daily_bars(symbol: str, lookback_days: int = 120) -> list[Bar]:
    """拉取日线 OHLCV。yfinance 错误时返回空列表，不崩溃。"""
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=f"{lookback_days}d")
        if df.empty:
            logger.warning(f"No daily data for {symbol}")
            return []
        bars = []
        for ts, row in df.iterrows():
            vwap = row.get("VWAP") if "VWAP" in df.columns and pd.notna(row.get("VWAP")) else None
            if vwap is None:
                vwap = _estimate_vwap(row)
            bars.append(Bar(symbol=symbol, timeframe="1d", ts=ts.isoformat(),
                open=float(row["Open"]), high=float(row["High"]),
                low=float(row["Low"]), close=float(row["Close"]),
                volume=float(row["Volume"]), vwap=vwap, source="yfinance"))
        return bars
    except Exception as e:
        logger.warning(f"Failed daily bars for {symbol}: {e}")
        return []

def fetch_minute_bars(symbol: str, interval: str = "5m", lookback_days: int = 30) -> list[Bar]:
    """拉取分钟线。同上错误处理。"""
    ...

def ingest_mvp_symbols() -> dict:
    """8 个标的全量导入。返回 {symbol: (daily_count, minute_count)}。
    增量逻辑：先查 DB 最新 ts，只拉新数据。yfinance 调用间隔 2s 防限流。"""
    ...
```

关键要求：
- **VWAP 降级**: `_estimate_vwap()` 确保 `distance_to_vwap` / `reclaim_vwap` feature 不因数据缺失而失效
- **去重**: `INSERT OR IGNORE` on `UNIQUE(symbol, timeframe, ts)`
- **增量**: 查 DB 最新 ts → 只拉新数据
- **限流**: `time.sleep(2)` between yfinance calls

### API

```python
# intel/api/market.py
@router.post("/market/ingest")
def ingest_market_data():
    result = ingest_mvp_symbols()
    return {"status": "ok", "results": result}
```

---

## Phase 2: Feature Scanner

### Files
- `apps/trader-agent/backend/app/intel/features/__init__.py`
- `apps/trader-agent/backend/app/intel/features/scanner.py`

### Features (10)

```python
def calc_relative_return_vs_qqq(symbol, bars_daily, qqq_bars): ...
def calc_volume_vs_20d_avg(symbol, bars_daily): ...
def calc_distance_to_vwap(symbol, bars_minute): ...
def detect_higher_low(symbol, bars_daily): ...
def detect_lower_high(symbol, bars_daily): ...
def detect_pullback_to_support(symbol, bars_daily): ...
def detect_break_previous_low(symbol, bars_daily): ...
def detect_reclaim_vwap(symbol, bars_minute): ...
def calc_trend_strength(symbol, bars_daily): ...
def detect_volume_contraction(symbol, bars_daily): ...
```

### Scanner registry

```python
SCANNERS = [
    ("relative_weakness", calc_relative_return_vs_qqq, "relative_weakness", "{symbol} 相对 QQQ 表现异常"),
    ("volume_vs_avg", calc_volume_vs_20d_avg, "volume_anomaly", "{symbol} 成交量异于 20 日均量"),
    ("distance_to_vwap", calc_distance_to_vwap, "vwap_distance", "{symbol} 价格远离 VWAP"),
    ("higher_low", detect_higher_low, "higher_low_candidate", "{symbol} 可能形成更高低点"),
    ("lower_high", detect_lower_high, "lower_high_candidate", "{symbol} 可能形成更低高点"),
    ("pullback", detect_pullback_to_support, "pullback_to_support", "{symbol} 回踩支撑位"),
    ("break_low", detect_break_previous_low, "break_previous_low", "{symbol} 跌破前低"),
    ("reclaim_vwap", detect_reclaim_vwap, "reclaim_vwap", "{symbol} 站回 VWAP"),
    ("trend_strength", calc_trend_strength, "trend_strength_change", "{symbol} 趋势强度变化"),
    ("volume_contraction", detect_volume_contraction, "volume_contraction", "{symbol} 下跌缩量"),
]
```

### Signal format

```json
{
  "signal_id": "TSLL_2026_05_30_10_higher_low_candidate",
  "ts": "2026-05-30T10:30:00",
  "symbol": "TSLL",
  "signal_type": "higher_low_candidate",
  "raw_description": "TSLL 回踩低点高于前低，成交量低于上次下跌",
  "severity": 0.7,
  "feature_snapshot": "{\"higher_low\": true, \"volume_contraction\": true}",
  "status": "new"
}
```

- **signal_id**: `{SYMBOL}_{YYYY}_{MM}_{DD}_{HH}_{signal_type}` — 小时粒度
- **去重**: `INSERT OR IGNORE` on UNIQUE(signal_id)
- **状态流**: `new` → (LLM 解释后) → `explained` → (outcome 后) → `verified` / `invalidated`

### API

```python
@router.post("/signals/scan")
def scan_signals(): ...

@router.get("/signals")
def list_signals(symbol: str | None = None, limit: int = 50): ...
```

---

## Phase 3: Events & Smart Money

### Files
- `apps/trader-agent/backend/app/intel/ingestion/events_ingest.py`
- `apps/trader-agent/backend/app/intel/api/market.py`（增加 event 端点）

### API

```python
@router.post("/events")
def create_event(ts: str, event_type: str, title: str, raw_text: str,
                 actor: str | None = None, affected_symbols: str | None = None,
                 source: str = "manual"):
    """
    affected_symbols: JSON 数组 '["TSLA","TSLL"]'（不用逗号分隔）
    """
    ...

@router.get("/events")
def list_events(symbol: str | None = None, days: int = 7, limit: int = 20): ...
```

### Smart Money (ARK)

```python
def fetch_ark_trades(symbol: str | None = None):
    """https://arkfunds.io/api/ (免费，无需 key)。不可用时 log warning，返回空。"""
    ...
```

---

## Phase 4: Context Assembly Endpoint（核心）

### 背景

**Python 后端不调用 LLM。** 后端只负责检索和组装上下文，以结构化 JSON 返回。
CLI 中的 LLM 通过 tool call 调用此端点，拿到上下文后自己做推理。

### Files
- `apps/trader-agent/backend/app/intel/api/__init__.py`
- `apps/trader-agent/backend/app/intel/api/context.py`
- `apps/trader-agent/backend/app/intel/context/__init__.py`
- `apps/trader-agent/backend/app/intel/context/selector.py`  ← NEW

### `context/selector.py` — 新 context selector

```python
# app/intel/context/selector.py
"""从新 DB 的 lessons 表按 symbol/tags/confidence 评分选取上下文记忆。
替代旧的 select_context（只读旧 DB 的 memory_items），只读新 DB。
预算：10 条 / 600 字符每条 / 6000 字符总。

评分权重：
  - symbol 匹配: 30
  - tag 匹配: 25
  - confidence: 20
  - source_type (postmortem > seed > manual): 10
  - recency: 15
"""
from app.intel.db.connection import get_intel_engine
from app.intel import logger

def select_lessons(engine, *, symbols, tags=None, max_items=10, 
                   max_chars_per=600, max_total=6000) -> list[dict]:
    """返回按评分排序的 lessons，用于上下文注入。"""
    ...
```

### `context.py` — `POST /api/intel/context/build`

```python
from app.modules.corpus_search import search_corpus
from app.intel.context.selector import select_lessons
from app.intel.db.connection import get_intel_engine
from app.intel import logger
from app.core.config import Settings

@router.post("/context/build")
def build_context(
    symbols: list[str],
    task_type: str,
    query: str | None = None,
    signal_id: str | None = None,
):
    """
    组装 LLM 分析所需的全量上下文。不做推理，不做总结，只做检索和组装。

    输入:
      symbols:   关注的标的列表，e.g. ["TSLA", "TSLL"]
      task_type: 任务类型 — "signal_explanation" | "market_intent_explanation" 
                 | "agent_conversation" | "learning_review"
      query:     可选搜索查询（用于 corpus search）
      signal_id: 可选，如果指定则只返回该信号

    返回:
      {
        "market_data": {symbol: {daily: [...], minute: [...]}},
        "benchmark": {"QQQ": [...], "SPY": [...]},
        "signals": [{...}],
        "events": [{...}],
        "memory": [{title, summary, rule_text, symbols, confidence}],
        "corpus": [{section_id, heading_path, snippet, symbols}],
        "patterns": [{name, description, trigger_conditions}],
        "lessons": [{lesson_text, verdict, symbol}]
      }
    """
    settings: Settings = request.app.state.settings
    engine = get_intel_engine()
    context = {}

    # 1. Market bars（每个 symbol 20 条日线 + 50 条 5m 线）
    context["market_data"] = {}
    for s in symbols:
        context["market_data"][s] = _fetch_recent_bars(engine, s)

    # 2. Benchmark（QQQ/SPY 最近 5 条日线）
    context["benchmark"] = {
        "QQQ": _fetch_recent_bars(engine, "QQQ", limit=5, timeframe="1d"),
        "SPY": _fetch_recent_bars(engine, "SPY", limit=5, timeframe="1d"),
    }

    # 3. Signals
    if signal_id:
        context["signals"] = [_get_signal(engine, signal_id)]
    else:
        context["signals"] = _list_signals(engine, symbols, days=3)

    # 4. Events（最近 7 天）
    context["events"] = _list_events(engine, symbols, days=7)

    # 5. 经验上下文（intel context selector）
    #    从新 DB 的 lessons 表选取。预算：10 条 / 600 字符每条 / 6000 字符总
    try:
        engine = get_intel_engine()
        lessons = select_lessons(engine, symbols=symbols)
        context["lessons"] = [
            {"lesson_id": l["lesson_id"], "symbols": l.get("symbols_json"),
             "summary": l.get("summary"), "rule_text": l.get("rule_text"),
             "tags": l.get("tags_json"), "confidence": l.get("confidence"),
             "source_type": l.get("source_type")}
            for l in lessons
        ]
        context["lessons_meta"] = {"selected_count": len(lessons)}
    except Exception as e:
        logger.warning(f"select_lessons failed: {e}")
        context["lessons"] = []

    # 6. 赵哥语料（M2 search_corpus）
    try:
        search_query = query or " ".join(symbols)
        corpus_results = search_corpus(settings, query=search_query,
                                       symbol=symbols[0] if symbols else None, limit=3)
        context["corpus"] = [
            {"section_id": r.section_id, "heading_path": r.heading_path,
             "snippet": r.snippet, "source_path": r.source_path,
             "symbols": r.symbols, "source_date": r.source_date}
            for r in corpus_results
        ]
    except Exception as e:
        logger.warning(f"search_corpus failed: {e}")
        context["corpus"] = []

    # 7. Patterns（匹配 symbol 的规律）
    context["patterns"] = _list_patterns(engine, symbols)

    # 8. Lessons（最近 5 条相关经验）
    context["lessons"] = _list_lessons(engine, symbols, limit=5)

    return context


def _fetch_recent_bars(engine, symbol: str, limit: int = 20, timeframe: str = "1d") -> list[dict]:
    """查询 market_bars。用于 market_data (limit=20) 和 benchmark (limit=5)。"""
    ...

def _list_events(engine, symbols: list[str], days: int = 7) -> list[dict]:
    ...

def _list_patterns(engine, symbols: list[str]) -> list[dict]:
    ...

def _list_lessons(engine, symbols: list[str], limit: int = 5) -> list[dict]:
    ...
```

**关键设计决策**：
- 返回**结构化 JSON**，不是组装好的 prompt 文本。LLM 拿到结构化数据自己决定怎么用。
- `select_lessons` 和 `search_corpus` 的调用放在 try/except 中，失败时返回空数组——LLM 仍然能工作（只是缺少经验和语料上下文）。

### 其他 API 端点（为 CLI tool use 提供）

```python
# intel/api/signals.py
@router.get("/signals")
def list_signals(symbol: str | None = None, status: str | None = None, limit: int = 50): ...
@router.post("/signals/scan")
def scan_signals(): ...
@router.put("/signals/{signal_id}/status")
def update_signal_status(signal_id: str, status: str): ...

# intel/api/market.py  
@router.post("/market/ingest")
def ingest_market_data(): ...
@router.get("/market/bars")
def get_market_bars(symbol: str, timeframe: str = "1d", limit: int = 20): ...

# intel/api/events.py
@router.post("/events")
def create_event(...): ...
@router.get("/events")
def list_events(symbol: str | None = None, days: int = 7): ...

# intel/api/hypotheses.py
@router.post("/hypotheses")
def save_hypothesis(hypothesis: dict): ...
@router.get("/hypotheses")
def list_hypotheses(symbol: str | None = None, limit: int = 20): ...

# intel/api/lessons.py
@router.get("/lessons")
def list_lessons(symbol: str | None = None, limit: int = 20): ...
@router.post("/lessons")
def create_lesson(lesson: dict): ...

# intel/api/trade_ideas.py
@router.post("/trade-ideas")
def create_trade_idea(trade_idea: dict): ...
@router.get("/trade-ideas")
def list_trade_ideas(symbol: str | None = None, status: str | None = None): ...

# intel/api/jobs.py
@router.post("/jobs/premarket")
def run_premarket_brief(): ...
@router.post("/jobs/close")
def run_close_postmortem(): ...
```

**重要**: 所有端点都在 `app/intel/api/` 下。**不要创建 `app/intel/llm/` 目录。**
Python 后端零 LLM 依赖。

---

## Phase 5: Trade Ideas（后端）

### Files
- `apps/trader-agent/backend/app/intel/trade/__init__.py`
- `apps/trader-agent/backend/app/intel/trade/ideas.py`

```python
def generate_trade_idea_from_hypothesis(hypothesis: dict) -> dict | None:
    """从 hypothesis 生成 trade_idea。
    如果 hypothesis.tradability == "no_trade" → 返回 None。
    如果同一 symbol + 日期已有 trade_idea → 合并条件。
    """
    ...

TRADE_IDEA_STATUSES = ["no_trade", "watchlist", "setup_forming", "trade_candidate", "invalidated", "closed"]
```

---

## Phase 6: Postmortem（后端）

### Files
- `apps/trader-agent/backend/app/intel/postmortem/__init__.py`
- `apps/trader-agent/backend/app/intel/postmortem/evaluator.py`
- `apps/trader-agent/backend/app/intel/postmortem/lessons.py`

### `evaluator.py`

```python
def evaluate_due_predictions(settings) -> dict:
    """查询所有 due_at <= now() 且 status='pending' 的 predictions。
    用 prediction.reference_price 作为基线计算 return/MFE/MAE。
    写入 outcome。返回 {supported: N, rejected: N, mixed: N, inconclusive: N}。
    """
    ...
```

### `lessons.py`

```python
def create_lesson_from_outcome(outcome: dict, hypothesis: dict, settings) -> dict:
"""从已验证的 outcome 创建 lesson。存入 lessons 表。
    
    只写新 DB 的 lessons 表。
    lessons 表已扩展为同时支持复盘存储和上下文注入。
    不调旧的 create_memory_item（旧模块已从 readonly_import 中移除）。
    """
    ...
```

---

## Phase 7: Pre-market + Close Jobs（后端）

### Files
- `apps/trader-agent/backend/app/intel/jobs/premarket.py`
- `apps/trader-agent/backend/app/intel/jobs/close.py`

这些 jobs **只准备数据**，不调用 LLM。返回结构化数据给 CLI 的 LLM 使用。

```python
# premarket.py
@router.post("/jobs/premarket")
def run_premarket_brief():
    """准备盘前数据包：overnight futures 估值、最近 events、active lessons、watchlist。
    返回结构化 JSON。不生成文本——文本由 CLI 的 LLM 生成。"""
    ...

# close.py  
@router.post("/jobs/close")
def run_close_postmortem():
    """准备收盘数据包：今日 signals、hypotheses、trade_ideas、market_bars。
    同时触发 evaluate_due_predictions()。
    返回结构化 JSON。"""
    ...
```

---

## Phase 8: TypeScript CLI（Agent Layer）

### 目录

```
apps/trader-cli/
  package.json
  tsconfig.json
  src/
    index.ts              # CLI entry (Commander.js)
    api/client.ts         # fetch wrapper → localhost:8000/api/intel
    llm/
      provider.ts         # Vercel AI SDK 配置
      auditor.ts          # 10 条禁止规则审计（TS 侧）
      tools.ts            # tool definitions (给 LLM 的 function schema)
    commands/
      scan.ts
      analyze.ts
      brief.ts
      review.ts
      signals.ts
      hypotheses.ts
      lessons.ts
      memory.ts
      chat.ts             # 交互对话（LLM + tool use）
    ui/
      display.ts          # 终端格式化输出
```

### `package.json`

```json
{
  "name": "trader-cli",
  "version": "0.1.0",
  "type": "module",
  "dependencies": {
    "commander": "^12.0.0",
    "ai": "^4.0.0",
    "@ai-sdk/openai": "^1.0.0",
    "@ai-sdk/anthropic": "^1.0.0",
    "chalk": "^5.3.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.4.0"
  }
}
```

**不是** pnpm workspace 成员（避免污染 monorepo 的 lockfile）。CLI 独立安装依赖。

### `src/llm/provider.ts`

```typescript
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

const provider = process.env.LLM_PROVIDER ?? "deepseek";

export function getModel() {
  const model = process.env.LLM_MODEL ?? "deepseek-chat";
  switch (provider) {
    case "deepseek":
      return createOpenAI({
        baseURL: normalizeBaseUrl(process.env.LLM_BASE_URL ?? "https://api.deepseek.com/v1"),
        apiKey: process.env.LLM_API_KEY,
      })(model);
    case "openrouter":
      return createOpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: process.env.LLM_API_KEY,
      })(model);
    case "anthropic":
      return createAnthropic({ apiKey: process.env.LLM_API_KEY })(model);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

function normalizeBaseUrl(url: string): string {
  // 兼容 "https://api.deepseek.com/chat/completions" 和 "https://api.deepseek.com/v1"
  let base = url.replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) {
    base = base.slice(0, -"/chat/completions".length);
  }
  return base;
}
```

### `src/llm/tools.ts` — LLM Tool Definitions

```typescript
import { tool } from "ai";
import { z } from "zod";
import { fetchIntel } from "../api/client";

/**
 * LLM 可用的工具清单。
 * 每个工具对应后端的一个 API 端点。
 * LLM 通过 tool call 调用这些工具来获取数据、写入结果。
 */
export const INTEL_TOOLS = {
  // ── 数据获取 ──
  ingestMarketData: tool({
    description: "拉取最新行情数据（日线+5m分钟线）到数据库",
    parameters: z.object({}),
    execute: async () => fetchIntel("/market/ingest", { method: "POST" }),
  }),

  getMarketBars: tool({
    description: "查询指定标的的行情K线",
    parameters: z.object({
      symbol: z.string().describe("标的代码，如 TSLA"),
      timeframe: z.enum(["1d", "5m"]).default("1d"),
      limit: z.number().default(20),
    }),
    execute: async ({ symbol, timeframe, limit }) =>
      fetchIntel(`/market/bars?symbol=${symbol}&timeframe=${timeframe}&limit=${limit}`),
  }),

  // ── 信号 ──
  getSignals: tool({
    description: "查询指定标的的交易信号",
    parameters: z.object({
      symbol: z.string().optional(),
      status: z.enum(["new", "explained", "verified", "invalidated"]).optional(),
      limit: z.number().default(50),
    }),
    execute: async (params) => {
      const qs = new URLSearchParams(params as Record<string, string>).toString();
      return fetchIntel(`/signals?${qs}`);
    },
  }),

  scanSignals: tool({
    description: "触发全量信号扫描（8个标的），扫描结果写入数据库。返回信号数量",
    parameters: z.object({}),
    execute: async () => fetchIntel("/signals/scan", { method: "POST" }),
  }),

  // ── 上下文（核心） ──
  buildContext: tool({
    description: "组装LLM分析所需的全部上下文：行情数据、基准表现、信号、事件、历史记忆、赵哥语料、规律、经验。结构化JSON返回",
    parameters: z.object({
      symbols: z.array(z.string()).describe("关注的标的，如 ['TSLA','TSLL']"),
      taskType: z.enum(["signal_explanation", "market_intent_explanation", "agent_conversation", "learning_review"])
        .describe("任务类型，决定记忆选择策略"),
      query: z.string().optional().describe("搜索查询（用于语料检索）"),
      signalId: z.string().optional().describe("特定信号ID"),
    }),
    execute: async (params) =>
      fetchIntel("/context/build", {
        method: "POST",
        body: JSON.stringify(params),
      }),
  }),

  searchCorpus: tool({
    description: "搜索赵哥语料库（交易总结、复盘文档）",
    parameters: z.object({
      query: z.string(),
      symbol: z.string().optional(),
      limit: z.number().default(5),
    }),
    execute: async ({ query, symbol, limit }) =>
      fetchIntel(`/corpus/search?query=${encodeURIComponent(query)}&symbol=${symbol ?? ""}&limit=${limit}`),
  }),

  // ── 事件 ──
  getEvents: tool({
    description: "查询相关事件（新闻、政策、宏观）",
    parameters: z.object({
      symbol: z.string().optional(),
      days: z.number().default(7),
      limit: z.number().default(20),
    }),
    execute: async ({ symbol, days, limit }) =>
      fetchIntel(`/events?symbol=${symbol ?? ""}&days=${days}&limit=${limit}`),
  }),

  // ── 经验 ──
  getLessons: tool({
    description: "查询历史经验教训",
    parameters: z.object({
      symbol: z.string().optional(),
      limit: z.number().default(20),
    }),
    execute: async ({ symbol, limit }) =>
      fetchIntel(`/lessons?symbol=${symbol ?? ""}&limit=${limit}`),
  }),

  // ── 写入 ──
  saveHypothesis: tool({
    description: "保存LLM生成的假说到数据库。保存前会做禁止规则审计",
    parameters: z.object({
      signalId: z.string(),
      hypothesis: z.object({
        claim: z.string(),
        professional_explanation: z.string(),
        plain_language_explanation: z.string(),
        candidate_explanations: z.array(z.string()),
        evidence_for: z.array(z.string()),
        evidence_against: z.array(z.string()),
        reasoning_gap: z.string().optional()
          .describe("如果无反方证据，必须说明推理链路和为什么没有找到"),
        missing_evidence: z.array(z.string()),
        confidence: z.number().min(0).max(1),
        tradability: z.enum(["no_trade", "watchlist", "setup_forming", "trade_candidate"]),
        invalidation_condition: z.string(),
        predictions: z.array(z.object({
          window: z.string(),
          expected_outcome: z.string(),
          invalid_if: z.string(),
        })),
      }),
    }),
    execute: async ({ signalId, hypothesis }) => {
      // 先审计
      const issues = auditHypothesis(hypothesis);
      if (issues.blockers.length > 0) {
        return { error: "audit_blocked", blockers: issues.blockers };
      }
      return fetchIntel("/hypotheses", {
        method: "POST",
        body: JSON.stringify({
          signal_id: signalId,
          ...hypothesis,
          audit_warnings: issues.warnings,
        }),
      });
    },
  }),
};
```

### `src/llm/auditor.ts` — 禁止规则审计（TS 侧）

```typescript
/**
 * 10 条禁止规则审计（01-design §8）。
 * 规则调整：无反方证据 → 检查是否说明了推理过程（reasoning_gap 字段），
 * 不强制要求编造反方证据。
 */

interface AuditIssues {
  blockers: string[];   // 硬违规 → 阻止 DB 写入
  warnings: string[];   // 软违规 → 标记但不阻止
}

export function auditHypothesis(h: Record<string, any>): AuditIssues {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const allText = `${h.claim || ""} ${h.professional_explanation || ""} ${h.plain_language_explanation || ""}`;

  // ── BLOCKERS ──

  // 规则 2: 绝对语言
  if (/必涨|必跌|绝对|100%|保证|肯定能|板上钉钉|guarantee|certainly|definitely/i.test(allText)) {
    blockers.push("prohibited_absolute_language");
  }

  // 规则 3: 13F 用于日内解释（未标注延迟）
  if (/13F/i.test(allText) && !/季度|quarterly|延迟|delay|lag/i.test(allText)) {
    blockers.push("13f_without_delay_context");
  }

  // ── WARNINGS ──

  // 规则 6: 无反方证据 → 检查是否说明了推理过程
  const evidenceAgainst = h.evidence_against || [];
  const reasoningGap = h.reasoning_gap || "";
  if (evidenceAgainst.length === 0 && reasoningGap.length < 20) {
    warnings.push("no_counter_evidence_and_no_reasoning");
    // NOT a blocker — LLM 可以说"未发现直接反方证据，推导逻辑如下..."
  }

  // 规则 7: 无失效条件
  if (!h.invalidation_condition || h.invalidation_condition.length < 10) {
    warnings.push("missing_or_weak_invalidation_condition");
  }

  // 规则 1: 对手盘声明（启发式）
  if (/主力在|庄家在|机构正在|大户在|Smart Money 在|明显是|显然是/i.test(allText)) {
    warnings.push("possible_unverified_counterparty_claim");
  }

  // 规则 4: call flow 无价格确认
  if (/call.*flow|call.*volume|call.*大增/i.test(allText) && /看多|看涨|bullish|买入/i.test(allText)) {
    if (!/确认|验证|confirm|verify|price.*action/i.test(allText)) {
      warnings.push("call_flow_without_price_confirmation");
    }
  }

  // 规则 5: ARK 买入无确认
  if (/ARK.*(?:买入|buy|增持|加仓)/i.test(allText)) {
    if (!/确认|验证|confirm|verify|price.*action/i.test(allText)) {
      warnings.push("ark_buy_without_price_confirmation");
    }
  }

  // 规则 8: 通俗化写实
  if (/肯定是|绝对是|必然是|一定是|毫无疑问|毋庸置疑|铁定/i.test(allText)) {
    warnings.push("colloquial_as_fact");
  }

  // 规则 9: 相对声明无 benchmark
  if (/跑赢|跑输|outperform|underperform|强势|弱势/i.test(allText)) {
    if (!/QQQ|SPY|benchmark|基准|大盘|指数/i.test(allText)) {
      warnings.push("relative_claim_without_benchmark");
    }
  }

  // 规则 10: 杠杆/期权无风险提示
  if (/TSLL|ARKK|leveraged?|杠杆|call|put|option/i.test(allText)) {
    if (!/损耗|decay|theta|波动.*风险|杠杆.*风险|时间.*风险/i.test(allText)) {
      warnings.push("leveraged_or_options_without_risk_warning");
    }
  }

  return { blockers, warnings };
}
```

### `src/commands/chat.ts` — 交互对话

```typescript
import { generateText, streamText } from "ai";
import { getModel } from "../llm/provider";
import { INTEL_TOOLS } from "../llm/tools";
import * as readline from "node:readline";

const SYSTEM_PROMPT = `你是 Forward Market Intelligence Agent，一个交易市场研究助手。

你的能力：
- 通过工具调用获取行情数据、信号、事件、语料库、历史经验
- 生成符合输出合同的市场假说（11 字段）
- 提供专业解释和通俗解释
- 审计自己的输出（禁止绝对语言、禁止无反方证据不说明推理过程等）

你的限制：
- 不自动下单，不喊单，不做价格预测
- 所有假设必须有验证点和失效条件
- 不把低置信叙事写成事实
- 不把 13F 等延迟数据用于日内解释

当用户说"记住这个"或"保存"，调用 saveHypothesis 写入数据库。`;

export async function chat() {
  console.log("Forward Market Intelligence — Agent Chat");
  console.log("输入 /help 查看命令，/quit 退出\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const history: { role: "user" | "assistant"; content: string }[] = [];

  const ask = (prompt: string): Promise<string> =>
    new Promise(resolve => rl.question(prompt, resolve));

  while (true) {
    const input = await ask("\n> ");
    if (!input) continue;
    if (input === "/quit") break;

    // 处理 slash 命令
    if (input.startsWith("/")) {
      await handleSlashCommand(input, rl);
      continue;
    }

    // LLM 对话
    history.push({ role: "user", content: input });

    const result = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      messages: history,
      tools: INTEL_TOOLS,
      maxSteps: 10,  // 最多 10 轮 tool call + 推理
    });

    // 显示推理过程（如果有）
    if (result.reasoning) {
      console.log(`\n[思考] ${result.reasoning.slice(0, 200)}...`);
    }

    // 显示使用的工具
    for (const step of result.toolCalls || []) {
      console.log(`[工具调用] ${step.toolName}`);
    }

    // 显示回复
    console.log(`\n${result.text}`);
    history.push({ role: "assistant", content: result.text });
  }

  rl.close();
}

async function handleSlashCommand(input: string, rl: readline.Interface) {
  if (input === "/scan") {
    console.log("触发扫描...");
    const result = await fetchIntel("/signals/scan", { method: "POST" });
    console.log(`扫描完成: ${result.signal_count} 个信号`);
  } else if (input.startsWith("/analyze ")) {
    const symbol = input.split(" ")[1];
    // 走完整的 LLM tool use 流程
    const result = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      prompt: `请深度分析 ${symbol}。调用 buildContext 获取上下文，然后生成假说。`,
      tools: INTEL_TOOLS,
      maxSteps: 10,
    });
    console.log(`\n${result.text}`);
  } else if (input === "/lessons") {
    const result = await fetchIntel("/lessons?limit=10");
    // 格式化显示...
  }
  // ... 其他命令
}
```

### `src/commands/analyze.ts`

```typescript
/**
 * trader analyze <symbol> — 对单个标的做深度分析。
 * 
 * 流程:
 * 1. 调 buildContext({symbols:[symbol], taskType:"signal_explanation"})
 * 2. 调 LLM generateText (with tools)
 * 3. LLM 自主决定是否调更多工具（getSignals, searchCorpus, getLessons...）
 * 4. 调 saveHypothesis 写入结果
 * 5. 终端显示分析结论
 */
export async function analyze(symbol: string) {
  const result = await generateText({
    model: getModel(),
    system: SYSTEM_PROMPT,
    prompt: `对 ${symbol} 做深度分析。先获取上下文，然后基于数据生成市场假说。`,
    tools: INTEL_TOOLS,
    maxSteps: 10,
  });
  console.log(result.text);
}
```

---

## Phase 9: Environment Config

```bash
# .env（项目根目录，CLI 读取）
LLM_PROVIDER=deepseek          # deepseek | openrouter | anthropic
LLM_MODEL=deepseek-chat        # 模型名
LLM_API_KEY=sk-xxx             # API key
LLM_BASE_URL=https://api.deepseek.com/v1  # 可选

# CLI
TRADER_API_BASE=http://localhost:8000/api/intel
```

**注意**: Python 后端**不需要** LLM_API_KEY。LLM 调用全部在 CLI 中。

---

## Verification

1. `POST /api/intel/market/ingest` → 8 个标的均有日线+5m bars
2. `POST /api/intel/signals/scan` → 为每个标的生成信号
3. `POST /api/intel/context/build` → 返回包含 market_data、signals、events、memory、corpus、patterns、lessons 的结构化 JSON
4. CLI `trader analyze TSLA` → LLM 通过 tool call 调 context/build → 输出 hypothesis → 自动调用 saveHypothesis
5. Hypothesis 在 saveHypothesis 前通过 auditor（blockers 空，warnings 可接受）
6. auditor 对"无反方证据但说明了推理过程"的 hypothesis 只报 warning 不报 blocker
7. `evaluate_due_predictions()` 用 predictions.reference_price 计算 outcomes
8. Lesson 写入 lessons 表 + 同步写入 memory_items（冲突时 log warning 不阻塞）
9. CLI `trader chat` 打开交互对话，LLM 自主调用工具
10. LLM provider 切换（改 `.env` LLM_PROVIDER）无需修改代码

## Important

- **不要创建** `app/intel/llm/` 目录（Python 后端零 LLM 依赖）
- 不要修改 `app/modules/` 或 `app/core/` 下任何文件
- 不要修改 `trader-agent.db` schema
- 不要动 `apps/trader-cockpit/`
- 不要 commit

## References

- `docs/01-forward-market-intelligence-system-design.md` — 系统设计动机
- `docs/02-mvp-module-development-plan.md` — 详细 Phase spec、schema SQL、验收标准
- `docs/research-agent/target-system/trader-agent/00-workflow-router.md` — 开发工作流规范
- `docs/research-agent/target-system/trader-agent/03-shared-agent-memory-development/06-context-injection-policy.md` — 上下文注入策略（budget: 5 items, 800 chars each, 3000 chars total）

## Specification Gate Check

- [x] Source checked — 01-design ✓ + 02-mvp-plan ✓ + M0-M6 接口已验证（select_context / search_corpus / create_memory_item） ✓
- [x] Source checked — 01-design ✓ + 02-mvp-plan ✓ + M0-M6 接口已验证（search_corpus / _json / events / time / config / session） ✓
- [x] Decisions frozen — LLM in CLI only / Python backend = pure data layer / auditor 无反方证据降为 warning / context/build 返回结构化 JSON / seed 5 patterns / signal_id 小时粒度 / VWAP fallback ✓
- [x] Scope bounded — 新建: app/intel/ (不含 llm/), apps/trader-cli/, tests/. 禁止: app/modules/, app/core/, trader-agent.db, trader-cockpit/
- [x] Verification mapped — 10 条验收项，每项映射到具体 API 端点或 CLI 命令
- [x] Prompt self-contained — 所有路径、接口、SQL、schema、tool definitions 内联
- [x] Behavior preserved — M0-M6 只读复用；旧 DB 不动；旧管线保留

## Final response

- 每个 Phase: 完成或未完成，附输出
- 变更文件清单
- 错误及解决方案