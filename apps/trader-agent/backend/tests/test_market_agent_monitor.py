from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import text

from app.core.config import Settings
from app.intel.db.connection import set_intel_db_path
from app.intel.db.schema import init_intel_db
from app.intel.market_agent.market_data import MarketDataService
from app.intel.market_agent.monitor import MarketMonitorService
from app.intel.market_agent.features import FeatureEngine
from app.intel.market_agent.repositories import list_setup_events
from app.intel.market_agent.setups import SetupDetector


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
    return init_intel_db(_settings(tmp_repo)), _settings(tmp_repo)


def _seed_bars(engine, symbol: str, timeframe: str) -> None:
    rows = [
        (
            "2026-06-10T09:30:00Z",
            100.0,
            100.0,
            99.0,
            100.0,
            1200.0,
            100.0,
        ),
        (
            "2026-06-10T09:35:00Z",
            100.0,
            110.0,
            99.5,
            110.0,
            1500.0,
            100.0,
        ),
    ]
    with engine.begin() as conn:
        for idx, (ts, open_, high, low, close, volume, vwap) in enumerate(rows):
            conn.execute(
                text(
                    """
                    INSERT OR REPLACE INTO market_bars
                    (symbol, timeframe, ts, open, high, low, close, volume, vwap, source, ingested_at)
                    VALUES (:symbol, :timeframe, :ts, :open, :high, :low, :close, :volume, :vwap, :source, :ingested_at)
                    """
                ),
                {
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "ts": ts,
                    "open": open_,
                    "high": high,
                    "low": low,
                    "close": close,
                    "volume": volume,
                    "vwap": vwap,
                    "source": "test",
                    "ingested_at": "2026-06-10T00:00:00Z",
                },
            )


def _seed_raw_bars(
    engine,
    symbol: str,
    timeframe: str,
    rows: list[dict[str, float | str]],
) -> None:
    with engine.begin() as conn:
        for row in rows:
            conn.execute(
                text(
                    """
                    INSERT OR REPLACE INTO market_bars
                    (symbol, timeframe, ts, open, high, low, close, volume, vwap, source, ingested_at)
                    VALUES (:symbol, :timeframe, :ts, :open, :high, :low, :close, :volume, :vwap, :source, :ingested_at)
                    """
                ),
                {
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "ts": row.get("ts"),
                    "open": row.get("open"),
                    "high": row.get("high"),
                    "low": row.get("low"),
                    "close": row.get("close"),
                    "volume": row.get("volume"),
                    "vwap": row.get("vwap"),
                    "source": "test",
                    "ingested_at": "2026-06-10T00:00:00Z",
                },
            )


def _fetch_model_decision(engine, decision_id: str) -> dict:
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT * FROM model_decisions WHERE decision_id = :id"),
            {"id": decision_id},
        ).mappings().fetchone()
    assert row is not None
    payload = dict(row)
    payload["decision_json"] = json.loads(payload["decision_json"])
    return payload


def _count_table(engine, table_name: str, symbol: str | None = None) -> int:
    where = f" WHERE symbol = :symbol" if symbol else ""
    params = {"symbol": symbol} if symbol else {}
    with engine.connect() as conn:
        return int(
            conn.execute(
                text(f"SELECT COUNT(*) AS count FROM {table_name}{where}"),
                params,
            )
            .mappings()
            .fetchone()["count"]
        )


def test_run_symbol_positive_path_persists_monitor_decision_and_setup_events(tmp_path: Path) -> None:
    engine, settings = _init_db(tmp_path)
    _seed_bars(engine, "TSLA", "5m")

    service = MarketMonitorService(
        engine=engine,
        market_data_service=MarketDataService(engine, settings=settings),
        feature_engine=FeatureEngine(engine),
        setup_detector=SetupDetector(),
    )

    result = service.run_symbol(
        "tsla",
        timeframe="5m",
        limit=2,
        min_required=1,
    )

    assert result.symbol == "TSLA"
    assert result.timeframe == "5m"
    assert result.risk_status in {"pass", "watch_only", "requires_user_confirmation"}

    persisted = _fetch_model_decision(engine, result.decision_id)
    assert persisted["snapshot_id"] == result.snapshot_id
    assert persisted["action"] in {"watch", "review"}
    decision_json = persisted["decision_json"]

    assert decision_json["quality"]["status"] == "pass"
    assert decision_json["risk"]["status"] in {"pass", "watch_only", "requires_user_confirmation"}
    assert decision_json["feature_snapshot_id"]
    assert "setup_event_ids" in decision_json

    assert _count_table(engine, "feature_snapshots", symbol="TSLA") == 1
    assert _count_table(engine, "setup_events", symbol="TSLA") >= 1


