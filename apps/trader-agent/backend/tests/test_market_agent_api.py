from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import Settings
from app.intel.db.connection import get_intel_engine, set_intel_db_path
from app.intel.db.schema import init_intel_db
from app.intel.market_agent.repositories import (
    create_failure_memory,
    create_pattern_memory,
    list_pattern_memories,
)
from app.intel.market_agent.schemas import FailureMemory, PatternMemory
from app.main import create_app

MARKET_AGENT_PREFIX = "/api/intel/market-agent"


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


def _seed_pattern(
    engine,
    *,
    pattern_memory_id: str,
    pattern_id: str,
    symbol: str = "TSLA",
    status: str = "active",
) -> PatternMemory:
    return create_pattern_memory(
        engine,
        PatternMemory(
            pattern_memory_id=pattern_memory_id,
            symbol=symbol,
            pattern_id=pattern_id,
            confidence=0.72,
            memory_json={"status": status, "thesis": f"seed:{status}"},
            evidence_refs_json=["seed"],
        ),
    )


def _seed_failure(
    engine,
    *,
    failure_memory_id: str,
    symbol: str,
    failure_type: str,
    status: str,
    setup_name: str | None = None,
) -> FailureMemory:
    failure_json = {"status": status}
    if setup_name is not None:
        failure_json["setup_name"] = setup_name
    return create_failure_memory(
        engine,
        FailureMemory(
            failure_memory_id=failure_memory_id,
            symbol=symbol,
            failure_type=failure_type,
            failed_ts="2026-06-10T12:00:00Z",
            failure_json=failure_json,
            context_json={},
        ),
    )


def _seed_bars(engine, symbol: str, timeframe: str, count: int = 3) -> None:
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
                    "high": 101.0 + idx,
                    "low": 99.0 + idx,
                    "close": 100.0 + idx * 0.5,
                    "volume": 1000 + idx,
                    "source": "test",
                    "ingested_at": "2026-06-10T00:00:00Z",
                },
            )


