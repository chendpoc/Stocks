from __future__ import annotations

import os
import time

import pandas as pd
import yfinance as yf
from sqlalchemy import text

from app.core.config import Settings
from app.intel import logger
from app.intel.db.connection import get_intel_engine
from app.intel.db.schema import MVP_SYMBOLS
from app.intel.ingestion import alpha_vantage_data as av
from app.intel.ingestion.bars import Bar

__all__ = ["Bar", "fetch_daily_bars", "fetch_minute_bars", "ingest_mvp_symbols", "get_bars_from_db"]

MVP_SYMBOL_LIST = [row[0] for row in MVP_SYMBOLS]

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


def _insert_bars(engine, bars: list[Bar]) -> int:
    if not bars:
        return 0
    inserted = 0
    with engine.begin() as conn:
        for bar in bars:
            result = conn.execute(
                text(
                    """
                    INSERT OR IGNORE INTO market_bars
                    (symbol, timeframe, ts, open, high, low, close, volume, vwap, source)
                    VALUES (:symbol, :timeframe, :ts, :open, :high, :low, :close, :volume, :vwap, :source)
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
) -> tuple[int, int]:
    daily_latest = _latest_bar_ts(engine, symbol, "1d")
    daily_bars = fetch_daily_bars(symbol, lookback_days=daily_lookback, settings=settings)
    if daily_latest:
        daily_bars = [b for b in daily_bars if b.ts > daily_latest]

    minute_latest = _latest_bar_ts(engine, symbol, "5m")
    minute_bars = fetch_minute_bars(
        symbol, interval="5m", lookback_days=minute_lookback, settings=settings
    )
    if minute_latest:
        minute_bars = [b for b in minute_bars if b.ts > minute_latest]

    daily_count = _insert_bars(engine, daily_bars)
    minute_count = _insert_bars(engine, minute_bars)
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
