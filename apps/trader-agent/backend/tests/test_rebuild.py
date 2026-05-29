from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select, text

from app.core.config import Settings
from app.db.migrations import bootstrap_database
from app.db.models import agent_events, document_sections, memory_items, source_artifacts
from app.db.session import create_sqlite_engine
from app.main import create_app
from app.modules.artifact_catalog import build_artifact_catalog
from app.modules.markdown_section_indexer import index_markdown_sections
from app.modules.memory_service import create_memory_item
from app.modules.rebuild import (
    backup_database,
    incremental_rebuild,
    rebuild_artifacts,
    revalidate_evidence,
    scan_evidence_health,
)


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


def _write_summary_md(tmp_repo: Path, rel_path: str, body: str) -> Path:
    md_path = tmp_repo / rel_path
    md_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.write_text(body, encoding="utf-8")
    return md_path


def _seed_artifact(
    settings: Settings,
    *,
    artifact_id: str,
    rel_path: str,
    body: str,
) -> str:
    _write_summary_md(settings.repo_root, rel_path, body)
    build_artifact_catalog(settings)
    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        conn.execute(
            source_artifacts.update()
            .where(source_artifacts.c.path == rel_path)
            .values(id=artifact_id)
        )
    index_markdown_sections(settings)
    return artifact_id


def _document_section_ref(
    *,
    artifact_id: str,
    artifact_path: str,
    section_key: str,
    text_digest: str,
) -> dict:
    return {
        "ref_type": "document_section",
        "ref_id": "sec-ref",
        "artifact_id": artifact_id,
        "artifact_path": artifact_path,
        "section_key": section_key,
        "text_digest": text_digest,
        "heading_path": "Summary",
    }


def _memory_review_flags(settings: Settings, item_id: str) -> list[str]:
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT review_flags_json FROM memory_items WHERE id = :item_id"),
            {"item_id": item_id},
        ).one()
    import json

    if row[0] is None:
        return []
    return json.loads(row[0])


