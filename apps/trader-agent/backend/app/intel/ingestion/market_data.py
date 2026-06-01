from __future__ import annotations

import os
import time
from datetime import UTC, datetime, timedelta

import pandas as pd
import yfinance as yf
from sqlalchemy import text

from app.core.config import Settings
from app.core.time import utc_now_iso
from app.intel import logger
from app.intel.db.connection import get_intel_engine
from app.intel.db.schema import MVP_SYMBOLS
from app.intel.ingestion import alpha_vantage_data as av
from app.intel.ingestion.bars import Bar

__all__ = [
    "Bar",
    "fetch_daily_bars",
    "fetch_minute_bars",
    "fetch_chart_bars",
    "ingest_mvp_symbols",
    "get_bars_from_db",
    "get_mvp_market_status",
]

# Dashboard chart intervals → yfinance / DB
CHART_SPECS: dict[str, dict] = {
    "1m": {"db_tf": "5m", "yf_interval": "1m", "period_days": 5, "limit": 120, "downsample": 1},
    "2m": {"db_tf": None, "yf_interval": "2m", "period_days": 5, "limit": 90, "downsample": 1},
    "5m": {"db_tf": "5m", "yf_interval": "5m", "period_days": 30, "limit": 120, "downsample": 1},
    "30m": {"db_tf": None, "yf_interval": "30m", "period_days": 60, "limit": 100, "downsample": 1},
    "1h": {"db_tf": None, "yf_interval": "1h", "period_days": 365, "limit": 120, "downsample": 1},
    "2h": {"db_tf": None, "yf_interval": "1h", "period_days": 365, "limit": 120, "downsample": 2},
    "4h": {"db_tf": None, "yf_interval": "1h", "period_days": 365, "limit": 120, "downsample": 4},
    "30d": {"db_tf": "1d", "yf_interval": "1d", "period_days": 30, "limit": 30, "downsample": 1},
}

MVP_SYMBOL_LIST = [row[0] for row in MVP_SYMBOLS]

TTL_DAILY_HOURS = 24
TTL_MINUTE_HOURS = 1

# auto = yfinance first, alpha_vantage when empty or yfinance errors
# alpha_vantage = AV only (slower; respects 5 req/min on free tier)
# yfinance = Yahoo only
MARKET_DATA_PROVIDER = os.getenv("MARKET_DATA_PROVIDER", "auto").strip().lower()


def _estimate_vwap(row) -> float:
    return round((row.get("High", 0) + row.get("Low", 0) + row.get("Close", 0)) / 3, 2)


def _row_to_bar(symbol: str, timeframe: str, ts, row, df: pd.DataFrame) -> Bar:
    vwap = row.get("VWAP") if "VWAP" in df.columns and pd.notna(row.get("VWAP")) else None
    if vwap is None:
        vwap = _estimate_vwap(row)
    ts_iso = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
    return Bar(
        symbol=symbol,
        timeframe=timeframe,
        ts=ts_iso,
        open=float(row["Open"]),
        high=float(row["High"]),
        low=float(row["Low"]),
        close=float(row["Close"]),
        volume=float(row["Volume"]),
        vwap=float(vwap) if vwap is not None else None,
        source="yfinance",
    )


def _fetch_daily_yfinance(symbol: str, lookback_days: int) -> list[Bar]:
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=f"{lookback_days}d")
        if df.empty:
            logger.warning("No daily data for %s (yfinance)", symbol)
            return []
        return [_row_to_bar(symbol, "1d", ts, row, df) for ts, row in df.iterrows()]
    except Exception as exc:
        logger.warning("Failed daily bars for %s (yfinance): %s", symbol, exc)
        return []


def _fetch_minute_yfinance(symbol: str, interval: str, lookback_days: int) -> list[Bar]:
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=f"{lookback_days}d", interval=interval)
        if df.empty:
            logger.warning("No minute data for %s (yfinance)", symbol)
            return []
        return [_row_to_bar(symbol, interval, ts, row, df) for ts, row in df.iterrows()]
    except Exception as exc:
        logger.warning("Failed minute bars for %s (yfinance): %s", symbol, exc)
        return []


def fetch_daily_bars(
    symbol: str,
    lookback_days: int = 120,
    *,
    settings: Settings | None = None,
) -> list[Bar]:
    provider = MARKET_DATA_PROVIDER
    bars: list[Bar] = []

    if provider in {"auto", "yfinance"}:
        bars = _fetch_daily_yfinance(symbol, lookback_days)

    if bars or provider == "yfinance":
        return bars

    if provider in {"auto", "alpha_vantage"} and av.resolve_api_key(settings):
        try:
            bars = av.fetch_daily_bars(symbol, settings=settings)
            if bars:
                logger.info("Daily bars for %s from alpha_vantage (%s rows)", symbol, len(bars))
        except Exception as exc:
            logger.warning("Failed daily bars for %s (alpha_vantage): %s", symbol, exc)
    elif provider == "alpha_vantage":
        logger.warning("MARKET_DATA_PROVIDER=alpha_vantage but ALPHAVANTAGE_API_KEY is not set")
    return bars