def _seed_candidate(
    engine,
    *,
    insight_id: str = "insight-1",
) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT OR REPLACE INTO insight_candidates
                (insight_id, run_id, symbols_json, window_start, window_end, thesis,
                 evidence_refs_json, verification_status, weight_cap, candidate_json, created_at)
                VALUES (:insight_id, :run_id, :symbols_json, :window_start, :window_end, :thesis,
                        :evidence_refs_json, :verification_status, :weight_cap, :candidate_json, :created_at)
                """
            ),
            {
                "insight_id": insight_id,
                "run_id": "run-1",
                "symbols_json": json.dumps(["NVDA", "TSLA"]),
                "window_start": "2026-05-01",
                "window_end": "2026-06-01",
                "thesis": "range expansion setup",
                "evidence_refs_json": json.dumps(["news-1", "news-2"]),
                "verification_status": "pending",
                "weight_cap": 0.61,
                "candidate_json": json.dumps({"pattern": "breakout", "confidence": 0.61}),
                "created_at": "2026-06-10T00:00:00Z",
            },
        )


def test_market_agent_routes_are_mounted(tmp_path: Path) -> None:
    client = _client(tmp_path / "repo")
    response = client.get(f"{MARKET_AGENT_PREFIX}/pattern-memory")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 0
    assert isinstance(body["items"], list)


def test_memory_init_populates_market_agent_tables(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    client = _client(tmp_repo)
    response = client.post(f"{MARKET_AGENT_PREFIX}/memory/init")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert set(body["table_names"]) >= {
        "feature_snapshots",
        "setup_events",
        "pattern_memories",
        "failure_memories",
        "session_context_packs",
    }


def test_context_bootstrap_and_latest_with_profile_default(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    _init_db(tmp_repo)
    client = _client(tmp_repo)

    first = client.post(
        f"{MARKET_AGENT_PREFIX}/context/bootstrap",
        json={"profile": "alpha-profile", "symbol": "tsla", "max_chars": 120},
    )
    assert first.status_code == 200
    boot = first.json()
    assert boot["session_id"] == "alpha-profile"
    assert boot["symbol"] == "TSLA"
    assert boot["promoted_count"] == 0

    latest = client.get(
        f"{MARKET_AGENT_PREFIX}/context/latest",
        params={"profile": "alpha-profile", "symbol": "tsla"},
    )
    assert latest.status_code == 200
    latest_body = latest.json()
    assert latest_body["session_id"] == "alpha-profile"
    assert latest_body["session_context_pack_id"] == boot["session_context_pack_id"]

    default_missing = client.get(f"{MARKET_AGENT_PREFIX}/context/latest")
    assert default_missing.status_code == 404

    session_latest = client.get(f"{MARKET_AGENT_PREFIX}/context/latest", params={"session_id": "alpha-profile"})
    assert session_latest.status_code == 200
    assert session_latest.json()["session_id"] == "alpha-profile"


def test_pattern_memory_list_promote_degrade(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    engine = _init_db(tmp_repo)
    _seed_pattern(engine, pattern_memory_id="pm-a1", pattern_id="p-alpha", status="active")
    _seed_pattern(engine, pattern_memory_id="pm-a2", pattern_id="p-beta", status="promoted")
    _seed_pattern(engine, pattern_memory_id="pm-a3", pattern_id="p-gamma", status="degrading")
    client = _client(tmp_repo)

    list_promoted = client.get(
        f"{MARKET_AGENT_PREFIX}/pattern-memory",
        params={"status": "promoted", "symbol": "tsla"},
    )
    assert list_promoted.status_code == 200
    promoted = list_promoted.json()
    assert promoted["count"] == 1
    assert promoted["items"][0]["memory_json"]["status"] == "promoted"

    list_active = client.get(
        f"{MARKET_AGENT_PREFIX}/pattern-memory",
        params={"status": "active", "symbol": "tsla"},
    )
    assert list_active.status_code == 200
    assert list_active.json()["count"] == promoted["count"]

    missing_confirm = client.post(
        f"{MARKET_AGENT_PREFIX}/pattern-memory/promote",
        json={"pattern_memory_id": "pm-a1"},
    )
    assert missing_confirm.status_code == 400

    promoted_row = client.post(
        f"{MARKET_AGENT_PREFIX}/pattern-memory/promote",
        json={"pattern_memory_id": "pm-a1", "confirm": True},
    )
    assert promoted_row.status_code == 200
    promoted_payload = promoted_row.json()["item"]
    assert promoted_payload["pattern_id"] == "p-alpha"
    assert promoted_payload["memory_json"]["status"] == "promoted"

    degraded = client.post(
        f"{MARKET_AGENT_PREFIX}/pattern-memory/degrade",
        json={"pattern_memory_id": "pm-a1", "reason": "not stable"},
    )
    assert degraded.status_code == 200
    degraded_payload = degraded.json()["item"]
    assert degraded_payload["memory_json"]["status"] == "degrading"
    assert degraded_payload["memory_json"]["status_reason"] == "not stable"

    with engine.connect() as conn:
        count_row = conn.execute(
            text(
                "SELECT COUNT(*) AS count FROM pattern_memories WHERE symbol='TSLA'"
            )
        ).fetchone()
    assert int(count_row[0]) == 5  # 3 seeds + promote + degrade append-only rows


def test_pattern_memory_promote_from_candidate(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    engine = _init_db(tmp_repo)
    _seed_candidate(engine, insight_id="candidate-a")
    client = _client(tmp_repo)

    response = client.post(
        f"{MARKET_AGENT_PREFIX}/pattern-memory/promote",
        json={"candidate_id": "candidate-a", "confirm": True},
    )
    assert response.status_code == 200
    payload = response.json()["item"]
    assert payload["pattern_id"] == "candidate-a"
    assert payload["symbol"] == "NVDA"
    assert payload["memory_json"]["status"] == "promoted"
    assert payload["memory_json"]["thesis"] == "range expansion setup"
    assert payload["memory_json"]["candidate_id"] == "candidate-a"
    assert payload["evidence_refs_json"] == ["news-1", "news-2"]
    assert payload["pattern_memory_id"].startswith("pm_")

    repeat = client.post(
        f"{MARKET_AGENT_PREFIX}/pattern-memory/promote",
        json={"candidate_id": "candidate-a", "confirm": True},
    )
    assert repeat.status_code == 200
    assert repeat.json()["item"]["pattern_memory_id"] == payload["pattern_memory_id"]


def test_pattern_memory_degrade_by_pattern_id(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    engine = _init_db(tmp_repo)
    _seed_pattern(
        engine,
        pattern_memory_id="pm-old",
        pattern_id="p-legacy",
        status="active",
    )
    _seed_pattern(
        engine,
        pattern_memory_id="pm-new",
        pattern_id="p-legacy",
        status="promoted",
    )
    client = _client(tmp_repo)

    response = client.post(
        f"{MARKET_AGENT_PREFIX}/pattern-memory/degrade",
        json={"pattern_id": "p-legacy", "reason": "confidence drop"},
    )
    assert response.status_code == 200
    payload = response.json()["item"]
    assert payload["pattern_id"] == "p-legacy"
    assert payload["memory_json"]["status"] == "degrading"

    existing = list_pattern_memories(engine, pattern_id="p-legacy")
    assert len(existing) == 3


def test_failure_memory_default_active_warning_and_explicit_status(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    engine = _init_db(tmp_repo)
    _seed_failure(
        engine,
        failure_memory_id="fm-a1",
        symbol="TSLA",
        failure_type="timeout",
        status="active",
    )
    _seed_failure(
        engine,
        failure_memory_id="fm-a2",
        symbol="TSLA",
        failure_type="timeout",
        status="retired",
    )
    _seed_failure(
        engine,
        failure_memory_id="fm-a3",
        symbol="TSLA",
        failure_type="data_quality",
        status="open",
        setup_name="quality-hook",
    )
    client = _client(tmp_repo)

    active_warning = client.get(
        f"{MARKET_AGENT_PREFIX}/failure-memory",
        params={"symbol": "TSLA"},
    )
    assert active_warning.status_code == 200
    payload = active_warning.json()
    assert payload["count"] >= 2

    explicit = client.get(
        f"{MARKET_AGENT_PREFIX}/failure-memory",
        params={"symbol": "TSLA", "status": "retired"},
    )
    assert explicit.status_code == 200
    explicit_payload = explicit.json()
    assert explicit_payload["count"] == 1
    assert explicit_payload["items"][0]["failure_memory_id"] == "fm-a2"


def test_market_data_fetch_quality_health(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    engine = _init_db(tmp_repo)
    _seed_bars(engine, "NVDA", "1d", count=3)
    client = _client(tmp_repo)

    fetch = client.get(
        f"{MARKET_AGENT_PREFIX}/market-data/fetch",
        params={"symbol": "nvda", "timeframe": "1d", "limit": 2, "min_required": 2},
    )
    assert fetch.status_code == 200
    payload = fetch.json()
    assert payload["symbol"] == "NVDA"
    assert payload["timeframe"] == "1d"
    assert payload["quality_status"] == "pass"
    assert len(payload["bars"]) == 2

    health = client.get(f"{MARKET_AGENT_PREFIX}/market-data/health", params={"symbol": "nvda"})
    assert health.status_code == 200
    health_payload = health.json()
    assert health_payload["symbol"] == "NVDA"
    assert health_payload["latest_bar_ts"] == "2026-06-10T09:02:00Z"

    quality = client.get(
        f"{MARKET_AGENT_PREFIX}/market-data/quality",
        params={"symbol": "nvda", "timeframe": "1d", "min_required": 5},
    )
    assert quality.status_code == 200
    quality_payload = quality.json()
    assert quality_payload["status"] in {"warning", "failed"}
    assert quality_payload["bar_count"] == 3


def test_market_data_quality_fails_without_bars_and_no_live_fallback(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    _init_db(tmp_repo)
    client = _client(tmp_repo)

    quality = client.get(
        f"{MARKET_AGENT_PREFIX}/market-data/quality",
        params={"symbol": "MISSING", "timeframe": "5m", "min_required": 3},
    )
    assert quality.status_code == 200
    payload = quality.json()
    assert payload["status"] == "failed"
    assert payload["bar_count"] == 0


def test_market_monitor_run_returns_results(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    engine = _init_db(tmp_repo)
    _seed_bars(engine, "TSLA", "5m", count=3)
    _seed_bars(engine, "NVDA", "5m", count=3)
    client = _client(tmp_repo)

    response = client.post(
        f"{MARKET_AGENT_PREFIX}/market-monitor/run",
        json={
            "symbols": ["tsla", "nvda"],
            "timeframes": ["5m"],
            "limit": 3,
            "min_required": 2,
            "allow_live_fallback": False,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 2
    symbol_order = {item["symbol"] for item in payload["results"]}
    assert symbol_order == {"TSLA", "NVDA"}
    assert all(item["quality_status"] in {"pass", "warning", "failed"} for item in payload["results"])
