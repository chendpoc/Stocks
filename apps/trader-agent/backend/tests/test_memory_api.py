from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import Settings
from app.db.migrations import bootstrap_database
from app.db.models import agent_events, document_sections
from app.db.session import create_sqlite_engine
from app.main import create_app
from app.modules.artifact_catalog import build_artifact_catalog
from app.modules.candidate_service import create_candidates
from app.modules.markdown_section_indexer import index_markdown_sections
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
    settings = _settings(tmp_repo)
    return TestClient(create_app(settings=settings))


def _write_summary_md(tmp_repo: Path, body: str) -> None:
    md_path = tmp_repo / "docs" / "summaries" / "2026-05" / "summary.md"
    md_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.write_text(body, encoding="utf-8")


def _catalog_and_index(settings: Settings):
    build_artifact_catalog(settings)
    return index_markdown_sections(settings)


def _create_candidate_via_api(client: TestClient) -> str:
    response = client.post("/api/knowledge/candidates", json={"extraction_mode": "rule_based"})
    assert response.status_code == 200
    return response.json()["created"][0]


def test_post_extract_preview_returns_200_with_preview(tmp_path: Path) -> None:
    client = _client(tmp_path / "repo")
    mock_response = {
        "memory_type": "trading_rule",
        "title": "Preview rule",
        "summary": "summary",
        "rule_text": "rule",
        "applicability": None,
        "invalidation": None,
        "symbols": ["AAPL"],
        "tags": ["breakout"],
        "confidence": 0.7,
    }
    with patch(
        "app.modules.extract_preview._call_deepseek_json",
        return_value=mock_response,
    ):
        response = client.post(
            "/api/knowledge/extract-preview",
            json={"text": "Remember this AAPL setup"},
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload["memory_type"] == "trading_rule"
    assert payload["title"] == "Preview rule"
    assert payload["symbols"] == ["AAPL"]


def test_post_memory_items_creates_active_memory(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    client = _client(tmp_repo)
    bootstrap_database(_settings(tmp_repo))
    response = client.post(
        "/api/knowledge/memory-items",
        json={
            "memory_type": "trading_rule",
            "title": "Manual memory",
            "summary": "summary",
            "symbols_json": ["NVDA"],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "active"
    assert payload["title"] == "Manual memory"


def test_get_memory_items_returns_paginated_list(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    create_memory_item(
        settings,
        {"memory_type": "trading_rule", "title": "One"},
    )
    create_memory_item(
        settings,
        {"memory_type": "trading_rule", "title": "Two"},
    )
    client = _client(tmp_repo)
    response = client.get("/api/knowledge/memory-items", params={"limit": 1, "offset": 0})
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["results"]) == 1
    assert payload["limit"] == 1


def test_patch_memory_items_updates_fields(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    item = create_memory_item(
        settings,
        {"memory_type": "trading_rule", "title": "Original"},
    )
    client = _client(tmp_repo)
    response = client.patch(
        f"/api/knowledge/memory-items/{item['id']}",
        json={"title": "Updated", "updated_by": "agent"},
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Updated"
    assert response.json()["updated_by"] == "agent"


def test_post_candidates_activate_returns_200(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    _write_summary_md(tmp_repo, body="# 2026-05-27 每日总结\n## 核心理论\ntheory\n")
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)
    client = _client(tmp_repo)
    candidate_id = _create_candidate_via_api(client)
    response = client.post(f"/api/knowledge/candidates/{candidate_id}/activate")
    assert response.status_code == 200
    payload = response.json()
    assert payload["memory_item_id"]
    assert isinstance(payload["conflicts_found"], list)


def test_post_candidates_reject_returns_200(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    _write_summary_md(tmp_repo, body="# 2026-05-28 每日总结\n## 核心理论\ntheory\n")
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)
    client = _client(tmp_repo)
    candidate_id = _create_candidate_via_api(client)
    response = client.post(f"/api/knowledge/candidates/{candidate_id}/reject")
    assert response.status_code == 200
    assert response.json()["candidate_status"] == "rejected"


def test_post_candidates_batch_returns_counts(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    _write_summary_md(
        tmp_repo,
        body="# 2026-05-29 每日总结\n## 核心理论\ntheory\n## 入场条件\nentry\n",
    )
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)
    client = _client(tmp_repo)
    created = client.post(
        "/api/knowledge/candidates",
        json={"extraction_mode": "rule_based"},
    ).json()["created"]
    response = client.post(
        "/api/knowledge/candidates/batch",
        json={"candidate_ids": created, "action": "activate"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["activated"]) == len(created)
    assert payload["skipped"] == []


def test_post_memory_items_deprecate_returns_200(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    item = create_memory_item(
        settings,
        {"memory_type": "trading_rule", "title": "To deprecate"},
    )
    client = _client(tmp_repo)
    response = client.post(f"/api/knowledge/memory-items/{item['id']}/deprecate")
    assert response.status_code == 200
    assert response.json()["status"] == "deprecated"


def test_get_memory_item_by_id_resolves_evidence_refs(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    _write_summary_md(tmp_repo, body="# 2026-05-30 每日总结\n## 核心理论\ntheory\n")
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)
    client = _client(tmp_repo)
    candidate_id = _create_candidate_via_api(client)
    memory_item_id = client.post(
        f"/api/knowledge/candidates/{candidate_id}/activate",
    ).json()["memory_item_id"]
    response = client.get(f"/api/knowledge/memory-items/{memory_item_id}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == memory_item_id
    assert payload["evidence_refs"]


def test_post_memory_items_writes_activation_event(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    client = _client(tmp_repo)
    created = client.post(
        "/api/knowledge/memory-items",
        json={"memory_type": "trading_rule", "title": "Event test"},
    ).json()
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        events = conn.execute(
            select(agent_events).where(
                agent_events.c.event_type == "memory_candidate_activated"
            )
        ).mappings().all()
    assert events
    assert any(created["id"] in (event["input_summary"] or "") for event in events)


def test_post_candidates_merge_returns_200(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    _write_summary_md(tmp_repo, body="# 2026-05-31 每日总结\n## 核心理论\ntheory\n")
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)
    target = create_memory_item(
        settings,
        {"memory_type": "trading_rule", "title": "Merge target"},
    )
    client = _client(tmp_repo)
    candidate_id = _create_candidate_via_api(client)
    response = client.post(
        f"/api/knowledge/candidates/{candidate_id}/merge",
        json={"target_memory_item_id": target["id"]},
    )
    assert response.status_code == 200
    assert response.json()["candidate_status"] == "merged"


def test_post_mark_conflict_returns_conflicted_status(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    left = create_memory_item(
        settings,
        {"memory_type": "trading_rule", "title": "Left"},
    )
    right = create_memory_item(
        settings,
        {"memory_type": "trading_rule", "title": "Right"},
    )
    client = _client(tmp_repo)
    response = client.post(
        f"/api/knowledge/memory-items/{left['id']}/mark-conflict",
        json={"conflicting_item_id": right["id"]},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "conflicted"