def fetch_minute_bars(
    symbol: str,
    interval: str = "5m",
    lookback_days: int = 30,
    *,
    settings: Settings | None = None,
) -> list[Bar]:
    provider = MARKET_DATA_PROVIDER
    bars: list[Bar] = []

    if provider in {"auto", "yfinance"}:
        bars = _fetch_minute_yfinance(symbol, interval, lookback_days)

    if bars or provider == "yfinance":
        return bars

    if provider in {"auto", "alpha_vantage"} and av.resolve_api_key(settings):
        av_interval = "5min" if interval == "5m" else interval
        try:
            bars = av.fetch_minute_bars(symbol, settings=settings, interval=av_interval)
            if bars:
                logger.info(
                    "Minute bars for %s from alpha_vantage (%s rows)",
                    symbol,
                    len(bars),
                )
        except Exception as exc:
            logger.warning("Failed minute bars for %s (alpha_vantage): %s", symbol, exc)
    elif provider == "alpha_vantage":
        logger.warning("MARKET_DATA_PROVIDER=alpha_vantage but ALPHAVANTAGE_API_KEY is not set")
    return bars


def _latest_bar_ts(engine, symbol: str, timeframe: str) -> str | None:
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT ts FROM market_bars
                WHERE symbol = :symbol AND timeframe = :timeframe
                ORDER BY ts DESC LIMIT 1
                """
            ),
            {"symbol": symbol, "timeframe": timeframe},
        ).fetchone()
    return str(row[0]) if row else None


def _is_within_ttl(engine, symbol: str, timeframe: str, ttl_hours: int) -> bool:
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT ingested_at FROM market_bars
                WHERE symbol = :symbol AND timeframe = :timeframe AND ingested_at IS NOT NULL
                ORDER BY ts DESC LIMIT 1
                """
            ),
            {"symbol": symbol, "timeframe": timeframe},
        ).fetchone()
    if not row or not row[0]:
        return False
    raw = str(row[0]).replace("Z", "+00:00")
    try:
        last_ingested = datetime.fromisoformat(raw)
    except ValueError:
        return False
    if last_ingested.tzinfo is None:
        last_ingested = last_ingested.replace(tzinfo=UTC)
    return (datetime.now(UTC) - last_ingested) < timedelta(hours=ttl_hours)


def _insert_bars(engine, bars: list[Bar], *, ingested_at: str | None = None) -> int:
    if not bars:
        return 0
    ingested = ingested_at or utc_now_iso()
    inserted = 0
    with engine.begin() as conn:
        for bar in bars:
            result = conn.execute(
                text(
                    """
                    INSERT OR IGNORE INTO market_bars
                    (symbol, timeframe, ts, open, high, low, close, volume, vwap, source, ingested_at)
                    VALUES (:symbol, :timeframe, :ts, :open, :high, :low, :close, :volume, :vwap, :source, :ingested_at)
                    """
                ),
                {
                    "symbol": bar.symbol,
                    "timeframe": bar.timeframe,
                    "ts": bar.ts,
                    "open": bar.open,
                    "high": bar.high,
                    "low": bar.low,
                    "close": bar.close,
                    "volume": bar.volume,
                    "vwap": bar.vwap,
                    "source": bar.source,
                    "ingested_at": ingested,
                },
            )
            inserted += result.rowcount or 0
    return inserted


def ingest_symbol(
    engine,
    symbol: str,
    *,
    settings: Settings | None = None,
    daily_lookback: int = 120,
    minute_lookback: int = 30,
    force: bool = False,
) -> tuple[int, int]:
    skip_daily = (not force) and _is_within_ttl(engine, symbol, "1d", TTL_DAILY_HOURS)
    skip_minute = (not force) and _is_within_ttl(engine, symbol, "5m", TTL_MINUTE_HOURS)

    if skip_daily and skip_minute:
        logger.info("Skipping %s ingest (TTL hit)", symbol)
        return (0, 0)

    now_iso = utc_now_iso()
    daily_count = 0
    minute_count = 0
    daily_bars: list[Bar] = []
    minute_bars: list[Bar] = []

    if not skip_daily:
        daily_latest = _latest_bar_ts(engine, symbol, "1d")
        daily_bars = fetch_daily_bars(symbol, lookback_days=daily_lookback, settings=settings)
        if daily_latest:
            daily_bars = [b for b in daily_bars if b.ts > daily_latest]
        daily_count = _insert_bars(engine, daily_bars, ingested_at=now_iso)

    if not skip_minute:
        minute_latest = _latest_bar_ts(engine, symbol, "5m")
        minute_bars = fetch_minute_bars(
            symbol, interval="5m", lookback_days=minute_lookback, settings=settings
        )
        if minute_latest:
            minute_bars = [b for b in minute_bars if b.ts > minute_latest]
        minute_count = _insert_bars(engine, minute_bars, ingested_at=now_iso)
    sources = {b.source for b in daily_bars + minute_bars}
    logger.info(
        "Ingested %s: daily=%s minute=%s sources=%s",
        symbol,
        daily_count,
        minute_count,
        sorted(sources) or ["none"],
    )
    return daily_count, minute_count


