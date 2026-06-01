# CLI TUI V2 — Worker Prompt

Target: Cursor Composer 2.5
Dev Plan: `.agent-dev/specs/cli-tui-v2/dev-plan.md`（Plan Gate，人读摘要）
Spec: `.agent-dev/specs/cli-tui-v2/spec.json`
Decisions: `.agent-dev/specs/cli-tui-v2/decision-record.json` (D101-D114)
Task: `.agent-dev/tasks/T002.json`
Context: `.agent-dev/context/code_map.md`

---

## 架构约束

```
CLI 层:
  Commander.js（路由）→ ink v7（TUI 入口：trader 默认 / trader chat 无 --eval）
                       → 文本输出（analyze / scan / report / chart / data / config / server / chat --eval）

后端层:
  FastAPI :8000
    /api/intel/context/build       — 新增 related_hypotheses 注入（D102）
    /api/intel/report/check + save — 新增 report_cache 路由（D105/D113）
    /api/intel/news/ingest         — 新增 news_crawler 路由（D103）
    /api/intel/signals/scan        — 响应新增 anomaly_dashboard / pattern_alerts / cross_asset（D111）
    /api/intel/hypotheses          — 扩 SELECT 字段补 professional_explanation（D102 配套）
```

## What NOT to do

- 不修改 `apps/trader-agent/backend/app/modules/`, `apps/trader-agent/backend/app/core/`, `apps/trader-cockpit/`
- 不废弃 Commander.js
- 不为 TUI 和命令行各维护一份业务逻辑（共享 `api/client.ts`）
- 不新建 `app/intel/db/migrations_v2.py`（D114 — 所有 schema 演进进 `schema.py` 单文件 + `_migrate_*_columns`）
- 不把 `cross_asset` / `pattern_matcher` 塞进 `SCANNERS` registry（D111 — 类型不匹配，作为独立 pass）

---

## Step 0：前置 — 修 tools.ts 编码 mojibake

现状 `apps/trader-cli/src/llm/tools.ts` 所有中文都是 `?`（GBK→UTF-8 解码错误），P1 必须先修这个文件再 modify，否则在乱码基础上 modify 会越改越乱。

```bash
# 1. 用 git 查最近一次正确编码的版本（如有）
git log --oneline apps/trader-cli/src/llm/tools.ts

# 2. 如果远端无正确版本，按 spec 重写以下中文字段（保留所有 import / 函数结构 / tool 名称不变）：
#    - SYSTEM_PROMPT 多行中文
#    - 每个 tool 的 description 字段
#    - 每个 z.string().describe(...) 中的中文
```

如有疑问参考 `.agent-dev/specs/forward-market-intel/spec.md` 中关于 LLM 系统提示词的描述，**不要凭空编**。修完后保存为 UTF-8 BOM-less，确认 `Get-Content -Encoding UTF8 tools.ts | Select-String "Forward"` 输出可读。

---

## Phase 0: ink TUI 框架搭建

### 依赖

```bash
cd apps/trader-cli
npm install ink@7 ink-ui react asciichart
npm install --save-dev @types/react
```

### 文件结构

```
apps/trader-cli/src/tui/
  app.tsx              ← ink 主入口 <App> 组件
  components/
    Sidebar.tsx        ← 左侧菜单（dashboard / chat / signals / lessons / settings）
    ContentArea.tsx    ← 右侧内容区（根据选中菜单渲染 page）
    StatusBar.tsx      ← 顶部状态栏（price / signal_count / health）
    HotkeyBar.tsx      ← 底部快捷键栏
  pages/
    DashboardPage.tsx
    ChatPage.tsx       ← P1 实现
    SignalsPage.tsx
    LessonsPage.tsx
    SettingsPage.tsx
```

### Commander.js 集成（D101 + D112）

