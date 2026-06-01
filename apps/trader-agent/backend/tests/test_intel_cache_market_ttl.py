from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import text

from app.core.config import Settings
from app.core.time import utc_now_iso
from app.intel.db.connection import get_intel_engine, set_intel_db_path
from app.intel.db.schema import init_intel_db
from app.intel.ingestion.market_data import Bar, ingest_symbol


def _settings(tmp_repo: Path) -> Settings:
    return Settings(
        repo_root=tmp_repo,
        data_dir=tmp_repo / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
    )


def _seed_fresh_bars(engine, symbol: str) -> None:
    ingested = utc_now_iso()
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT OR REPLACE INTO market_bars
                (symbol, timeframe, ts, open, high, low, close, volume, source, ingested_at)
                VALUES (:symbol, '1d', '2026-05-31T00:00:00', 1, 1, 1, 100, 1, 'test', :ingested_at)
                """
            ),
            {"symbol": symbol, "ingested_at": ingested},
        )
        conn.execute(
            text(
                """
                INSERT OR REPLACE INTO market_bars
                (symbol, timeframe, ts, open, high, low, close, volume, source, ingested_at)
                VALUES (:symbol, '5m', '2026-05-31T08:00:00', 1, 1, 1, 100, 1, 'test', :ingested_at)
                """
            ),
            {"symbol": symbol, "ingested_at": ingested},
        )


@patch("app.intel.ingestion.market_data.fetch_minute_bars")
@patch("app.intel.ingestion.market_data.fetch_daily_bars")
def test_ingest_symbol_skips_http_within_ttl(
    mock_daily,
    mock_minute,
    tmp_path: Path,
) -> None:
    tmp_repo = tmp_path / "repo"
    tmp_repo.mkdir()
    set_intel_db_path(tmp_repo / "data" / "market_intel.db")
    settings = _settings(tmp_repo)
    engine = init_intel_db(settings)
    _seed_fresh_bars(engine, "TSLA")

    daily_count, minute_count = ingest_symbol(engine, "TSLA", settings=settings)

    assert daily_count == 0 and minute_count == 0
    mock_daily.assert_not_called()
    mock_minute.assert_not_called()


@patch("app.intel.ingestion.market_data.fetch_minute_bars", return_value=[])
@patch("app.intel.ingestion.market_data.fetch_daily_bars")
def test_ingest_symbol_fetches_after_ttl_expired(
    mock_daily,
    mock_minute,
    tmp_path: Path,
) -> None:
    tmp_repo = tmp_path / "repo"
    tmp_repo.mkdir()
    set_intel_db_path(tmp_repo / "data" / "market_intel.db")
    settings = _settings(tmp_repo)
    engine = init_intel_db(settings)
    old = (datetime.now(UTC) - timedelta(hours=48)).isoformat()
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO market_bars
                (symbol, timeframe, ts, open, high, low, close, volume, source, ingested_at)
                VALUES ('TSLA', '1d', '2026-05-01T00:00:00', 1, 1, 1, 100, 1, 'test', :ingested_at)
                """
            ),
            {"ingested_at": old},
        )

    mock_daily.return_value = [
        Bar(
            symbol="TSLA",
            timeframe="1d",
            ts="2026-05-31T00:00:00",
            open=1,
            high=1,
            low=1,
            close=101,
            volume=1,
            vwap=1,
            source="yfinance",
        )
    ]

    ingest_symbol(engine, "TSLA", settings=settings)
    mock_daily.assert_called_once()