def ingest_mvp_symbols(settings: Settings | None = None) -> dict[str, tuple[int, int]]:
    engine = get_intel_engine(settings)
    results: dict[str, tuple[int, int]] = {}
    use_av = MARKET_DATA_PROVIDER == "alpha_vantage" or (
        MARKET_DATA_PROVIDER == "auto" and av.resolve_api_key(settings)
    )
    pause_s = 12 if use_av else 2
    for symbol in MVP_SYMBOL_LIST:
        results[symbol] = ingest_symbol(engine, symbol, settings=settings)
        time.sleep(pause_s)
    return results


def _symbol_bar_status(engine, symbol: str) -> dict:
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT MAX(ts) AS latest_bar_ts, MAX(ingested_at) AS ingested_at
                FROM market_bars
                WHERE symbol = :symbol AND timeframe = '1d'
                """
            ),
            {"symbol": symbol},
        ).mappings().first()
    return {
        "symbol": symbol,
        "latest_bar_ts": row["latest_bar_ts"] if row else None,
        "ingested_at": row["ingested_at"] if row else None,
    }


def get_symbol_market_status(engine, symbol: str) -> dict:
    """Read-only bar freshness for one symbol (no HTTP ingest)."""
    return _symbol_bar_status(engine, symbol.upper())


def get_mvp_market_status(engine) -> dict:
    """Read-only per-symbol bar freshness (no HTTP ingest)."""
    symbols = [_symbol_bar_status(engine, symbol) for symbol in MVP_SYMBOL_LIST]
    return {"symbols": symbols}


def _bars_to_dicts(bars: list[Bar], limit: int) -> list[dict]:
    trimmed = bars[-limit:]
    return [
        {
            "symbol": b.symbol,
            "timeframe": b.timeframe,
            "ts": b.ts,
            "open": b.open,
            "high": b.high,
            "low": b.low,
            "close": b.close,
            "volume": b.volume,
            "vwap": b.vwap,
            "source": b.source,
        }
        for b in trimmed
    ]


def fetch_chart_bars(
    symbol: str,
    chart_interval: str,
    *,
    limit: int = 120,
    settings: Settings | None = None,
) -> tuple[list[dict], str]:
    """K 线预览：优先 DB，不足则 yfinance 拉取（不强制入库）。"""
    spec = CHART_SPECS.get(chart_interval.strip().lower(), CHART_SPECS["30d"])
    cap = min(max(limit, 10), spec["limit"])
    sym = symbol.upper()
    engine = get_intel_engine(settings)

    db_tf = spec.get("db_tf")
    if db_tf:
        db_rows = get_bars_from_db(engine, sym, db_tf, cap)
        if len(db_rows) >= max(8, cap // 3):
            return db_rows[-cap:], db_tf

    if spec["yf_interval"] == "1d":
        bars = fetch_daily_bars(sym, lookback_days=spec["period_days"], settings=settings)
        out_tf = "1d"
    else:
        yf_iv = spec["yf_interval"]
        days = min(int(spec["period_days"]), 60)
        bars = fetch_minute_bars(sym, interval=yf_iv, lookback_days=days, settings=settings)
        out_tf = yf_iv

    step = int(spec.get("downsample", 1))
    if step > 1:
        bars = bars[::step]
    return _bars_to_dicts(bars, cap), out_tf


def get_bars_from_db(
    engine,
    symbol: str,
    timeframe: str = "1d",
    limit: int = 20,
) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT symbol, timeframe, ts, open, high, low, close, volume, vwap, source
                FROM market_bars
                WHERE symbol = :symbol AND timeframe = :timeframe
                ORDER BY ts DESC
                LIMIT :limit
                """
            ),
            {"symbol": symbol, "timeframe": timeframe, "limit": limit},
        ).mappings().all()
    return [dict(row) for row in reversed(rows)]


def get_latest_close(engine, symbol: str) -> float | None:
    bars = get_bars_from_db(engine, symbol, timeframe="1d", limit=1)
    if not bars:
        return None
    return float(bars[-1]["close"])
