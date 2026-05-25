from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.config import Settings
from app.db.models import agent_events, signals
from app.db.session import create_sqlite_engine
from app.modules.runtime_orchestrator import EmptyScanUniverseError, RuntimeOrchestrator
from app.tools.local_adapter import (
    FILING_EVENTS_FIXTURE,
    MARKET_BARS_FIXTURE,
    MARKET_CALENDAR_FIXTURE,
    NEWS_EVENTS_FIXTURE,
)

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"
ALL_CAPABILITIES = {
    MARKET_BARS_FIXTURE,
    MARKET_CALENDAR_FIXTURE,
    NEWS_EVENTS_FIXTURE,
    FILING_EVENTS_FIXTURE,
}


def _settings(tmp_path: Path) -> Settings:
    repo_root = Path(__file__).resolve().parents[4]
    return Settings(
        repo_root=repo_root,
        data_dir=tmp_path / "trader-agent-data",
        fixture_data_dir=FIXTURE_DIR,
        rulepack_path=repo_root / "apps" / "trader-agent" / "shared" / "rulepacks" / "v0_1_0.yaml",
        enabled_tool_capabilities=ALL_CAPABILITIES,
    )


def _event_rows(settings: Settings) -> list[dict[str, object]]:
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        return list(
            conn.execute(select(agent_events).order_by(agent_events.c.timestamp, agent_events.c.id))
            .mappings()
            .all()
        )


def _signal_rows(settings: Settings) -> list[dict[str, object]]:
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        return list(conn.execute(select(signals)).mappings().all())


def test_run_symbol_builds_fixture_snapshot_detects_setups_and_records_events(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path)
    result = RuntimeOrchestrator(settings).run_symbol(
        symbol="TSLA",
        start="2026-05-20",
        end="2026-05-22",
    )

    assert result["status"] == "completed"
    assert result["symbols_scanned"] == ["TSLA"]
    symbol_result = result["symbol_results"][0]
    assert symbol_result["symbol"] == "TSLA"
    assert symbol_result["status"] == "completed"
    assert any(
        item["setup_type"] == "sharp_drop_volume_contraction"
        for item in symbol_result["candidates"]
    )
    assert result["signal_count"] >= 1
    assert symbol_result["signals"]
    assert all(
        item["status"] in {"observe", "waiting_trigger", "invalidated"}
        for item in symbol_result["signals"]
    )
    assert symbol_result["evidence_refs"]

    rows = _event_rows(settings)
    assert [row["event_type"] for row in rows] == [
        "runtime_orchestrator.run_started",
        "signal_manager.signal_persisted",
        "runtime_orchestrator.symbol_completed",
        "runtime_orchestrator.run_completed",
    ]
    assert {row["run_id"] for row in rows} == {result["run_id"]}
    signal_id = symbol_result["signals"][0]["id"]
    assert rows[1]["signal_id"] == signal_id
    assert rows[2]["symbol"] == "TSLA"
    symbol_summary = json.loads(rows[2]["output_summary"])
    assert symbol_summary["candidate_count"] >= 1
    assert symbol_summary["signal_count"] >= 1

    persisted_signals = _signal_rows(settings)
    assert {row["id"] for row in persisted_signals} >= {signal_id}
    assert persisted_signals[0]["status"] in {"observe", "waiting_trigger", "invalidated"}


def test_scan_keeps_outside_universe_as_failed_symbol_result_and_event(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path)
    result = RuntimeOrchestrator(settings).run_scan(
        start="2026-05-20",
        end="2026-05-22",
        symbols=["SPY", "XYZ"],
    )

    assert result["status"] == "completed_with_errors"
    assert result["symbols_scanned"] == ["SPY", "XYZ"]
    failed = next(item for item in result["symbol_results"] if item["symbol"] == "XYZ")
    assert failed["status"] == "failed"
    assert failed["candidates"] == []
    assert failed["signals"] == []
    assert failed["errors"][0]["gap_type"] == "outside_fixed_universe"
    assert "buy" not in str(failed).lower()
    assert "order" not in str(failed).lower()
    assert "trade" not in str(failed).lower()

    rows = _event_rows(settings)
    failed_events = [
        row for row in rows if row["event_type"] == "runtime_orchestrator.symbol_failed"
    ]
    assert len(failed_events) == 1
    assert failed_events[0]["symbol"] == "XYZ"
    assert failed_events[0]["status"] == "failed"
    assert result["signal_count"] == sum(len(item["signals"]) for item in result["symbol_results"])


def test_run_scan_rejects_explicit_empty_symbols_before_recording_events(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path)

    with pytest.raises(EmptyScanUniverseError, match="symbols must not be empty"):
        RuntimeOrchestrator(settings).run_scan(
            start="2026-05-20",
            end="2026-05-22",
            symbols=[],
        )

    assert _event_rows(settings) == []
