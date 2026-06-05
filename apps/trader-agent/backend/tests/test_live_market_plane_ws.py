from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.core.config import Settings
from app.intel.db.connection import set_intel_db_path
from app.intel.db.schema import init_intel_db
from app.modules.live_market_plane.longbridge_stream import start_stream, stop_stream, stream_status
from app.modules.live_market_plane.push_normalize import push_depth_to_row, push_quote_to_row
from app.modules.live_market_plane.push_normalize import push_trade_to_row
from app.modules.live_market_plane.service import get_latest_market_state, persist_websocket_push


def _settings(tmp_path: Path) -> Settings:
    repo_root = Path(__file__).resolve().parents[4]
    return Settings(
        repo_root=repo_root,
        data_dir=tmp_path / "trader-agent-data",
        fixture_data_dir=repo_root / "apps" / "trader-agent" / "backend" / "tests" / "fixtures",
        rulepack_path=repo_root / "apps" / "trader-agent" / "shared" / "rulepacks" / "v0_1_0.yaml",
        enabled_tool_capabilities=frozenset({"market_data.longbridge"}),
        enable_event_jsonl_mirror=False,
    )


@pytest.fixture
def intel_db(tmp_path: Path) -> None:
    db_path = tmp_path / "data" / "market_intel.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    set_intel_db_path(db_path)
    init_intel_db(_settings(tmp_path))


def test_push_normalize_builds_depth_levels() -> None:
    row = push_depth_to_row(
        {
            "sequence": 1_700_000_000_000_000,
            "bid": [{"position": 1, "price": "100.1", "volume": 10}],
            "ask": [{"position": 1, "price": "100.2", "volume": 12}],
        }
    )
    assert row["depth_levels"]
    assert row["bids"]


def test_persist_websocket_push_enables_paper_readiness(intel_db: None, tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    now = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    quote = push_quote_to_row("AAPL.US", {"last_done": 200.0, "sequence": 1, "timestamp": now})
    depth = push_depth_to_row(
        {
            "sequence": 2,
            "timestamp": now,
            "bid": [{"position": 1, "price": "199.9", "volume": 100}],
            "ask": [{"position": 1, "price": "200.1", "volume": 120}],
        }
    )
    trade = push_trade_to_row("AAPL.US", {"price": 200.0, "volume": 5, "timestamp": now})
    state = persist_websocket_push(
        settings,
        "AAPL.US",
        quote_row=quote,
        depth_row=depth,
        trade_row=trade,
    )
    assert state["consumer_readiness"]["paper_simulation"] == "ready"
    loaded = get_latest_market_state(settings, "AAPL.US")
    assert loaded is not None
    assert loaded["market_state_snapshot_id"] == state["market_state_snapshot_id"]


def test_stream_status_not_running_by_default() -> None:
    stop_stream()
    status = stream_status()
    assert status["running"] is False
    assert "sdk_available" in status


def test_start_stream_without_sdk_raises(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    stop_stream()
    monkeypatch.setattr(
        "app.modules.live_market_plane.longbridge_stream.longbridge_sdk_available",
        lambda: False,
    )
    monkeypatch.setattr(
        "app.modules.live_market_plane.longbridge_stream.longbridge_credentials_configured",
        lambda: True,
    )
    settings = _settings(tmp_path)
    with pytest.raises(RuntimeError, match="longbridge SDK"):
        start_stream(settings)
