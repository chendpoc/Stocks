from __future__ import annotations

from pathlib import Path

from sqlalchemy import text

from app.core.config import Settings
from app.intel.db.connection import set_intel_db_path
from app.intel.db.schema import init_intel_db
from app.intel.market_agent.market_data import (
    DataQualityGate,
    MarketDataService,
    evaluate_data_quality,
)


def _settings(tmp_repo: Path) -> Settings:
    return Settings(
        repo_root=tmp_repo,
        data_dir=tmp_repo / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
    )


def _setup_engine(tmp_path: Path):
    tmp_repo = tmp_path / "repo"
    db_path = tmp_repo / "data" / "market_intel.db"
    set_intel_db_path(db_path)
    return init_intel_db(_settings(tmp_repo)), _settings(tmp_repo)


def _seed_bars(engine, symbol: str, timeframe: str, bar_count: int) -> None:
    with engine.begin() as conn:
        for idx in range(bar_count):
            conn.execute(
                text(
                    """
                    INSERT OR REPLACE INTO market_bars
                    (symbol, timeframe, ts, open, high, low, close, volume, source, ingested_at)
                    VALUES (:symbol, :timeframe, :ts, :open, :high, :low, :close, :volume, :source, :ingested_at)
                    """
                ),
                {
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "ts": f"2026-06-{idx + 1:02d}T00:00:00",
                    "open": 10.0 + idx,
                    "high": 11.0 + idx,
                    "low": 9.0 + idx,
                    "close": 10.5 + idx,
                    "volume": 1000 + idx,
                    "source": "test-fixture",
                    "ingested_at": "2026-06-10T00:00:00Z",
                },
            )


def test_data_quality_gate_returns_expected_statuses() -> None:
    pass_result = evaluate_data_quality([{}, {}, {}], timeframe="1d", min_required=3)
    assert pass_result.status == "pass"

    warning_result = evaluate_data_quality([{}, {}], timeframe="1d", min_required=3)
    assert warning_result.status == "warning"

    failed_result = evaluate_data_quality([], timeframe="1d", min_required=3)
    assert failed_result.status == "failed"

    blocked_result = evaluate_data_quality([{}], timeframe="", min_required=3)
    assert blocked_result.status == "blocked"

    gate = DataQualityGate()
    assert gate([{}, {}, {}, {}], timeframe="5m", min_required=3).status == "pass"


def test_market_data_service_reads_db_and_reports_pass(tmp_path: Path) -> None:
    engine, settings = _setup_engine(tmp_path)
    _seed_bars(engine, "TSLA", "1d", bar_count=3)

    service = MarketDataService(engine, settings=settings)
    response = service.get_market_data("tsla", "1d", limit=3, min_required=3)

    assert response.quality_status == "pass"
    assert response.bar_count == 3
    assert response.source == "db"
    assert response.symbol == "TSLA"
    assert response.timeframe == "1d"


def test_market_data_service_warns_when_db_insufficient_without_fallback(tmp_path: Path) -> None:
    engine, settings = _setup_engine(tmp_path)
    _seed_bars(engine, "TSLA", "1d", bar_count=1)

    service = MarketDataService(engine, settings=settings)
    response = service.get_market_data("tsla", "1d", limit=3, min_required=3)

    assert response.quality_status == "warning"
    assert response.bar_count == 1
    assert response.source == "db"


def test_market_data_service_uses_live_fallback_and_refreshes_bars(tmp_path: Path, monkeypatch) -> None:
    engine, settings = _setup_engine(tmp_path)
    _seed_bars(engine, "tsla", "1d", bar_count=1)
    called = {"count": 0}

    def _mock_ingest_symbol(_engine, symbol, *, settings=None, force=False, **kwargs) -> tuple[int, int]:
        called["count"] += 1
        with _engine.begin() as conn:
            for idx in range(3):
                conn.execute(
                    text(
                        """
                        INSERT OR REPLACE INTO market_bars
                        (symbol, timeframe, ts, open, high, low, close, volume, source, ingested_at)
                        VALUES (:symbol, :timeframe, :ts, :open, :high, :low, :close, :volume, :source, :ingested_at)
                        """
                    ),
                    {
                        "symbol": symbol,
                        "timeframe": "1d",
                        "ts": f"2026-06-{10 + idx:02d}T00:00:00",
                        "open": 20.0 + idx,
                        "high": 21.0 + idx,
                        "low": 19.0 + idx,
                        "close": 20.5 + idx,
                        "volume": 2000 + idx,
                        "source": "live-fallback",
                        "ingested_at": "2026-06-10T00:00:00Z",
                    },
                )
        return (3, 0)

    monkeypatch.setattr(
        "app.intel.market_agent.market_data.ingest_symbol",
        _mock_ingest_symbol,
    )
    service = MarketDataService(engine, settings=settings)
    response = service.get_market_data("TSLA", "1d", limit=3, min_required=3, allow_live_fallback=True)

    assert called["count"] == 1
    assert response.quality_status == "pass"
    assert response.source == "db+live"
    assert response.bar_count == 3


def test_market_data_service_fallback_failure_returns_blocked_without_fake_bars(
    tmp_path: Path, monkeypatch
) -> None:
    engine, settings = _setup_engine(tmp_path)

    def _mock_ingest_symbol(*args, **kwargs) -> tuple[int, int]:
        raise RuntimeError("provider failed")

    monkeypatch.setattr(
        "app.intel.market_agent.market_data.ingest_symbol",
        _mock_ingest_symbol,
    )
    service = MarketDataService(engine, settings=settings)
    response = service.get_market_data("TSLA", "1d", min_required=3, allow_live_fallback=True)

    assert response.quality_status == "blocked"
    assert response.bar_count == 0
    assert response.source == "db"
    assert response.bars == []
    assert "provider failed" in response.quality_reason
