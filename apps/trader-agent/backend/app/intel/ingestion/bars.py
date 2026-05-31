from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Bar:
    symbol: str
    timeframe: str
    ts: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    vwap: float | None
    source: str
