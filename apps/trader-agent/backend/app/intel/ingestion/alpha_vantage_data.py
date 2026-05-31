"""Alpha Vantage market bars for intel ingestion (REST API, not MCP)."""

from __future__ import annotations

import json
import os
import time
from typing import Any
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from app.core.config import Settings
from app.intel import logger
from app.intel.ingestion.bars import Bar

BASE_URL = "https://www.alphavantage.co/query"
# Free tier: 5 requests / minute
MIN_REQUEST_INTERVAL_S = 12.0

_last_request_at = 0.0


def resolve_api_key(settings: Settings | None = None) -> str | None:
    if settings is not None and settings.alpha_vantage_api_key:
        return settings.alpha_vantage_api_key
    return os.getenv("ALPHAVANTAGE_API_KEY") or os.getenv("ALPHA_VANTAGE_API_KEY")


def _throttle() -> None:
    global _last_request_at
    elapsed = time.monotonic() - _last_request_at
    if elapsed < MIN_REQUEST_INTERVAL_S:
        time.sleep(MIN_REQUEST_INTERVAL_S - elapsed)
    _last_request_at = time.monotonic()


def _request(params: dict[str, Any], api_key: str) -> dict[str, Any]:
    _throttle()
    query = {**params, "apikey": api_key}
    url = f"{BASE_URL}?{urlencode(query)}"
    try:
        with urlopen(url, timeout=30) as response:  # noqa: S310
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Alpha Vantage request failed: {exc}") from exc

    if "Note" in payload:
        raise RuntimeError(payload["Note"])
    if "Information" in payload:
        raise RuntimeError(payload["Information"])
    if "Error Message" in payload:
        raise RuntimeError(payload["Error Message"])
    return payload


def _bar_from_ohlcv(
    symbol: str,
    timeframe: str,
    ts: str,
    values: dict[str, Any],
) -> Bar:
    open_ = float(values["1. open"])
    high = float(values["2. high"])
    low = float(values["3. low"])
    close = float(values["4. close"])
    volume = float(values["5. volume"])
    vwap = round((high + low + close) / 3, 2)
    ts_norm = ts.replace(" ", "T") if " " in ts else ts
    return Bar(
        symbol=symbol.upper(),
        timeframe=timeframe,
        ts=ts_norm,
        open=open_,
        high=high,
        low=low,
        close=close,
        volume=volume,
        vwap=vwap,
        source="alpha_vantage",
    )


def fetch_daily_bars(
    symbol: str,
    *,
    settings: Settings | None = None,
    outputsize: str = "compact",
) -> list[Bar]:
    api_key = resolve_api_key(settings)
    if not api_key:
        return []
    raw = _request(
        {
            "function": "TIME_SERIES_DAILY",
            "symbol": symbol.upper(),
            "outputsize": outputsize,
        },
        api_key,
    )
    series = raw.get("Time Series (Daily)")
    if not isinstance(series, dict):
        logger.warning("Alpha Vantage daily series missing for %s", symbol)
        return []
    return [
        _bar_from_ohlcv(symbol, "1d", ts, values)
        for ts, values in sorted(series.items())
    ]


def fetch_minute_bars(
    symbol: str,
    *,
    settings: Settings | None = None,
    interval: str = "5min",
    outputsize: str = "compact",
) -> list[Bar]:
    api_key = resolve_api_key(settings)
    if not api_key:
        return []
    raw = _request(
        {
            "function": "TIME_SERIES_INTRADAY",
            "symbol": symbol.upper(),
            "interval": interval,
            "outputsize": outputsize,
        },
        api_key,
    )
    meta = raw.get("Meta Data", {})
    interval_label = meta.get("4. Interval", interval) if isinstance(meta, dict) else interval
    series_key = f"Time Series ({interval_label})"
    series = raw.get(series_key)
    if not isinstance(series, dict):
        logger.warning("Alpha Vantage intraday series missing for %s (%s)", symbol, series_key)
        return []
    timeframe = "5m" if interval in {"5min", "5m"} else interval
    return [
        _bar_from_ohlcv(symbol, timeframe, ts, values)
        for ts, values in sorted(series.items())
    ]
