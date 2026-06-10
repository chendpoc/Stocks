from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal


BarrierResult = Literal["hit_profit_first", "hit_stop_first", "hit_time_first", "none"]


@dataclass(frozen=True)
class TripleBarrierResult:
    barrier_result: BarrierResult
    bars_evaluated: int
    hit_price: float | None = None
    hit_ts: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "barrier_result": self.barrier_result,
            "bars_evaluated": self.bars_evaluated,
            "hit_price": self.hit_price,
            "hit_ts": self.hit_ts,
        }


def compute_triple_barrier(
    bars: list[dict[str, Any]],
    *,
    entry_price: float,
    profit_barrier_pct: float,
    stop_barrier_pct: float,
    time_barrier_bars: int | None = None,
) -> TripleBarrierResult:
    if entry_price <= 0 or profit_barrier_pct <= 0 or stop_barrier_pct <= 0:
        return TripleBarrierResult(barrier_result="none", bars_evaluated=0)

    path = bars[: time_barrier_bars or None]
    if not path:
        return TripleBarrierResult(barrier_result="none", bars_evaluated=0)

    profit_price = entry_price * (1 + profit_barrier_pct / 100)
    stop_price = entry_price * (1 - stop_barrier_pct / 100)

    for index, bar in enumerate(path, start=1):
        high = _to_float(bar.get("high") or bar.get("close"))
        low = _to_float(bar.get("low") or bar.get("close"))
        ts = str(bar.get("ts")) if bar.get("ts") is not None else None
        if high is None or low is None:
            continue

        hit_profit = high >= profit_price
        hit_stop = low <= stop_price
        if hit_profit and hit_stop:
            return TripleBarrierResult(
                barrier_result="hit_stop_first",
                bars_evaluated=index,
                hit_price=stop_price,
                hit_ts=ts,
            )
        if hit_profit:
            return TripleBarrierResult(
                barrier_result="hit_profit_first",
                bars_evaluated=index,
                hit_price=profit_price,
                hit_ts=ts,
            )
        if hit_stop:
            return TripleBarrierResult(
                barrier_result="hit_stop_first",
                bars_evaluated=index,
                hit_price=stop_price,
                hit_ts=ts,
            )

    return TripleBarrierResult(
        barrier_result="hit_time_first",
        bars_evaluated=len(path),
        hit_price=_to_float(path[-1].get("close")),
        hit_ts=str(path[-1].get("ts")) if path[-1].get("ts") is not None else None,
    )


def _to_float(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed
