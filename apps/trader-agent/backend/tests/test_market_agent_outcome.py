from __future__ import annotations

from app.intel.market_agent.outcome import compute_triple_barrier


def test_compute_triple_barrier_hits_profit_first() -> None:
    result = compute_triple_barrier(
        [
            {"ts": "2026-06-01T09:35:00Z", "close": 101.0, "high": 101.5, "low": 99.5},
            {"ts": "2026-06-01T09:40:00Z", "close": 103.0, "high": 103.5, "low": 102.0},
        ],
        entry_price=100.0,
        profit_barrier_pct=3.0,
        stop_barrier_pct=2.0,
    )

    assert result.barrier_result == "hit_profit_first"
    assert result.bars_evaluated == 2


def test_compute_triple_barrier_hits_stop_first_conservatively_on_same_bar() -> None:
    result = compute_triple_barrier(
        [{"ts": "2026-06-01T09:35:00Z", "close": 100.0, "high": 104.0, "low": 97.0}],
        entry_price=100.0,
        profit_barrier_pct=3.0,
        stop_barrier_pct=2.0,
    )

    assert result.barrier_result == "hit_stop_first"
    assert result.bars_evaluated == 1


def test_compute_triple_barrier_returns_time_or_none() -> None:
    time_result = compute_triple_barrier(
        [
            {"ts": "2026-06-01T09:35:00Z", "close": 100.5, "high": 101.0, "low": 99.5},
            {"ts": "2026-06-01T09:40:00Z", "close": 101.0, "high": 101.5, "low": 100.0},
        ],
        entry_price=100.0,
        profit_barrier_pct=3.0,
        stop_barrier_pct=2.0,
        time_barrier_bars=1,
    )
    assert time_result.barrier_result == "hit_time_first"
    assert time_result.bars_evaluated == 1

    none_result = compute_triple_barrier(
        [],
        entry_price=100.0,
        profit_barrier_pct=3.0,
        stop_barrier_pct=2.0,
    )
    assert none_result.barrier_result == "none"