```typescript
// src/index.ts
program
  .command("tui", { isDefault: true })  // trader 无参数 → TUI
  .action(async () => { /* render <App /> */ });

program
  .command("chat")
  .option("--eval <prompt>", "Non-interactive one-shot prompt (CI smoke)")
  .action(async (opts: { eval?: string }) => {
    if (opts.eval) {
      // D112: --eval 走旧 readline / chatEval 路径，保留 CI 兼容
      await chatEval(opts.eval);
      return;
    }
    // 无 --eval → 进 ink TUI ChatPage
    const { render } = await import("ink");
    const { ChatPage } = await import("./tui/pages/ChatPage");
    render(<ChatPage />);
  });

// 以下保持命令行文本输出
program.command("analyze <symbol>").action(analyze);
program.command("scan").action(scan);
program.command("report <symbol>").action(report);
program.command("chart <symbol>").action(chart);
program.command("server <action>").action(server);
program.command("data <action>").action(data);
program.command("config <action>").action(config);
```

ink 渲染：

```typescript
import { render } from "ink";
render(<App />);
```

### P0 验收

```bash
cd apps/trader-cli && npx tsx src/index.ts
# → 终端清屏，显示左侧菜单 + 右侧空白内容区 + 底部快捷键栏
# → Ctrl+C 正常退出
```

---

## Phase 1: chat TUI + related_hypotheses 注入

### 关键决策

- **D102** — context/build 注入 related_hypotheses（业务记录层，来自 hypotheses 表 SQL）
- **D108** — chat 对话历史是客户端 messages 内存（最近 20 轮），跟 D102 完全独立
- **D112** — `chat --eval` 走旧 readline 路径

### D102 实施 — `app/intel/api/context.py` 加 helper

在 `build_context()` 末尾追加：

```python
context["related_hypotheses"] = _list_related_hypotheses(engine, symbols, limit=3)
```

新增 helper（放在 `_list_signals_for_symbols` 旁边）：

```python
def _list_related_hypotheses(engine, symbols: list[str], limit: int = 3) -> list[dict]:
    """同 symbol 最近 N 条 hypothesis，按 created_at 倒序。D102。"""
    if not symbols:
        return []
    placeholders = ",".join(f":sym{i}" for i in range(len(symbols)))
    params = {f"sym{i}": s.upper() for i, s in enumerate(symbols)}
    params["limit"] = limit
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                f"""
                SELECT created_at, claim, professional_explanation, confidence,
                       tradability, symbol
                FROM hypotheses
                WHERE symbol IN ({placeholders})
                ORDER BY created_at DESC
                LIMIT :limit
                """
            ),
            params,
        ).mappings().all()
    return [
        {
            "date": r["created_at"],
            "claim": r["claim"],
            "professional_explanation": r["professional_explanation"],
            "confidence": r["confidence"],
            "tradability": r["tradability"],
            "symbol": r["symbol"],
        }
        for r in rows
    ]
```

### D102 配套 — `app/intel/api/hypotheses.py` 扩 SELECT

现有 `list_hypotheses` 的 SELECT 没拿 `professional_explanation`。改为：

```python
SELECT hypothesis_id, signal_id, ts, symbol, claim,
       professional_explanation, plain_language_explanation,
       confidence, tradability, invalidation_condition, status, created_at
FROM hypotheses
```

这一步同时让 `GET /api/intel/hypotheses?symbol=X` 端点也能返回详细字段，CLI 的 `getRelatedHypotheses` tool 可直接复用。

### CLI tool 新增 `getRelatedHypotheses` — `src/llm/tools.ts`

```typescript
getRelatedHypotheses: tool({
  description: "获取同标的的历史假设（最近 N 条），用于连续跟踪分析",
  parameters: z.object({
    symbol: z.string(),
    limit: z.number().default(3),
  }),
  execute: async ({ symbol, limit }) =>
    fetchIntel(`/hypotheses?symbol=${encodeURIComponent(symbol)}&limit=${limit}`),
}),
```

### ChatPage.tsx（D108）

