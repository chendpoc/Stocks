from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.intel.db.connection import get_intel_engine, set_intel_db_path
from app.main import create_app


def _settings(tmp_repo: Path) -> Settings:
    return Settings(
        repo_root=tmp_repo,
        data_dir=tmp_repo / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
    )


def _client(tmp_repo: Path) -> TestClient:
    set_intel_db_path(tmp_repo / "data" / "market_intel.db")
    return TestClient(create_app(settings=_settings(tmp_repo)))


@patch("app.intel.ingestion.market_data.fetch_minute_bars")
@patch("app.intel.ingestion.market_data.fetch_daily_bars")
def test_ingest_symbol_endpoint(mock_daily, mock_minute, tmp_path: Path) -> None:
    from app.intel.ingestion.bars import Bar

    tmp_repo = tmp_path / "repo"
    tmp_repo.mkdir()
    mock_daily.return_value = [
        Bar(
            symbol="AAPL",
            timeframe="1d",
            ts="2026-05-31T00:00:00",
            open=1,
            high=2,
            low=1,
            close=2,
            volume=100,
            vwap=1.5,
            source="test",
        )
    ]
    mock_minute.return_value = []

    client = _client(tmp_repo)
    res = client.post("/api/intel/market/ingest/AAPL")
    assert res.status_code == 200
    body = res.json()
    assert body["symbol"] == "AAPL"
    assert body["daily"] >= 1
    assert mock_daily.called
    assert mock_daily.call_args[0][0] == "AAPL"
