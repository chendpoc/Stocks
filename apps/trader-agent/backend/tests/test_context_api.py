from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import Settings
from app.db.migrations import bootstrap_database
from app.db.models import agent_events
from app.db.session import create_sqlite_engine
from app.main import create_app
from app.modules.memory_service import create_memory_item


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _settings(tmp_repo: Path) -> Settings:
    return Settings(
        repo_root=tmp_repo,
        data_dir=tmp_repo / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
        rulepack_path=_repo_root()
        / "apps"
        / "trader-agent"
        / "shared"
        / "rulepacks"
        / "v0_1_0.yaml",
    )


def _client(tmp_repo: Path) -> TestClient:
    return TestClient(create_app(settings=_settings(tmp_repo)))


def test_post_select_context_returns_200(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    create_memory_item(
        settings,
        {
            "memory_type": "trading_rule",
            "title": "SPY rule",
            "symbols_json": ["SPY"],
            "confidence": 0.8,
        },
        confirm=True,
    )
    client = _client(tmp_repo)

    response = client.post(
        "/api/knowledge/select-context",
        json={
            "task_type": "signal_explanation",
            "symbols": ["SPY"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["selector_version"] == "v1"
    assert len(payload["memories"]) == 1
    assert payload["memories"][0]["title"] == "SPY rule"
    assert payload["total_chars"] >= 0


def test_post_select_context_writes_audit_event(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    created = create_memory_item(
        settings,
        {
            "memory_type": "trading_rule",
            "title": "Audit rule",
            "symbols_json": ["AUD"],
            "confidence": 0.8,
        },
        confirm=True,
    )
    client = _client(tmp_repo)

    response = client.post(
        "/api/knowledge/select-context",
        json={
            "task_type": "signal_explanation",
            "symbols": ["AUD"],
        },
    )
    assert response.status_code == 200

    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        events = conn.execute(
            select(agent_events).where(
                agent_events.c.event_type == "memory_context_selected"
            )
        ).mappings().all()

    assert events
    latest = events[-1]
    assert latest["status"] == "completed"
    assert created["id"] in str(latest["input_summary"])


def test_post_select_context_returns_no_results_for_no_match(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    create_memory_item(
        settings,
        {
            "memory_type": "source_pattern_summary",
            "title": "Other",
            "symbols_json": ["OTHER"],
            "confidence": 0.8,
        },
        confirm=True,
    )
    client = _client(tmp_repo)

    response = client.post(
        "/api/knowledge/select-context",
        json={
            "task_type": "signal_explanation",
            "symbols": ["ZZZZ"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["memories"] == []
    assert payload["excluded_count"] >= 1
    assert "excluded_reasons" in payload
    assert payload["pool_count"] >= 1