```typescript
import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { generateText } from "ai";
import { getModel } from "../../llm/provider";
import { INTEL_TOOLS, SYSTEM_PROMPT } from "../../llm/tools";

const MAX_HISTORY = 20;

export const ChatPage: React.FC = () => {
  const [messages, setMessages] = useState<{role: "user"|"assistant"; content: string}[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (value: string) => {
    if (!value) return;
    setBusy(true);
    const next = [...messages, { role: "user" as const, content: value }].slice(-MAX_HISTORY);
    setMessages(next);
    setInput("");

    const result = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      messages: next,
      tools: INTEL_TOOLS,
      maxSteps: 10,
    });

    setMessages([...next, { role: "assistant", content: result.text }].slice(-MAX_HISTORY));
    setBusy(false);
  };

  return (
    <Box flexDirection="column">
      {/* 对话历史 */}
      {messages.map((m, i) => (
        <Box key={i} marginBottom={1}>
          <Text color={m.role === "user" ? "cyan" : "white"}>
            {m.role === "user" ? "> " : ""}
            {m.content}
          </Text>
        </Box>
      ))}
      {/* 输入区 */}
      <Box>
        <Text>{busy ? "..." : ">"} </Text>
        <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
      </Box>
    </Box>
  );
};
```

**重点**：

- `messages` 始终保持最近 20 轮（`.slice(-MAX_HISTORY)`），每次 generateText 都把完整 messages 传进去
- `related_hypotheses` 不在 messages 里，由 LLM 自主决定要不要调 `getRelatedHypotheses` tool 或 `buildContext` tool 拿
- 业务记录注入（D102）和会话连贯性（D108）完全解耦

### P1 验收

```bash
trader chat --eval "看一下 TSLA 之前的假设"
# → LLM 调 buildContext 或 getRelatedHypotheses，输出文本包含至少 1 条历史 claim
trader chat
# → 进 ink ChatPage，多轮对话上下文连贯
```

---

## Phase 2: 报表缓存 + 市场数据 TTL

### 关键决策

- **D105** — `UNIQUE(symbol, report_date, latest_signal_ts)` 唯一键
- **D113** — `/report/check` 服务端实时 SELECT MAX(ts) FROM signals 注入 latest_signal_ts
- **D109** — `ingest_symbol` 在 TTL 内 **short-circuit HTTP**（不调 yfinance）
- **D114** — schema 改动进 `schema.py` 单文件 + `_migrate_*_columns`

### report_cache 表（D114）

在 `apps/trader-agent/backend/app/intel/db/schema.py` 的 `_SCHEMA_STATEMENTS` 追加：

```python
"""
CREATE TABLE IF NOT EXISTS report_cache (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  report_date TEXT NOT NULL,
  latest_signal_ts TEXT,
  report_json TEXT NOT NULL,
  content_hash TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(symbol, report_date, latest_signal_ts)
)
""",
"CREATE INDEX IF NOT EXISTS idx_report_cache_symbol_date ON report_cache(symbol, report_date)",
```

### market_bars.ingested_at 列（D114）

在 `schema.py` 加 `_MARKET_BARS_COLUMN_MIGRATIONS`，仿照现有 `_LESSON_COLUMN_MIGRATIONS`：

```python
_MARKET_BARS_COLUMN_MIGRATIONS = (
    ("ingested_at", "TEXT"),
)

def _migrate_market_bars_columns(conn) -> None:
    existing = {row[1] for row in conn.execute(text("PRAGMA table_info(market_bars)")).fetchall()}
    for column, ddl in _MARKET_BARS_COLUMN_MIGRATIONS:
        if column not in existing:
            conn.execute(text(f"ALTER TABLE market_bars ADD COLUMN {column} {ddl}"))
```

然后在 `init_intel_db` 内 `_migrate_lessons_columns(conn)` 旁边调用 `_migrate_market_bars_columns(conn)`。

### TTL short-circuit（D109）— `app/intel/ingestion/market_data.py`

修改 `ingest_symbol`：

