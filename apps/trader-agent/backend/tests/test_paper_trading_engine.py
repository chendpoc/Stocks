from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest

from app.core.config import Settings
from app.intel.db.connection import set_intel_db_path
from app.intel.db.schema import init_intel_db
from app.modules.live_market_plane.service import ingest_quote_for_symbol
from app.modules.paper_trading.engine import PaperTradingError, submit_paper_order_intent


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


def _quote_transport(row: dict[str, Any]):
    def transport(endpoint: str, params: dict[str, Any]) -> dict[str, Any]:
        return row

    return transport


@pytest.fixture
def intel_db(tmp_path: Path) -> None:
    db_path = tmp_path / "data" / "market_intel.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    set_intel_db_path(db_path)
    init_intel_db(_settings(tmp_path))


def _seed_market(settings: Settings) -> dict[str, Any]:
    now = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return ingest_quote_for_symbol(
        settings,
        "AAPL.US",
        transport=_quote_transport(
            {
                "timestamp": now,
                "last_done": 200.0,
                "depth_levels": [{"price": 200.0, "size": 100}],
                "trade_tape_available": True,
            }
        ),
        source_channel="rest",
    )


def test_paper_fill_is_deterministic(intel_db: None, tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    state = _seed_market(settings)
    intent = {
        "symbol": "AAPL.US",
        "direction": "buy",
        "quantity": 10,
        "market_state_snapshot_id": state["market_state_snapshot_id"],
        "created_at": "2026-06-06T12:00:00Z",
    }
    first = submit_paper_order_intent(settings, dict(intent))
    second = submit_paper_order_intent(settings, dict(intent))
    assert first["order_events"][0]["order_event_id"] == second["order_events"][0]["order_event_id"]
    assert first["order_events"][0]["fill_price"] == second["order_events"][0]["fill_price"]


def test_paper_blocked_without_market_state(intel_db: None, tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    with pytest.raises(PaperTradingError, match="No MarketStateSnapshot"):
        submit_paper_order_intent(
            settings,
            {"symbol": "SPY.US", "direction": "buy", "quantity": 1},
        )
