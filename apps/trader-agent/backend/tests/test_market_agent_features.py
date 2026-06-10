from __future__ import annotations

from pathlib import Path

from app.core.config import Settings
from app.intel.db.connection import set_intel_db_path
from app.intel.db.schema import init_intel_db
from app.intel.market_agent.features import FeatureComputationInput, FeatureEngine
from app.intel.market_agent.repositories import list_feature_snapshots


def _settings(tmp_repo: Path) -> Settings:
    return Settings(
        repo_root=tmp_repo,
        data_dir=tmp_repo / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
    )


def _init_db(tmp_path: Path):
    tmp_repo = tmp_path / "repo"
    db_path = tmp_repo / "data" / "market_intel.db"
    set_intel_db_path(db_path)
    return init_intel_db(_settings(tmp_repo))


def _bar(
    ts: str,
    *,
    open_: float,
    high: float,
    low: float,
    close: float,
    volume: float,
    vwap: float | None = None,
) -> dict[str, float | str | None]:
    return {
        "ts": ts,
        "open": open_,
        "high": high,
        "low": low,
        "close": close,
        "volume": volume,
        "vwap": vwap,
    }


def _ema(values: list[float], period: int) -> float | None:
    if len(values) < period:
        return None
    alpha = 2 / (period + 1)
    ema = values[0]
    for value in values[1:]:
        ema = (value * alpha) + (ema * (1 - alpha))
    return round(ema, 10)


def _ts(base_minute: int) -> str:
    return f"2026-06-10T09:{base_minute:02d}:00Z" if base_minute < 60 else f"2026-06-10T10:{base_minute - 60:02d}:00Z"


def _rel_return_two_bars(first: float, second: float) -> float:
    return round(((second - first) / first) * 100, 10)


def test_feature_engine_prefers_latest_vwap_when_present() -> None:
    engine = FeatureEngine()
    output = engine.compute(
        FeatureComputationInput(
            symbol="TSLA",
            timeframe="1d",
            bars=[
                _bar("2026-06-10T09:30:00Z", open_=100.0, high=101.0, low=99.0, close=100.0, volume=1000.0, vwap=99.0),
                _bar("2026-06-10T09:31:00Z", open_=100.0, high=102.0, low=100.0, close=101.0, volume=1500.0, vwap=101.5),
            ],
            quality_status="pass",
            quality_reason="unit",
        )
    )
    assert output["features"]["vwap"] == 101.5


def test_feature_engine_falls_back_to_volume_weighted_vwap_when_missing() -> None:
    engine = FeatureEngine()
    output = engine.compute(
        FeatureComputationInput(
            symbol="TSLA",
            timeframe="1d",
            bars=[
                _bar("2026-06-10T09:30:00Z", open_=100.0, high=101.0, low=99.0, close=100.0, volume=2.0, vwap=None),
                _bar("2026-06-10T09:31:00Z", open_=100.0, high=102.0, low=100.0, close=200.0, volume=1.0, vwap=None),
            ],
            quality_status="pass",
            quality_reason="unit",
        )
    )
    assert output["features"]["vwap"] == 133.3333333333


def test_feature_engine_compute_ema_and_atr_with_insufficient_longer_windows() -> None:
    engine = FeatureEngine()
    closes = [float(v) for v in range(1, 21)]
    bars = [
        _bar(
            _ts(idx),
            open_=value,
            high=value + 0.5,
            low=value - 0.5,
            close=value,
            volume=100.0,
        )
        for idx, value in enumerate(closes)
    ]
    output = engine.compute(
        FeatureComputationInput(
            symbol="NVDA",
            timeframe="1d",
            bars=bars,
            quality_status="pass",
            quality_reason="unit",
        )
    )
    features = output["features"]
    assert features["ema_9"] == _ema(closes, 9)
    assert features["ema_20"] == _ema(closes, 20)
    assert features["ema_50"] is None
    assert output["persistable"] is True
    assert features["atr"] == 1.5


def test_feature_engine_compute_atr_uses_true_range_with_gap() -> None:
    engine = FeatureEngine()
    bars = [
        _bar(
            "2026-06-10T09:30:00Z",
            open_=100.0,
            high=110.0,
            low=98.0,
            close=100.0,
            volume=100.0,
        ),
        _bar(
            "2026-06-10T09:31:00Z",
            open_=105.0,
            high=111.0,
            low=104.0,
            close=106.0,
            volume=100.0,
        ),
    ]
    output = engine.compute(
        FeatureComputationInput(
            symbol="NVDA",
            timeframe="1d",
            bars=bars,
            quality_status="pass",
            quality_reason="unit",
        )
    )
    assert output["features"]["atr"] == 11.0