```python
TTL_DAILY_HOURS = 24
TTL_MINUTE_HOURS = 1

def _is_within_ttl(engine, symbol: str, timeframe: str, ttl_hours: int) -> bool:
    """检查最新 bar 的 ingested_at 是否在 TTL 内。命中返回 True，调用方应跳过 HTTP。D109。"""
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT ingested_at FROM market_bars
                WHERE symbol=:symbol AND timeframe=:timeframe AND ingested_at IS NOT NULL
                ORDER BY ts DESC LIMIT 1
                """
            ),
            {"symbol": symbol, "timeframe": timeframe},
        ).fetchone()
    if not row or not row[0]:
        return False
    last_ingested = datetime.fromisoformat(row[0].replace("Z", "+00:00"))
    return (datetime.now(UTC) - last_ingested) < timedelta(hours=ttl_hours)

def ingest_symbol(engine, symbol, *, settings=None, daily_lookback=120, minute_lookback=30):
    # D109: 先查 TTL，命中则 short-circuit HTTP
    daily_fresh = _is_within_ttl(engine, symbol, "1d", TTL_DAILY_HOURS)
    minute_fresh = _is_within_ttl(engine, symbol, "5m", TTL_MINUTE_HOURS)

    if daily_fresh and minute_fresh:
        logger.info("Skipping %s ingest (TTL hit)", symbol)
        return (0, 0)

    daily_count = 0
    minute_count = 0
    now_iso = utc_now_iso()

    if not daily_fresh:
        daily_latest = _latest_bar_ts(engine, symbol, "1d")
        daily_bars = fetch_daily_bars(symbol, lookback_days=daily_lookback, settings=settings)
        if daily_latest:
            daily_bars = [b for b in daily_bars if b.ts > daily_latest]
        daily_count = _insert_bars(engine, daily_bars, ingested_at=now_iso)

    if not minute_fresh:
        minute_latest = _latest_bar_ts(engine, symbol, "5m")
        minute_bars = fetch_minute_bars(symbol, interval="5m", lookback_days=minute_lookback, settings=settings)
        if minute_latest:
            minute_bars = [b for b in minute_bars if b.ts > minute_latest]
        minute_count = _insert_bars(engine, minute_bars, ingested_at=now_iso)

    return daily_count, minute_count
```

`_insert_bars` 加 `ingested_at` 参数，写入新列。

### `/api/intel/report/check` 端点（D113）

新建 `app/intel/api/report_cache.py`：

```python
from fastapi import APIRouter, Request
from pydantic import BaseModel
from sqlalchemy import text
from app.intel.db.connection import get_intel_engine

router = APIRouter()

class CheckRequest(BaseModel):
    symbol: str
    date: str  # YYYY-MM-DD

@router.post("/check")
def check_report(request: Request, payload: CheckRequest) -> dict:
    engine = get_intel_engine(request.app.state.settings)
    sym = payload.symbol.upper()
    with engine.connect() as conn:
        # D113: 实时算 latest_signal_ts
        lts_row = conn.execute(
            text("SELECT MAX(ts) FROM signals WHERE symbol=:symbol"),
            {"symbol": sym},
        ).fetchone()
        latest_signal_ts = lts_row[0] if lts_row else None

        row = conn.execute(
            text(
                """
                SELECT report_json, created_at FROM report_cache
                WHERE symbol=:symbol AND report_date=:date AND latest_signal_ts IS :lts
                LIMIT 1
                """
            ) if latest_signal_ts is None else text(
                """
                SELECT report_json, created_at FROM report_cache
                WHERE symbol=:symbol AND report_date=:date AND latest_signal_ts=:lts
                LIMIT 1
                """
            ),
            {"symbol": sym, "date": payload.date, "lts": latest_signal_ts},
        ).mappings().fetchone()

    if row:
        return {"hit": True, "report": row["report_json"], "cached_at": row["created_at"]}
    return {"hit": False, "latest_signal_ts": latest_signal_ts}

class SaveRequest(BaseModel):
    symbol: str
    date: str
    latest_signal_ts: str | None = None
    report_json: str
    content_hash: str | None = None
```

`/save` 端点 INSERT OR REPLACE 到 report_cache。

### 挂载路由 — `app/intel/api/__init__.py`

```python
from app.intel.api import context, corpus, events, hypotheses, jobs, lessons, market, news, report_cache, signals, trade_ideas

intel_router.include_router(report_cache.router, prefix="/report", tags=["intel-report"])
intel_router.include_router(news.router, prefix="/news", tags=["intel-news"])
```

### CLI report 命令 — `src/commands/report.ts`

