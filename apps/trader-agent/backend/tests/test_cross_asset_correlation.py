from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import Settings
from app.intel.db.connection import get_intel_engine, set_intel_db_path
from app.intel.features.cross_asset import calc_cross_asset_correlation
from app.intel.ingestion.market_data import Bar, _insert_bars, _row_to_bar
from app.main import create_app
import pandas as pd


def _settings(tmp_repo: Path) -> Settings:
    return Settings(
        repo_root=tmp_repo,
        data_dir=tmp_repo / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
    )


def test_row_to_bar_skips_nan_ohlc() -> None:
    df = pd.DataFrame(
        [{"Open": float("nan"), "High": float("nan"), "Low": float("nan"), "Close": float("nan"), "Volume": 1.0}],
        index=[pd.Timestamp("2026-06-09")],
    )
    assert _row_to_bar("QQQ", "1d", df.index[0], df.iloc[0], df) is None


def test_calc_cross_asset_correlation_skips_null_close_bars(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    tmp_repo.mkdir()
    db_path = tmp_repo / "data" / "market_intel.db"
    set_intel_db_path(db_path)
    settings = _settings(tmp_repo)
    engine = get_intel_engine(settings)
    TestClient(create_app(settings=settings))

    bars = [
        Bar("QQQ", "1d", "2026-06-07T00:00:00", 400, 401, 399, 400.5, 1_000_000, 400.5, "test"),
        Bar("QQQ", "1d", "2026-06-08T00:00:00", 401, 402, 400, 401.5, 1_000_000, 401.5, "test"),
        Bar("SPY", "1d", "2026-06-07T00:00:00", 500, 501, 499, 500.5, 1_000_000, 500.5, "test"),
        Bar("SPY", "1d", "2026-06-08T00:00:00", 501, 502, 500, 501.5, 1_000_000, 501.5, "test"),
    ]
    _insert_bars(engine, bars)

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT OR REPLACE INTO market_bars
                (symbol, timeframe, ts, open, high, low, close, volume, source)
                VALUES ('QQQ', '1d', '2026-06-09T00:00:00-04:00', NULL, NULL, NULL, NULL, 1000, 'yfinance')
                """
            )
        )

    result = calc_cross_asset_correlation(engine, ["QQQ", "SPY"], days=5)
    assert "pairs" in result
    assert isinstance(result["pairs"], list)


def test_signals_scan_survives_null_close_bars(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    tmp_repo.mkdir()
    db_path = tmp_repo / "data" / "market_intel.db"
    set_intel_db_path(db_path)
    settings = _settings(tmp_repo)
    client = TestClient(create_app(settings=settings))
    engine = get_intel_engine(settings)

    for symbol in ("QQQ", "SPY"):
        _insert_bars(
            engine,
            [
                Bar(symbol, "1d", "2026-06-07T00:00:00", 100, 101, 99, 100.5, 1_000_000, 100.5, "test"),
                Bar(symbol, "1d", "2026-06-08T00:00:00", 101, 102, 100, 101.5, 1_000_000, 101.5, "test"),
            ],
        )
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    INSERT OR REPLACE INTO market_bars
                    (symbol, timeframe, ts, open, high, low, close, volume, source)
                    VALUES (:symbol, '1d', '2026-06-09T00:00:00-04:00', NULL, NULL, NULL, NULL, 1000, 'yfinance')
                    """
                ),
                {"symbol": symbol},
            )

    resp = client.post("/api/intel/signals/scan")
    assert resp.status_code == 200
    assert "cross_asset" in resp.json()
