from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import Settings
from app.intel.db.connection import get_intel_engine, set_intel_db_path
from app.intel.db.schema import init_intel_db
from app.main import create_app

MARKET_AGENT_PREFIX = "/api/intel/market-agent"
STAGE1_PREFIX = "/api/intel/stage1"


def _settings(tmp_repo: Path) -> Settings:
    return Settings(
        repo_root=tmp_repo,
        data_dir=tmp_repo / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
    )


def _client(tmp_repo: Path) -> TestClient:
    set_intel_db_path(tmp_repo / "data" / "market_intel.db")
    return TestClient(create_app(settings=_settings(tmp_repo)))


def _init_db(tmp_repo: Path):
    set_intel_db_path(tmp_repo / "data" / "market_intel.db")
    return init_intel_db(_settings(tmp_repo))


def _seed_bars(
    engine,
    symbol: str,
    timeframe: str,
    *,
    count: int = 3,
) -> None:
    with engine.begin() as conn:
        for idx in range(count):
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
                    "ts": f"2026-06-10T09:{idx:02d}:00Z",
                    "open": 100.0 + idx,
                    "high": 100.75 + idx,
                    "low": 99.0 + idx,
                    "close": 100.5 + idx * 0.25,
                    "volume": 1000 + idx * 10,
                    "source": "test",
                    "ingested_at": "2026-06-10T00:00:00Z",
                },
            )


def _assert_no_trading_surface_text(payload: object) -> None:
    text_payload = str(payload).lower()
    for term in ("orderintent", "broker", "position", "pnl", "paper order", "live trading"):
        assert term not in text_payload


def test_market_agent_backend_e2e_market_monitor_to_context_bootstrap(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    engine = _init_db(tmp_repo)

    client = _client(tmp_repo)
    init_response = client.post(f"{MARKET_AGENT_PREFIX}/memory/init")
    assert init_response.status_code == 200
    init_body = init_response.json()
    assert init_body["status"] == "ok"
    assert set(init_body["table_names"]) >= {
        "feature_snapshots",
        "setup_events",
        "pattern_memories",
        "failure_memories",
        "session_context_packs",
    }

    _seed_bars(engine, "TSLA", "5m", count=3)

    first_bootstrap = client.post(
        f"{MARKET_AGENT_PREFIX}/context/bootstrap",
        json={"session_id": "market-agent-e2e", "symbol": "TSLA", "max_chars": 2000},
    )
    assert first_bootstrap.status_code == 200
    first_bootstrap_body = first_bootstrap.json()
    assert first_bootstrap_body["session_id"] == "market-agent-e2e"
    assert first_bootstrap_body["symbol"] == "TSLA"
    assert first_bootstrap_body["promoted_count"] == 0
    _assert_no_trading_surface_text(first_bootstrap_body)

    monitor_response = client.post(
        f"{MARKET_AGENT_PREFIX}/market-monitor/run",
        json={
            "symbols": ["TSLA"],
            "timeframes": ["5m"],
            "limit": 3,
            "min_required": 2,
            "allow_live_fallback": False,
        },
    )
    assert monitor_response.status_code == 200
    monitor_body = monitor_response.json()
    assert monitor_body["count"] == 1
    assert len(monitor_body["results"]) == 1
    assert monitor_body["results"][0]["symbol"] == "TSLA"
    assert monitor_body["results"][0]["timeframe"] == "5m"
    _assert_no_trading_surface_text(monitor_body)

    model_decisions = client.get(
        f"{STAGE1_PREFIX}/model-decisions",
        params={"symbol": "TSLA", "limit": 10},
    )
    assert model_decisions.status_code == 200
    model_decisions_body = model_decisions.json()
    assert model_decisions_body["count"] >= 1
    decision_items = model_decisions_body["items"]
    assert any(item["symbol"] == "TSLA" for item in decision_items)
    for item in decision_items:
        assert item["decision_json"]["risk"]["status"] in {
            "pass",
            "watch_only",
            "requires_user_confirmation",
            "blocked",
        }
        _assert_no_trading_surface_text(item["decision_json"])

    candidate_payload = {
        "insight_id": "insight-e2e-1",
        "run_id": "run-e2e",
        "symbols_json": ["TSLA"],
        "window_start": "2026-05-01T00:00:00Z",
        "window_end": "2026-06-10T00:00:00Z",
        "thesis": "intraday monitor review candidate",
        "evidence_refs_json": [{"ref": "e2e-barter"}],
        "verification_status": "pending",
        "weight_cap": 0.72,
        "candidate_json": {"pattern": "volatility_pullback", "thesis": "monitor review"},
    }
    candidate_response = client.post(
        f"{STAGE1_PREFIX}/insight-candidates",
        json=candidate_payload,
    )
    assert candidate_response.status_code == 200
    candidate_body = candidate_response.json()
    assert candidate_body["insight_id"] == "insight-e2e-1"
    assert candidate_body["candidate_json"]["pattern"] == "volatility_pullback"
    assert candidate_body["symbols_json"] == ["TSLA"]

    promote_response = client.post(
        f"{MARKET_AGENT_PREFIX}/pattern-memory/promote",
        json={"candidate_id": "insight-e2e-1", "confirm": True},
    )
    assert promote_response.status_code == 200
    promote_body = promote_response.json()
    assert promote_body["item"]["pattern_id"] == "insight-e2e-1"
    assert promote_body["item"]["symbol"] == "TSLA"
    assert promote_body["item"]["memory_json"]["status"] == "promoted"
    assert promote_body["item"]["memory_json"]["candidate_id"] == "insight-e2e-1"
    _assert_no_trading_surface_text(promote_body)

    second_bootstrap = client.post(
        f"{MARKET_AGENT_PREFIX}/context/bootstrap",
        json={"session_id": "market-agent-e2e", "symbol": "TSLA"},
    )
    assert second_bootstrap.status_code == 200
    second_bootstrap_body = second_bootstrap.json()
    assert second_bootstrap_body["session_id"] == "market-agent-e2e"
    assert second_bootstrap_body["promoted_count"] >= 1
    assert "insight-e2e-1" in second_bootstrap_body["markdown"]
    _assert_no_trading_surface_text(second_bootstrap_body)

    session_packs = client.get(
        f"{MARKET_AGENT_PREFIX}/context/latest",
        params={"session_id": "market-agent-e2e", "symbol": "TSLA"},
    )
    assert session_packs.status_code == 200
    latest = session_packs.json()
    assert latest["promoted_count"] >= 1
    assert "insight-e2e-1" in latest["markdown"]
    _assert_no_trading_surface_text(latest)