```typescript
export async function report(symbol: string) {
  const today = new Date().toISOString().slice(0, 10);

  const check = await fetchIntel("/report/check", {
    method: "POST",
    body: JSON.stringify({ symbol, date: today }),
  });

  if (check.hit) {
    console.log(`[缓存命中] ${symbol} ${today}（cached_at: ${check.cached_at}）`);
    console.log(check.report);
    return;
  }

  // miss → context/build + LLM → /report/save
  const context = await fetchIntel("/context/build", {
    method: "POST",
    body: JSON.stringify({ symbols: [symbol], taskType: "signal_explanation" }),
  });
  const result = await generateText({ model: getModel(), system: REPORT_SYSTEM, prompt: JSON.stringify(context), tools: INTEL_TOOLS });

  await fetchIntel("/report/save", {
    method: "POST",
    body: JSON.stringify({
      symbol,
      date: today,
      latest_signal_ts: check.latest_signal_ts,
      report_json: result.text,
    }),
  });

  console.log(result.text);
}
```

### P2 验收

```bash
trader report TSLA   # 第一次调 LLM
trader report TSLA   # 第二次 <1s 返回，控制台显示 [缓存命中]
trader scan          # 新信号入库
trader report TSLA   # latest_signal_ts 变了，cache miss 重算

# pytest（V105 + V108）
.venv/Scripts/python.exe -m pytest \
  apps/trader-agent/backend/tests/test_intel_cache_report.py \
  apps/trader-agent/backend/tests/test_intel_cache_market_ttl.py -v
```

`test_intel_cache_market_ttl.py` 必须 mock `yfinance.Ticker.history`，断言 TTL 内 `.history.call_count == 0`。

---

## Phase 3: 探索发现

### 关键决策

- **D110** — `patterns.trigger_sql` 加列后必须 `_migrate_pattern_trigger_sql(conn)` 显式 UPDATE 回填 5 条 MVP_PATTERNS
- **D111** — `cross_asset` / `pattern_matcher` 不进 SCANNERS registry，独立 pass

### patterns.trigger_sql 列 + 回填（D110）

在 `schema.py`：

```python
_PATTERN_TRIGGER_SQL = {
    "taco_pattern": "SELECT COUNT(*) FROM events WHERE event_type='policy_threat' AND ts > date('now','-3 days')",
    "higher_low_accumulation": "SELECT COUNT(*) FROM signals WHERE signal_type='higher_low_candidate' AND ts > datetime('now','-1 day')",
    "volume_contraction_pullback": "SELECT COUNT(*) FROM signals WHERE signal_type='volume_contraction' AND ts > datetime('now','-1 day')",
    "vwap_reclaim": "SELECT COUNT(*) FROM signals WHERE signal_type='reclaim_vwap' AND ts > datetime('now','-4 hour')",
    "relative_strength_divergence": "SELECT COUNT(*) FROM signals WHERE signal_type IN ('relative_weakness','relative_strength') AND ts > datetime('now','-1 day')",
}

def _migrate_pattern_trigger_sql(conn) -> None:
    """加 trigger_sql 列 + 显式回填 5 条 MVP_PATTERNS。D110。"""
    existing = {row[1] for row in conn.execute(text("PRAGMA table_info(patterns)")).fetchall()}
    if "trigger_sql" not in existing:
        conn.execute(text("ALTER TABLE patterns ADD COLUMN trigger_sql TEXT"))
    for pattern_id, sql in _PATTERN_TRIGGER_SQL.items():
        conn.execute(
            text("UPDATE patterns SET trigger_sql = :sql WHERE pattern_id = :pid AND (trigger_sql IS NULL OR trigger_sql = '')"),
            {"sql": sql, "pid": pattern_id},
        )
```

`init_intel_db` 调用 `_migrate_pattern_trigger_sql(conn)`。

### pattern_matcher 独立 pass（D111）— `app/intel/features/pattern_matcher.py`

