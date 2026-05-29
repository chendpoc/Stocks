from __future__ import annotations

import json
from pathlib import Path

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


def _catalog_and_index(settings: Settings):
    build_artifact_catalog(settings)
    return index_markdown_sections(settings)


def _write_summary_md(tmp_repo: Path, body: str) -> None:
    md_path = tmp_repo / "docs" / "summaries" / "2026-05" / "summary.md"
    md_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.write_text(body, encoding="utf-8")


def _client(tmp_repo: Path) -> TestClient:
    settings = _settings(tmp_repo)
    return TestClient(create_app(settings=settings))


def _sections(settings: Settings) -> list[dict]:
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        rows = conn.execute(select(document_sections)).mappings().all()
    return [dict(row) for row in rows]


def test_post_candidates_rule_based_returns_created_and_flagged(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    _write_summary_md(
        tmp_repo,
        body="# 2026-05-19 每日总结\n## 核心理论\ntheory content\n",
    )
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    client = _client(tmp_repo)
    response = client.post("/api/knowledge/candidates", json={"extraction_mode": "rule_based"})

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload["created"], list)
    assert isinstance(payload["flagged"], list)
    assert payload["created"]


def test_post_candidates_with_section_ids_filters(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    _write_summary_md(
        tmp_repo,
        body=(
            "# 2026-05-21 每日总结\n"
            "## 核心理论\n"
            "theory one\n"
            "## 入场条件\n"
            "entry one\n"
        ),
    )
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    target_id = next(
        row["id"]
        for row in _sections(settings)
        if "入场条件" in row["heading_path"]
    )

    client = _client(tmp_repo)
    response = client.post(
        "/api/knowledge/candidates",
        json={"extraction_mode": "rule_based", "section_ids": [target_id]},
    )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["created"]) == 1

    list_response = client.get("/api/knowledge/candidates")
    titles = [item["title"] for item in list_response.json()["results"]]
    assert all("入场条件" in title for title in titles)
    assert not any("核心理论" in title for title in titles)


def test_post_candidates_on_empty_sections_returns_empty_lists(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    _write_summary_md(tmp_repo, body="# Plain\nno matching headings\n")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    client = _client(tmp_repo)
    response = client.post("/api/knowledge/candidates", json={"extraction_mode": "rule_based"})

    assert response.status_code == 200
    assert response.json() == {"created": [], "flagged": []}


def test_get_candidates_returns_paginated_list(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    _write_summary_md(
        tmp_repo,
        body="# 2026-05-22 每日总结\n## 核心理论\ntheory\n## 入场条件\nentry\n",
    )
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    client = _client(tmp_repo)
    client.post("/api/knowledge/candidates", json={"extraction_mode": "rule_based"})

    response = client.get("/api/knowledge/candidates", params={"limit": 1, "offset": 0})
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["results"]) == 1
    assert payload["limit"] == 1
    assert payload["offset"] == 0


def test_get_candidates_filters_by_status(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    _write_summary_md(tmp_repo, body="# 2026-05-23 每日总结\n## 核心理论\ntheory\n")
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    client = _client(tmp_repo)
    client.post("/api/knowledge/candidates", json={"extraction_mode": "rule_based"})

    response = client.get("/api/knowledge/candidates", params={"status": "candidate"})
    assert response.status_code == 200
    assert response.json()["results"]


def test_get_candidates_filters_by_symbol(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    _write_summary_md(
        tmp_repo,
        body="# 2026-05-24 每日总结\n## AAPL\n## 核心理论\nAAPL theory content\n",
    )
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    client = _client(tmp_repo)
    client.post("/api/knowledge/candidates", json={"extraction_mode": "rule_based"})

    response = client.get("/api/knowledge/candidates", params={"symbol": "AAPL"})
    assert response.status_code == 200
    results = response.json()["results"]
    assert results
    assert all("AAPL" in (item.get("symbols_json") or []) for item in results)


def test_get_candidate_by_id_returns_resolved_evidence_refs(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    _write_summary_md(tmp_repo, body="# 2026-05-25 每日总结\n## 核心理论\ntheory\n")
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    client = _client(tmp_repo)
    created = client.post(
        "/api/knowledge/candidates",
        json={"extraction_mode": "rule_based"},
    ).json()["created"][0]

    response = client.get(f"/api/knowledge/candidates/{created}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == created
    assert payload["evidence_refs"]
    assert payload["evidence_refs"][0]["resolver_status"] == "resolved"


def test_get_candidate_nonexistent_returns_404(tmp_path: Path) -> None:
    client = _client(tmp_path / "repo")
    response = client.get("/api/knowledge/candidates/missing-id")
    assert response.status_code == 404


def test_memory_candidate_created_event_written_after_post(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    _write_summary_md(tmp_repo, body="# 2026-05-26 每日总结\n## 核心理论\ntheory\n")
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    client = _client(tmp_repo)
    created = client.post(
        "/api/knowledge/candidates",
        json={"extraction_mode": "rule_based"},
    ).json()["created"]

    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        events = conn.execute(
            select(agent_events).where(agent_events.c.event_type == "memory_candidate_created")
        ).mappings().all()

    assert len(events) == len(created)
    event_candidate_ids = {json.loads(event["input_summary"])["candidate_id"] for event in events}
    assert event_candidate_ids == set(created)


def test_duplicate_candidates_are_flagged(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)

    duplicate = {
        "candidate_type": "trading_rule",
        "title": "AAPL Breakout Rule",
        "summary": "summary",
        "symbols_json": ["AAPL"],
        "confidence": 0.6,
        "candidate_status": "candidate",
        "created_by": "rule_based",
        "evidence_refs_json": [],
    }
    first = create_candidates(settings, [duplicate])
    second = create_candidates(
        settings,
        [{**duplicate, "title": "AAPL Breakout Rules"}],
    )

    assert first.created
    assert second.flagged == second.created