def test_run_symbol_blocked_quality_still_persists_auditable_decision(tmp_path: Path) -> None:
    engine, settings = _init_db(tmp_path)
    service = MarketMonitorService(
        engine=engine,
        market_data_service=MarketDataService(engine, settings=settings),
        feature_engine=FeatureEngine(engine),
        setup_detector=SetupDetector(),
    )

    result = service.run_symbol(
        "aapl",
        timeframe="5m",
        limit=2,
        min_required=5,
    )

    assert result.risk_status == "blocked"
    assert result.setup_event_ids == []
    assert _count_table(engine, "setup_events", symbol="AAPL") == 0

    decision = _fetch_model_decision(engine, result.decision_id)
    decision_json = decision["decision_json"]

    assert decision["action"] == "ignore"
    assert decision_json["quality"]["status"] == "failed"
    assert decision_json["risk"]["status"] == "blocked"
    assert decision_json["setup_event_ids"] == []
    assert decision_json["quality"]["bar_count"] == 0
    assert result.snapshot_id.startswith("fs_")


def test_run_symbol_is_idempotent_for_same_input(tmp_path: Path) -> None:
    engine, settings = _init_db(tmp_path)
    _seed_bars(engine, "NVDA", "5m")

    service = MarketMonitorService(
        engine=engine,
        market_data_service=MarketDataService(engine, settings=settings),
        feature_engine=FeatureEngine(engine),
        setup_detector=SetupDetector(),
    )

    first = service.run_symbol("nvda", timeframe="5m", limit=2, min_required=1)
    second = service.run_symbol("NVDA", timeframe="5m", limit=2, min_required=1)

    assert first.decision_id == second.decision_id
    with engine.connect() as conn:
        count = conn.execute(
            text("SELECT COUNT(*) AS count FROM model_decisions WHERE snapshot_id = :snapshot"),
            {"snapshot": first.snapshot_id},
        ).scalar_one()
    assert int(count) == 1


def test_run_symbol_with_benchmark_context_persists_relative_strength_pullback_setup(tmp_path: Path) -> None:
    engine, settings = _init_db(tmp_path)
    _seed_raw_bars(
        engine,
        "NVDA",
        "5m",
        [
            {
                "ts": "2026-06-10T09:30:00Z",
                "open": 100.0,
                "high": 102.0,
                "low": 99.5,
                "close": 100.0,
                "volume": 1500.0,
                "vwap": 100.0,
            },
            {
                "ts": "2026-06-10T09:35:00Z",
                "open": 100.0,
                "high": 103.5,
                "low": 100.0,
                "close": 102.0,
                "volume": 1700.0,
                "vwap": 101.0,
            },
        ],
    )

    service = MarketMonitorService(
        engine=engine,
        market_data_service=MarketDataService(engine, settings=settings),
        feature_engine=FeatureEngine(engine),
        setup_detector=SetupDetector(),
    )

    result = service.run_symbol(
        "nvda",
        timeframe="5m",
        limit=2,
        min_required=1,
        benchmark_bars={
            "SPY": [
                {
                    "ts": "2026-06-10T09:30:00Z",
                    "open": 200.0,
                    "high": 201.0,
                    "low": 199.0,
                    "close": 200.0,
                    "volume": 1000.0,
                    "vwap": 200.0,
                },
                {
                    "ts": "2026-06-10T09:35:00Z",
                    "open": 200.0,
                    "high": 202.0,
                    "low": 199.5,
                    "close": 200.5,
                    "volume": 1300.0,
                    "vwap": 200.5,
                },
            ],
            "QQQ": [
                {
                    "ts": "2026-06-10T09:30:00Z",
                    "open": 150.0,
                    "high": 151.0,
                    "low": 149.0,
                    "close": 150.0,
                    "volume": 1000.0,
                    "vwap": 150.0,
                },
                {
                    "ts": "2026-06-10T09:35:00Z",
                    "open": 150.0,
                    "high": 152.0,
                    "low": 149.5,
                    "close": 149.8,
                    "volume": 1200.0,
                    "vwap": 149.9,
                },
            ],
        },
    )

    assert result.risk_status in {"pass", "requires_user_confirmation", "watch_only"}
    decision = _fetch_model_decision(engine, result.decision_id)
    setup_events = list_setup_events(engine, symbol="NVDA")
    assert setup_events
    assert any(event.setup_name == "RELATIVE_STRENGTH_PULLBACK" for event in setup_events)
    decision_setup_ids = set(decision["decision_json"].get("setup_event_ids", []))
    assert any(
        event.setup_event_id in decision_setup_ids and event.setup_name == "RELATIVE_STRENGTH_PULLBACK"
        for event in setup_events
    )