```python
def scan_patterns(engine) -> list[dict]:
    """遍历 patterns.trigger_sql，触发条件满足 → 生成 pattern_alert signal。"""
    alerts = []
    with engine.connect() as conn:
        patterns = conn.execute(
            text("SELECT pattern_id, name, trigger_sql, affected_assets, reliability_score FROM patterns WHERE trigger_sql IS NOT NULL")
        ).mappings().all()
    for p in patterns:
        try:
            with engine.connect() as conn:
                hit = conn.execute(text(p["trigger_sql"])).scalar()
            if hit and hit > 0:
                alerts.append({
                    "pattern_id": p["pattern_id"],
                    "pattern_name": p["name"],
                    "affected_assets": p["affected_assets"],
                    "match_count": hit,
                    "reliability_score": p["reliability_score"],
                })
        except Exception as exc:
            logger.warning("pattern_matcher %s failed: %s", p["pattern_id"], exc)
    return alerts
```

### cross_asset 独立 pass（D111）— `app/intel/features/cross_asset.py`

```python
def calc_cross_asset_correlation(engine, symbols: list[str], days: int = 5) -> dict:
    """返回 {pairs: [{a, b, corr}], anomalies: [{pair, current_corr, avg_corr}]}"""
    import numpy as np
    returns_by_symbol = {}
    for sym in symbols:
        bars = get_bars_from_db(engine, sym, "1d", limit=days + 1)
        if len(bars) < 2:
            continue
        returns_by_symbol[sym] = np.diff([b["close"] for b in bars]) / [b["close"] for b in bars[:-1]]
    pairs = []
    for i, a in enumerate(symbols):
        for b in symbols[i+1:]:
            if a in returns_by_symbol and b in returns_by_symbol:
                ra, rb = returns_by_symbol[a], returns_by_symbol[b]
                n = min(len(ra), len(rb))
                if n < 2:
                    continue
                corr = float(np.corrcoef(ra[:n], rb[:n])[0, 1])
                pairs.append({"a": a, "b": b, "corr": round(corr, 3)})
    return {"pairs": pairs, "anomalies": []}  # anomalies 留 P3 后期补
```

### anomaly_dashboard — 在 `scanner.py` 内做聚合

```python
def build_anomaly_dashboard(engine) -> list[dict]:
    """按 severity 排序 top-N 信号，给 LLM 一个总览。"""
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT symbol, signal_type, severity, raw_description
                FROM signals
                WHERE datetime(ts) > datetime('now','-1 day')
                ORDER BY severity DESC LIMIT 10
                """
            )
        ).mappings().all()
    return [
        {"symbol": r["symbol"], "rank": i+1, "anomaly": r["raw_description"]}
        for i, r in enumerate(rows)
    ]
```

### signals/scan 响应聚合 — `app/intel/api/signals.py`

```python
def scan_signals(request: Request) -> dict:
    engine = get_intel_engine(request.app.state.settings)
    from app.intel.features.pattern_matcher import scan_patterns
    from app.intel.features.cross_asset import calc_cross_asset_correlation
    from app.intel.features.scanner import build_anomaly_dashboard

    scan_result = scan_all_symbols(engine)  # {"signal_count": int}
    return {
        **scan_result,
        "anomaly_dashboard": build_anomaly_dashboard(engine),
        "pattern_alerts": scan_patterns(engine),
        "cross_asset": calc_cross_asset_correlation(engine, MVP_SYMBOL_LIST, days=5),
    }
```

注意：**`SCANNERS` registry 不变**。`scan_all_symbols` 签名也可以不变（返回 dict 直接 spread）。

### P3 验收

```bash
trader scan
# → 返回带 anomaly_dashboard / pattern_alerts / cross_asset 三字段

# pytest（V110）
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_intel_pattern_matcher.py -v
# 测试用例必须含：
#  - test_migration_backfills_all_5_patterns_trigger_sql
#  - test_pattern_matcher_inserts_alert_when_trigger_hits
```

---

## Phase 4: K 线图 + 服务管理

### asciichart K 线图 — `src/commands/chart.ts`

```typescript
import asciichart from "asciichart";
import { fetchIntel } from "../api/client";

export async function chart(symbol: string) {
  const bars = await fetchIntel(`/market/bars?symbol=${symbol}&timeframe=1d&limit=30`);
  const closes = bars.map((b: any) => b.close);
  console.log(`${symbol} — 最近 ${closes.length} 日收盘价`);
  console.log(asciichart.plot(closes, { height: 15 }));
}
```

