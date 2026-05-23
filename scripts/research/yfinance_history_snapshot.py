import argparse
import json
import math
import os
import sys
from typing import Any

import numpy as np


def _number(value: Any) -> float:
    try:
        if value is None:
            return math.nan
        return float(value)
    except (TypeError, ValueError):
        return math.nan


def _round(value: float, digits: int = 2) -> float | None:
    if not math.isfinite(value):
        return None
    return round(float(value), digits)


def _normalize_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows = payload.get("rows")
    if not isinstance(rows, list):
        return []

    normalized: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        close = _number(row.get("close", row.get("Close")))
        volume = _number(row.get("volume", row.get("Volume")))
        if not math.isfinite(close):
            continue
        normalized.append(
            {
                "date": str(row.get("date", row.get("Date", ""))).strip(),
                "close": close,
                "volume": volume,
            }
        )
    return normalized


def _history_from_yfinance(symbol: str, period: str) -> list[dict[str, Any]]:
    import yfinance as yf

    frame = yf.Ticker(symbol).history(period=period, auto_adjust=False)
    rows: list[dict[str, Any]] = []
    for index, row in frame.iterrows():
        close = _number(row.get("Close"))
        volume = _number(row.get("Volume"))
        if not math.isfinite(close):
            continue
        rows.append(
            {
                "date": getattr(index, "date", lambda: index)().isoformat(),
                "close": close,
                "volume": volume,
            }
        )
    return rows


def _build_snapshot(symbol: str, period: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    closes = np.array([row["close"] for row in rows], dtype=float)
    volumes = np.array([row["volume"] for row in rows if math.isfinite(row["volume"])], dtype=float)

    if closes.size == 0:
        return {
            "symbol": symbol,
            "period": period,
            "observations": 0,
            "error": "no valid close observations",
        }

    close_change = ((closes[-1] - closes[0]) / closes[0] * 100.0) if closes[0] else math.nan
    running_peak = np.maximum.accumulate(closes)
    drawdowns = np.where(running_peak != 0, (closes - running_peak) / running_peak * 100.0, 0.0)
    returns = np.diff(closes) / closes[:-1] if closes.size > 1 else np.array([], dtype=float)
    volatility = np.std(returns, ddof=1) * math.sqrt(252.0) * 100.0 if returns.size > 1 else math.nan
    latest_volume_ratio = math.nan
    if volumes.size > 1:
        baseline = float(np.mean(volumes[:-1]))
        latest_volume_ratio = float(volumes[-1] / baseline) if baseline else math.nan

    return {
        "symbol": symbol,
        "period": period,
        "observations": int(closes.size),
        "start_date": rows[0].get("date", ""),
        "end_date": rows[-1].get("date", ""),
        "first_close": _round(float(closes[0])),
        "last_close": _round(float(closes[-1])),
        "close_change_percent": _round(close_change),
        "max_drawdown_percent": _round(abs(float(np.min(drawdowns)))),
        "realized_volatility_percent": _round(volatility),
        "average_volume": _round(float(np.mean(volumes)), 0) if volumes.size else None,
        "latest_volume": _round(float(volumes[-1]), 0) if volumes.size else None,
        "latest_volume_ratio": _round(latest_volume_ratio),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a sanitized yfinance history metrics snapshot.")
    parser.add_argument("symbol")
    parser.add_argument("--period", default="30d")
    args = parser.parse_args()

    symbol = "".join(char for char in args.symbol.upper().strip() if char.isalnum() or char in ".-")
    period = args.period.strip()[:16] or "30d"
    if not symbol:
        print(json.dumps({"symbol": "", "period": period, "observations": 0, "error": "missing symbol"}))
        return 2

    try:
        fixture = os.environ.get("YFINANCE_HISTORY_FIXTURE_JSON", "").strip()
        rows = _normalize_rows(json.loads(fixture)) if fixture else _history_from_yfinance(symbol, period)
        print(json.dumps(_build_snapshot(symbol, period, rows), ensure_ascii=False))
        return 0
    except Exception as error:
        print(
            json.dumps(
                {"symbol": symbol, "period": period, "observations": 0, "error": str(error)},
                ensure_ascii=False,
            )
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