def test_feature_engine_compute_volume_ratio_and_relative_strength() -> None:
    engine = FeatureEngine()
    symbol_bars = [
        _bar("2026-06-10T09:30:00Z", open_=100.0, high=101.0, low=99.5, close=100.0, volume=100.0),
        _bar("2026-06-10T09:31:00Z", open_=100.0, high=101.0, low=99.5, close=101.0, volume=200.0),
        _bar("2026-06-10T09:32:00Z", open_=101.0, high=102.0, low=100.5, close=102.0, volume=150.0),
        _bar("2026-06-10T09:33:00Z", open_=102.0, high=103.0, low=101.5, close=103.0, volume=120.0),
    ]
    spy_bars = [
        {"ts": "2026-06-10T09:31:00Z", "close": 401.0},
        {"ts": "2026-06-10T09:33:00Z", "close": 400.0},
    ]
    qqq_bars = [
        {"ts": "2026-06-10T09:31:00Z", "close": 300.0},
        {"ts": "2026-06-10T09:33:00Z", "close": 302.0},
    ]
    output = engine.compute(
        FeatureComputationInput(
            symbol="NVDA",
            timeframe="5m",
            bars=symbol_bars,
            quality_status="warning",
            quality_reason="unit",
            benchmark_bars={"SPY": spy_bars, "QQQ": qqq_bars},
        )
    )
    features = output["features"]
    assert features["volume_ratio"] == 0.8
    assert output["persistable"] is True
    symbol_return = _rel_return_two_bars(102.0, 103.0)
    assert features["relative_strength_spy"] == round(symbol_return - _rel_return_two_bars(401.0, 400.0), 10)
    assert features["relative_strength_qqq"] == round(symbol_return - _rel_return_two_bars(300.0, 302.0), 10)


def test_feature_engine_handles_no_bars() -> None:
    output = FeatureEngine().compute(
        FeatureComputationInput(
            symbol="EMPTY",
            timeframe="1d",
            bars=[],
            quality_status="warning",
            quality_reason="unit",
        )
    )

    assert output["features"]["symbol"] == "EMPTY"
    assert output["features"]["timeframe"] == "1d"
    assert output["tags"] == ["no_bars"]
    assert output["persistable"] is False
    assert output["metadata"]["reason"] == "no_bars"


def test_feature_engine_compute_and_persist_only_for_pass_or_warning(tmp_path: Path) -> None:
    db = _init_db(tmp_path)
    engine = FeatureEngine(db)
    bars = [
        _bar("2026-06-10T09:30:00Z", open_=100.0, high=101.0, low=99.5, close=100.0, volume=100.0, vwap=100.0),
        _bar("2026-06-10T09:31:00Z", open_=100.0, high=101.0, low=99.5, close=101.0, volume=120.0, vwap=100.5),
    ]
    bars_warning = [
        _bar("2026-06-10T09:32:00Z", open_=100.0, high=101.0, low=99.5, close=100.0, volume=100.0, vwap=100.0),
        _bar("2026-06-10T09:33:00Z", open_=100.0, high=101.0, low=99.5, close=101.0, volume=120.0, vwap=100.5),
    ]

    input_pass = FeatureComputationInput(
        symbol="NVDA",
        timeframe="5m",
        bars=bars,
        quality_status="pass",
        quality_reason="unit",
    )
    input_warning = FeatureComputationInput(
        symbol="NVDA",
        timeframe="5m",
        bars=bars_warning,
        quality_status="warning",
        quality_reason="unit",
    )
    input_failed = FeatureComputationInput(
        symbol="NVDA",
        timeframe="5m",
        bars=bars,
        quality_status="failed",
        quality_reason="unit",
    )
    input_blocked = FeatureComputationInput(
        symbol="NVDA",
        timeframe="5m",
        bars=bars,
        quality_status="blocked",
        quality_reason="unit",
    )

    pass_snapshot = engine.compute_and_persist(input_pass, db)
    warning_snapshot = engine.compute_and_persist(input_warning, db)
    failed_snapshot = engine.compute_and_persist(input_failed, db)
    blocked_snapshot = engine.compute_and_persist(input_blocked, db)

    assert pass_snapshot is not None
    assert warning_snapshot is not None
    assert failed_snapshot is None
    assert blocked_snapshot is None

    persisted = list_feature_snapshots(db, symbol="NVDA", timeframe="5m")
    assert len(persisted) == 2