### 服务管理 — `src/commands/server.ts`（D106: Windows + macOS）

```typescript
import { spawn, exec } from "child_process";
import { fetchIntel } from "../api/client";

const PORT = 8000;

export async function server(action: string) {
  switch (action) {
    case "start": return serverStart();
    case "stop":  return serverStop();
    case "status": return serverStatus();
    default: throw new Error(`Unknown server action: ${action}`);
  }
}

async function serverStart() {
  spawn("npm", ["run", "trader-agent:backend:dev"], {
    detached: true,
    stdio: "ignore",
    shell: true,
  }).unref();
  console.log(`后端已启动（端口 ${PORT}），用 trader server status 确认`);
}

async function serverStop() {
  if (process.platform === "win32") {
    exec(
      `powershell -Command "Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"`,
      (err) => console.log(err ? `[已忽略] ${err.message}` : `已停止端口 ${PORT} 监听进程`),
    );
  } else if (process.platform === "darwin") {
    exec(`lsof -ti tcp:${PORT} | xargs -r kill`, (err) =>
      console.log(err ? `[已忽略] ${err.message}` : `已停止端口 ${PORT} 监听进程`),
    );
  } else {
    throw new Error(`trader server stop 不支持 ${process.platform}（D106: 仅 Windows + macOS）`);
  }
}

async function serverStatus() {
  try {
    const res = await fetchIntel("/../health");  // /health 在 /api/intel 之外
    console.log(res);
  } catch (e: any) {
    console.log(`后端未运行或无响应：${e.message}`);
  }
}
```

注意 `/health` 不在 `/api/intel` 前缀下，要么 `fetch(http://127.0.0.1:8000/health)` 直接发，要么在 client.ts 加个 `fetchHealth()` helper。

### P4 验收

```bash
trader server start
trader server status
# → { status: "ok", intel_route_count: >=14 }
trader chart TSLA
# → 终端渲染 ASCII K 线
trader server stop
# → 端口 8000 进程结束
```

---

## Phase 5: 新闻爬虫 + 配置 + data status

### 新闻爬虫 — `app/intel/ingestion/news_crawler.py`（D103）

```python
import feedparser  # pip install feedparser
import urllib.request
from html.parser import HTMLParser
from app.intel.ingestion.events_ingest import create_event

RSS_FEEDS = [
    ("Reuters Business", "https://www.reutersagency.com/feed/?best-topics=business-finance"),
    # 增删源在此
]

def crawl_rss(feed_url: str) -> list[dict]:
    feed = feedparser.parse(feed_url)
    return [
        {
            "ts": entry.get("published", ""),
            "title": entry.get("title", ""),
            "raw_text": _strip_html(entry.get("summary", "")),
            "url": entry.get("link", ""),
        }
        for entry in feed.entries
    ]

def crawl_alpha_vantage_news(symbol: str, api_key: str) -> list[dict]:
    url = f"https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers={symbol}&apikey={api_key}"
    with urllib.request.urlopen(url, timeout=15) as r:
        data = json.load(r)
    return [{...} for item in data.get("feed", [])]

def crawl_url(url: str) -> list[dict]:
    # 通用网页抓取（BeautifulSoup 或 readability）
    ...

def ingest_news(settings, engine) -> int:
    """爬取 → 清洗（去 HTML、截断 >2000 字）→ 去重（event_id hash）→ events 表。
    返回新增事件数。"""
    inserted = 0
    for name, feed_url in RSS_FEEDS:
        items = crawl_rss(feed_url)
        for item in items:
            try:
                create_event(
                    engine,
                    ts=item["ts"],
                    event_type="news",
                    title=item["title"][:200],
                    raw_text=item["raw_text"][:2000],
                    source=name,
                    source_type="news",
                    url=item["url"],
                )
                inserted += 1
            except Exception:
                pass  # 去重失败等
    return inserted
```

### `/api/intel/news/ingest` — `app/intel/api/news.py`

