from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import Settings
from app.db.migrations import bootstrap_database
from app.db.models import agent_events, source_artifacts
from app.db.session import create_sqlite_engine
from app.main import create_app
from app.modules.artifact_catalog import build_artifact_catalog


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


def _row_by_path(settings: Settings, path: str) -> dict:
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        row = (
            conn.execute(select(source_artifacts).where(source_artifacts.c.path == path))
            .mappings()
            .one()
        )
    return dict(row)


def test_discovers_markdown_file(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    summary_path = tmp_repo / "docs" / "summaries" / "2026-05" / "test.md"
    summary_path.parent.mkdir(parents=True)
    summary_path.write_text("# summary\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    result = build_artifact_catalog(settings)

    row = _row_by_path(settings, "docs/summaries/2026-05/test.md")
    assert result.discovered == 1
    assert row["path"] == "docs/summaries/2026-05/test.md"
    assert row["source_type"] == "generated_summary"
    assert row["memory_eligible"] == 1
    assert row["index_status"] == "pending"


def test_excludes_vitepress_dist(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    leak_path = tmp_repo / "docs" / ".vitepress" / "dist" / "leak.md"
    leak_path.parent.mkdir(parents=True)
    leak_path.write_text("# leak\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    result = build_artifact_catalog(settings)

    row = _row_by_path(settings, "docs/.vitepress/dist/leak.md")
    assert result.excluded == 1
    assert row["index_status"] == "excluded"
    assert row["excluded_reason"] == "**/.vitepress/dist/**"
    assert row["memory_eligible"] == 0


def test_detects_hash_change(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    summary_path = tmp_repo / "docs" / "summaries" / "2026-05" / "test.md"
    summary_path.parent.mkdir(parents=True)
    summary_path.write_text("# v1\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    build_artifact_catalog(settings)
    first = _row_by_path(settings, "docs/summaries/2026-05/test.md")

    summary_path.write_text("# v2\n", encoding="utf-8")
    result = build_artifact_catalog(settings)
    second = _row_by_path(settings, "docs/summaries/2026-05/test.md")

    assert result.updated == 1
    assert second["index_status"] == "stale"
    assert second["content_hash"] != first["content_hash"]
    assert second["created_at"] == first["created_at"]
    assert second["updated_at"] != first["updated_at"]


def test_marks_prd_as_memory_ineligible(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    prd_path = tmp_repo / "project-docs" / "research-agent" / "target-system" / "foo.md"
    prd_path.parent.mkdir(parents=True)
    prd_path.write_text("# prd\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    build_artifact_catalog(settings)

    row = _row_by_path(settings, "project-docs/research-agent/target-system/foo.md")
    assert row["source_type"] == "prd"
    assert row["memory_eligible"] == 0


def test_catalogs_image_metadata_without_blob(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    image_path = tmp_repo / "docs" / "assets" / "chat-images" / "x.png"
    image_path.parent.mkdir(parents=True)
    image_bytes = b"\x89PNG\r\n\x1a\n\x00\x00"
    image_path.write_bytes(image_bytes)

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    build_artifact_catalog(settings)

    row = _row_by_path(settings, "docs/assets/chat-images/x.png")
    assert row["source_type"] == "image"
    assert row["mime_type"] == "image/png"
    assert row["byte_size"] == len(image_bytes)
    assert row["content_hash"]
    assert row["memory_eligible"] == 0


def test_catalogs_raw_jsonl(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    jsonl_path = tmp_repo / "data" / "trader-agent" / "raw" / "messages.jsonl"
    jsonl_path.parent.mkdir(parents=True)
    jsonl_path.write_text('{"text":"hello"}\n', encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    build_artifact_catalog(settings)

    row = _row_by_path(settings, "data/trader-agent/raw/messages.jsonl")
    assert row["source_type"] == "raw_chat"
    assert row["memory_eligible"] == 1


def test_writes_audit_events(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    summary_path = tmp_repo / "docs" / "summaries" / "2026-05" / "test.md"
    summary_path.parent.mkdir(parents=True)
    summary_path.write_text("# summary\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    build_artifact_catalog(settings)

    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        events = conn.execute(
            select(agent_events.c.event_type).where(
                agent_events.c.event_type == "artifact_discovered"
            )
        ).all()

    assert events


def test_scan_artifacts_api(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    summary_path = tmp_repo / "docs" / "summaries" / "2026-05" / "test.md"
    summary_path.parent.mkdir(parents=True)
    summary_path.write_text("# summary\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    app = create_app(settings=settings)
    client = TestClient(app)

    response = client.post("/api/knowledge/scan-artifacts")

    assert response.status_code == 200
    payload = response.json()
    assert payload["discovered"] == 1
    assert payload["updated"] == 0
    assert payload["excluded"] == 0
    assert payload["failed"] == 0


def test_skips_unclassified_files(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    unclassified_path = tmp_repo / "docs" / "notes" / "readme.txt"
    unclassified_path.parent.mkdir(parents=True)
    unclassified_path.write_text("plain text\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    result = build_artifact_catalog(settings)

    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        rows = conn.execute(select(source_artifacts)).mappings().all()

    assert result.discovered == 0
    assert rows == []