def test_backup_creates_sqlite_copy(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    result = backup_database(settings)
    backup_file = Path(result["sqlite_path"])
    assert backup_file.exists()
    assert backup_file.stat().st_size > 0


def test_backup_returns_correct_paths(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    result = backup_database(settings)
    assert "sqlite_path" in result
    assert "timestamp" in result
    assert result["sqlite_path"].endswith(".sqlite")
    assert result["timestamp"] in result["sqlite_path"]


def test_backup_dir_created_if_not_exists(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    backups_dir = settings.data_dir / "backups"
    assert not backups_dir.exists()
    backup_database(settings)
    assert backups_dir.is_dir()


def test_backup_skips_jsonl_when_not_exists(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    result = backup_database(settings)
    assert result["jsonl_path"] is None


def test_incremental_rebuild_calls_catalog_and_index(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _write_summary_md(
        tmp_repo,
        "docs/summaries/2026-05/rebuild-test.md",
        "# Rebuild\n\nBody text for indexing.\n",
    )
    report = incremental_rebuild(settings)
    assert report.catalog.discovered >= 1
    assert report.sections.indexed_artifacts >= 1
    assert report.sections.indexed_sections >= 1


def test_incremental_rebuild_returns_full_report(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _write_summary_md(tmp_repo, "docs/summaries/2026-05/full-report.md", "# Full\n\nReport.\n")
    report = incremental_rebuild(settings)
    assert report.catalog is not None
    assert report.sections is not None
    assert report.evidence is not None
    assert report.duration_ms >= 0


def test_incremental_rebuild_writes_audit_event(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _write_summary_md(tmp_repo, "docs/summaries/2026-05/audit.md", "# Audit\n\nEvent.\n")
    incremental_rebuild(settings)
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        row = (
            conn.execute(
                select(agent_events).where(
                    agent_events.c.event_type == "index_rebuild_completed"
                )
            )
            .mappings()
            .one()
        )
    assert row["status"] == "completed"


def test_rebuild_artifacts_only_rebuilds_specified(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    paths = [
        ("art-1", "docs/summaries/2026-05/one.md", "# One\n\nFirst.\n"),
        ("art-2", "docs/summaries/2026-05/two.md", "# Two\n\nSecond.\n"),
        ("art-3", "docs/summaries/2026-05/three.md", "# Three\n\nThird.\n"),
    ]
    for artifact_id, rel_path, body in paths:
        _seed_artifact(settings, artifact_id=artifact_id, rel_path=rel_path, body=body)

    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        before = {
            row["artifact_id"]: row["text_digest"]
            for row in conn.execute(select(document_sections.c.artifact_id, document_sections.c.text_digest))
            .mappings()
            .all()
        }

    _write_summary_md(tmp_repo, paths[0][1], "# One\n\nUpdated first body.\n")
    rebuild_artifacts(settings, ["art-1"])

    with engine.connect() as conn:
        after = {
            row["artifact_id"]: row["text_digest"]
            for row in conn.execute(select(document_sections.c.artifact_id, document_sections.c.text_digest))
            .mappings()
            .all()
        }
    assert before["art-1"] != after["art-1"]
    assert before["art-2"] == after["art-2"]
    assert before["art-3"] == after["art-3"]


def test_rebuild_artifacts_skips_nonexistent_id(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _write_summary_md(tmp_repo, "docs/summaries/2026-05/skip.md", "# Skip\n\nSafe.\n")
    report = rebuild_artifacts(settings, ["missing-artifact-id"])
    assert report.catalog is not None


def test_revalidate_evidence_detects_stale(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    rel_path = "docs/summaries/2026-05/stale-evidence.md"
    artifact_id = _seed_artifact(
        settings,
        artifact_id="art-stale",
        rel_path=rel_path,
        body="# Stale\n\nOriginal evidence text.\n",
    )
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        section = (
            conn.execute(
                select(document_sections).where(document_sections.c.artifact_id == artifact_id)
            )
            .mappings()
            .first()
        )
    assert section is not None
    create_memory_item(
        settings,
        {
            "memory_type": "trading_rule",
            "title": "Stale evidence memory",
            "evidence_refs_json": [
                _document_section_ref(
                    artifact_id=artifact_id,
                    artifact_path=rel_path,
                    section_key=section["section_key"],
                    text_digest=section["text_digest"],
                )
            ],
        },
    )

    with engine.begin() as conn:
        conn.execute(
            document_sections.update()
            .where(document_sections.c.id == section["id"])
            .values(text_digest="changed-digest", text="changed body")
        )

    report = revalidate_evidence(settings)
    assert report.stale >= 1
    assert report.affected_memory_ids


def test_revalidate_evidence_detects_unresolved(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    rel_path = "docs/summaries/2026-05/unresolved-evidence.md"
    artifact_id = _seed_artifact(
        settings,
        artifact_id="art-unresolved",
        rel_path=rel_path,
        body="# Unresolved\n\nEvidence to delete.\n",
    )
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        section = (
            conn.execute(
                select(document_sections).where(document_sections.c.artifact_id == artifact_id)
            )
            .mappings()
            .first()
        )
    assert section is not None
    create_memory_item(
        settings,
        {
            "memory_type": "trading_rule",
            "title": "Unresolved evidence memory",
            "evidence_refs_json": [
                _document_section_ref(
                    artifact_id=artifact_id,
                    artifact_path=rel_path,
                    section_key=section["section_key"],
                    text_digest=section["text_digest"],
                )
            ],
        },
    )

    with engine.begin() as conn:
        conn.execute(
            delete(document_sections).where(document_sections.c.id == section["id"])
        )

    report = revalidate_evidence(settings)
    assert report.unresolved >= 1
    assert report.affected_memory_ids


def test_revalidate_evidence_updates_review_flags(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    rel_path = "docs/summaries/2026-05/flags-evidence.md"
    artifact_id = _seed_artifact(
        settings,
        artifact_id="art-flags",
        rel_path=rel_path,
        body="# Flags\n\nReview flag body.\n",
    )
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        section = (
            conn.execute(
                select(document_sections).where(document_sections.c.artifact_id == artifact_id)
            )
            .mappings()
            .first()
        )
    assert section is not None
    item = create_memory_item(
        settings,
        {
            "memory_type": "trading_rule",
            "title": "Review flags memory",
            "evidence_refs_json": [
                _document_section_ref(
                    artifact_id=artifact_id,
                    artifact_path=rel_path,
                    section_key=section["section_key"],
                    text_digest=section["text_digest"],
                )
            ],
        },
    )

    with engine.begin() as conn:
        conn.execute(
            document_sections.update()
            .where(document_sections.c.id == section["id"])
            .values(text_digest="changed-digest", text="changed body")
        )

    revalidate_evidence(settings)
    flags = _memory_review_flags(settings, item["id"])
    assert "evidence_stale" in flags


def test_revalidate_evidence_writes_conflict_event(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    rel_path = "docs/summaries/2026-05/conflict-evidence.md"
    artifact_id = _seed_artifact(
        settings,
        artifact_id="art-conflict",
        rel_path=rel_path,
        body="# Conflict\n\nConflict evidence.\n",
    )
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        section = (
            conn.execute(
                select(document_sections).where(document_sections.c.artifact_id == artifact_id)
            )
            .mappings()
            .first()
        )
    assert section is not None
    create_memory_item(
        settings,
        {
            "memory_type": "trading_rule",
            "title": "Conflict event memory",
            "evidence_refs_json": [
                _document_section_ref(
                    artifact_id=artifact_id,
                    artifact_path=rel_path,
                    section_key=section["section_key"],
                    text_digest=section["text_digest"],
                )
            ],
        },
    )

    with engine.begin() as conn:
        conn.execute(
            delete(document_sections).where(document_sections.c.id == section["id"])
        )

    revalidate_evidence(settings)
    with engine.connect() as conn:
        rows = (
            conn.execute(
                select(agent_events).where(
                    agent_events.c.event_type == "memory_conflict_marked",
                )
            )
            .mappings()
            .all()
        )
    assert any("evidence_unresolved" in (row["input_summary"] or "") for row in rows)


def test_rebuild_status_returns_last_rebuild(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    client = _client(tmp_repo)
    bootstrap_database(_settings(tmp_repo))
    _write_summary_md(tmp_repo, "docs/summaries/2026-05/status.md", "# Status\n\nRebuild.\n")
    rebuild_response = client.post("/api/knowledge/incremental-rebuild")
    assert rebuild_response.status_code == 200

    status_response = client.get("/api/knowledge/rebuild-status")
    assert status_response.status_code == 200
    payload = status_response.json()
    assert payload["status"] == "ok"
    assert payload["last_rebuild"]["event_type"] == "index_rebuild_completed"


def test_rebuild_status_no_rebuild_yet(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    client = _client(tmp_repo)
    bootstrap_database(_settings(tmp_repo))
    response = client.get("/api/knowledge/rebuild-status")
    assert response.status_code == 200
    assert response.json() == {"status": "no_rebuild_yet"}


def test_evidence_health_returns_counts(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    client = _client(tmp_repo)
    bootstrap_database(settings)
    rel_path = "docs/summaries/2026-05/health-evidence.md"
    artifact_id = _seed_artifact(
        settings,
        artifact_id="art-health",
        rel_path=rel_path,
        body="# Health\n\nHealth check body.\n",
    )
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        section = (
            conn.execute(
                select(document_sections).where(document_sections.c.artifact_id == artifact_id)
            )
            .mappings()
            .first()
        )
    assert section is not None
    create_memory_item(
        settings,
        {
            "memory_type": "trading_rule",
            "title": "Health memory",
            "evidence_refs_json": [
                _document_section_ref(
                    artifact_id=artifact_id,
                    artifact_path=rel_path,
                    section_key=section["section_key"],
                    text_digest=section["text_digest"],
                )
            ],
        },
    )
    with engine.begin() as conn:
        conn.execute(
            document_sections.update()
            .where(document_sections.c.id == section["id"])
            .values(text_digest="changed-digest", text="changed body")
        )

    response = client.get("/api/knowledge/evidence-health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_memory_items"] == 1
    assert payload["total_evidence_refs"] == 1
    assert payload["stale"] == 1


def test_revalidate_evidence_clears_flags_when_evidence_recovers(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    rel_path = "docs/summaries/2026-05/recover-evidence.md"
    artifact_id = _seed_artifact(
        settings,
        artifact_id="art-recover",
        rel_path=rel_path,
        body="# Recover\n\nRecover body.\n",
    )
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        section = (
            conn.execute(
                select(document_sections).where(document_sections.c.artifact_id == artifact_id)
            )
            .mappings()
            .first()
        )
    assert section is not None
    item = create_memory_item(
        settings,
        {
            "memory_type": "trading_rule",
            "title": "Recover evidence memory",
            "evidence_refs_json": [
                _document_section_ref(
                    artifact_id=artifact_id,
                    artifact_path=rel_path,
                    section_key=section["section_key"],
                    text_digest=section["text_digest"],
                )
            ],
        },
    )

    with engine.begin() as conn:
        conn.execute(
            document_sections.update()
            .where(document_sections.c.id == section["id"])
            .values(text_digest="changed-digest", text="changed body")
        )

    revalidate_evidence(settings)
    assert "evidence_stale" in _memory_review_flags(settings, item["id"])

    with engine.begin() as conn:
        conn.execute(
            document_sections.update()
            .where(document_sections.c.id == section["id"])
            .values(text_digest=section["text_digest"], text=section["text"])
        )

    revalidate_evidence(settings)
    flags = _memory_review_flags(settings, item["id"])
    assert "evidence_stale" not in flags
    assert "evidence_unresolved" not in flags


def test_scan_evidence_health_is_read_only(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    rel_path = "docs/summaries/2026-05/scan-only.md"
    artifact_id = _seed_artifact(
        settings,
        artifact_id="art-scan",
        rel_path=rel_path,
        body="# Scan\n\nScan only.\n",
    )
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        section = (
            conn.execute(
                select(document_sections).where(document_sections.c.artifact_id == artifact_id)
            )
            .mappings()
            .first()
        )
    assert section is not None
    create_memory_item(
        settings,
        {
            "memory_type": "trading_rule",
            "title": "Scan only memory",
            "evidence_refs_json": [
                _document_section_ref(
                    artifact_id=artifact_id,
                    artifact_path=rel_path,
                    section_key=section["section_key"],
                    text_digest=section["text_digest"],
                )
            ],
        },
    )
    with engine.begin() as conn:
        conn.execute(
            document_sections.update()
            .where(document_sections.c.id == section["id"])
            .values(text_digest="changed-digest", text="changed body")
        )

    with engine.connect() as conn:
        before_events = conn.execute(select(agent_events)).mappings().all()

    report = scan_evidence_health(settings)
    assert report.stale >= 1

    with engine.connect() as conn:
        after_events = conn.execute(select(agent_events)).mappings().all()
    assert len(after_events) == len(before_events)


def test_rebuild_artifacts_does_not_run_catalog_scan(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _seed_artifact(
        settings,
        artifact_id="art-no-catalog",
        rel_path="docs/summaries/2026-05/no-catalog.md",
        body="# No Catalog\n\nBody.\n",
    )

    with patch(
        "app.modules.rebuild.build_artifact_catalog",
        side_effect=AssertionError("catalog scan should not run"),
    ):
        report = rebuild_artifacts(settings, ["art-no-catalog"])

    assert report.catalog.discovered == 0
    assert report.catalog.updated == 0


def test_revalidate_evidence_dedupes_conflict_events(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    rel_path = "docs/summaries/2026-05/dedupe-evidence.md"
    artifact_id = _seed_artifact(
        settings,
        artifact_id="art-dedupe",
        rel_path=rel_path,
        body="# Dedupe\n\nDedupe evidence.\n",
    )
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        section = (
            conn.execute(
                select(document_sections).where(document_sections.c.artifact_id == artifact_id)
            )
            .mappings()
            .first()
        )
    assert section is not None
    create_memory_item(
        settings,
        {
            "memory_type": "trading_rule",
            "title": "Dedupe conflict memory",
            "evidence_refs_json": [
                _document_section_ref(
                    artifact_id=artifact_id,
                    artifact_path=rel_path,
                    section_key=section["section_key"],
                    text_digest=section["text_digest"],
                )
            ],
        },
    )
    with engine.begin() as conn:
        conn.execute(
            delete(document_sections).where(document_sections.c.id == section["id"])
        )

    revalidate_evidence(settings)
    revalidate_evidence(settings)

    with engine.connect() as conn:
        rows = (
            conn.execute(
                select(agent_events).where(
                    agent_events.c.event_type == "memory_conflict_marked",
                )
            )
            .mappings()
            .all()
        )
    assert len(rows) == 1


def test_backup_missing_database_raises(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    settings.data_dir.mkdir(parents=True, exist_ok=True)

    with pytest.raises(FileNotFoundError, match="database file not found"):
        backup_database(settings)


def test_backup_api_returns_404_when_database_missing(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    client = _client(tmp_repo)
    settings = _settings(tmp_repo)
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    with patch("app.api.agent.bootstrap_database"):
        response = client.post("/api/knowledge/backup")
    assert response.status_code == 404
    assert "database file not found" in response.json()["detail"]


_INCREMENTAL_REBUILD_FIELDS = {
    "catalog_discovered",
    "catalog_updated",
    "catalog_excluded",
    "catalog_failed",
    "sections_indexed_artifacts",
    "sections_indexed",
    "sections_skipped",
    "sections_failed",
    "evidence_total_items",
    "evidence_total_refs",
    "evidence_resolved",
    "evidence_stale",
    "evidence_unresolved",
    "evidence_affected_ids",
    "duration_ms",
}


def test_api_backup_response_schema(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    client = _client(tmp_repo)
    bootstrap_database(_settings(tmp_repo))
    response = client.post("/api/knowledge/backup")
    assert response.status_code == 200
    payload = response.json()
    assert "sqlite_path" in payload
    assert "timestamp" in payload


def test_api_incremental_rebuild_response_schema(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    client = _client(tmp_repo)
    bootstrap_database(_settings(tmp_repo))
    _write_summary_md(tmp_repo, "docs/summaries/2026-05/api-rebuild.md", "# API\n\nRebuild.\n")
    response = client.post("/api/knowledge/incremental-rebuild")
    assert response.status_code == 200
    assert set(response.json()) == _INCREMENTAL_REBUILD_FIELDS


def test_api_rebuild_artifacts_response_schema(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    client = _client(tmp_repo)
    bootstrap_database(settings)
    _seed_artifact(
        settings,
        artifact_id="art-api",
        rel_path="docs/summaries/2026-05/api-artifact.md",
        body="# API\n\nArtifact rebuild.\n",
    )
    response = client.post(
        "/api/knowledge/rebuild-artifacts",
        json={"artifact_ids": ["art-api"]},
    )
    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == _INCREMENTAL_REBUILD_FIELDS
    assert payload["catalog_discovered"] == 0


def test_incremental_rebuild_emits_started_and_completed_events(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _write_summary_md(tmp_repo, "docs/summaries/2026-05/started.md", "# Started\n\nEvent.\n")
    incremental_rebuild(settings)
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        event_types = {
            row["event_type"]
            for row in conn.execute(select(agent_events)).mappings().all()
        }
    assert "index_rebuild_started" in event_types
    assert "index_rebuild_completed" in event_types