```python
from fastapi import APIRouter, Request
from app.intel.db.connection import get_intel_engine
from app.intel.ingestion.news_crawler import ingest_news

router = APIRouter()

@router.post("/ingest")
def trigger_news_ingest(request: Request) -> dict:
    settings = request.app.state.settings
    engine = get_intel_engine(settings)
    count = ingest_news(settings, engine)
    return {"inserted": count}
```

挂载到 `app/intel/api/__init__.py`（已在 P2 步骤里同步加 `news.router`）。

### 数据状态 — `src/commands/data.ts`

```typescript
trader data status
# 输出每个 symbol 的 1d 和 5m 行数 + ts 范围 + ingested_at
```

调 `GET /api/intel/market/bars-status`（如不存在新建）返回每标的的 `{symbol, daily_count, daily_range, minute_count, last_ingested}`。

### 配置管理 — `src/commands/config.ts`

```bash
trader config show              # 显示 .env（脱敏）+ DB 配置
trader config set LLM_PROVIDER anthropic
trader config symbols add MSTR  # 扩展标的池
```

只修改 `.env` 文件（脱敏显示），symbols 修改 `apps/trader-agent/backend/app/intel/db/schema.py` 的 `MVP_SYMBOLS` 列表？**不行** — D114 schema.py 是后端文件，CLI 不应改后端代码。改为：写入 `.env` 或 `data/intel-config.json`，由后端启动时读取覆盖默认 MVP_SYMBOLS。如 MVP 阶段先不实现 `symbols add`，给个 TODO 注释即可。

### P5 验收

```bash
curl -X POST http://127.0.0.1:8000/api/intel/news/ingest
# → {"inserted": N}
# 然后 V106 命令自动校验 events 表
```

---

## Verification 矩阵

| ID | 验收 | blocking |
|---|---|---|
| V101 | `trader` 启动 ink TUI，侧栏菜单可见 | true |
| V102 | `trader chat` 进 ChatPage，多轮 messages 维护 | true |
| V103 | `trader chart TSLA` ASCII K 线 | false |
| V104 | `trader report TSLA` ×2，第二次缓存命中 | true |
| V105 | `pytest test_intel_cache_report.py` 全过 | true |
| V106 | `/news/ingest` + events 表有 source_type='news' 记录 | true |
| V107 | `trader server status` 返回 intel_route_count>=14 | true |
| V108 | `pytest test_intel_cache_market_ttl.py` mock 断言 0 HTTP calls | true |
| V109 | `chat --eval "..."` 输出含历史 claim | false |
| V110 | `pytest test_intel_pattern_matcher.py` 全过（含 migration 回填 + alert 触发） | true |

## Important

- `npm install ink@7 ink-ui react asciichart` 在 `apps/trader-cli` 下
- 不修改 `apps/trader-agent/backend/app/modules/`, `apps/trader-agent/backend/app/core/`, `apps/trader-cockpit/`
- 不废弃已有 Commander.js 命令
- TUI 和命令行共享 `api/client.ts`（不重复写 API 调用逻辑）
- 所有 schema 改动进 `schema.py` 单文件 + `_migrate_*_columns`（D114）
- `cross_asset` / `pattern_matcher` 是独立 pass，不进 SCANNERS（D111）
- `chat --eval` 必须保留旧路径（D112）

## 回归风险清单（codegraph 自检）

修 schema.py 必跑这两个现有测试（避免 `_migrate_*` 函数语法/顺序错误导致 bootstrap 失败）：

```bash
.venv/Scripts/python.exe -m pytest \
  apps/trader-agent/backend/tests/test_intel_phase0_schema.py \
  apps/trader-agent/backend/tests/test_intel_phase6_postmortem.py -v
```

`init_intel_db` 在 `main.py:create_app` 启动时调用，也在这两个测试调用。`_migrate_pattern_trigger_sql` 和 `_migrate_market_bars_columns` 写错会让所有现有 intel 测试集体红。

`scan_all_symbols` 唯一调用方是 `scan_signals`（已在 spec.modify），改返回字段时同步改 `scan_signals` 的字段合并即可，无其他 caller。

`list_hypotheses` 和 `build_context` 无内部 caller，扩字段安全。
