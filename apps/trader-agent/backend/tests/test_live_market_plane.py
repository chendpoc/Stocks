from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.live_market_plane import router as market_plane_router
from app.core.config import Settings
from app.intel.db.connection import set_intel_db_path
from app.intel.db.schema import init_intel_db
from app.modules.live_market_plane.service import ingest_quote_for_symbol


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
def intel_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    db_path = tmp_path / "data" / "market_intel.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    set_intel_db_path(db_path)
    settings = _settings(tmp_path)
    init_intel_db(settings)
    return db_path


def _quote_transport(row: dict[str, Any]):
    def transport(endpoint: str, params: dict[str, Any]) -> dict[str, Any]:
        assert endpoint == "quote"
        return row

    return transport


def test_ingest_builds_market_state_with_readiness(intel_db: Path, tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    now = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    state = ingest_quote_for_symbol(
        settings,
        "TSLA.US",
        transport=_quote_transport(
            {
                "timestamp": now,
                "last_done": 250.5,
                "bid": 250.4,
                "ask": 250.6,
            }
        ),
        source_channel="fixture",
    )
    assert state["schema_version"] == "live_market_data_plane.v0"
    assert state["symbol"] == "TSLA.US"
    readiness = state["consumer_readiness"]
    assert readiness["analysis_monitoring"] in {"ready", "warning", "blocked"}
    assert readiness["paper_simulation"] == "blocked"


def test_api_latest_state(intel_db: Path, tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    now = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    ingest_quote_for_symbol(
        settings,
        "NVDA.US",
        transport=_quote_transport({"timestamp": now, "last_done": 900.0}),
        source_channel="fixture",
    )
    app = FastAPI()
    app.state.settings = settings
    app.include_router(market_plane_router)
    client = TestClient(app)
    response = client.get("/api/market-plane/state/NVDA.US")
    assert response.status_code == 200
    body = response.json()
    assert body["symbol"] == "NVDA.US"
    assert body["market_state_snapshot_id"].startswith("mss-")
