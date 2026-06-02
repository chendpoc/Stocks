from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import insert, select

from app.core.config import Settings
from app.db.migrations import bootstrap_database
from app.db.models import agent_events, document_chunks, document_sections, source_artifacts
from app.db.session import create_sqlite_engine
from app.modules.artifact_catalog import build_artifact_catalog
from app.modules.markdown_section_indexer import (
    index_markdown_sections,
    search_document_sections,
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


def _catalog_and_index(settings: Settings):
    build_artifact_catalog(settings)
    return index_markdown_sections(settings)


def _sections(settings: Settings) -> list[dict]:
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        rows = conn.execute(
            select(document_sections).order_by(
                document_sections.c.artifact_id,
                document_sections.c.section_index,
                document_sections.c.start_line,
            )
        ).mappings().all()
    return [dict(row) for row in rows]


def _artifact_by_path(settings: Settings, path: str) -> dict:
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        row = (
            conn.execute(select(source_artifacts).where(source_artifacts.c.path == path))
            .mappings()
            .one()
        )
    return dict(row)


def test_indexes_heading_sections(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    md_path = tmp_repo / "docs" / "summaries" / "2026-05" / "test.md"
    md_path.parent.mkdir(parents=True)
    md_path.write_text(
        "# Daily Summary\n"
        "intro text\n"
        "## AAPL\n"
        "aapl content\n"
        "## TSLA\n"
        "tsla content\n",
        encoding="utf-8",
    )

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    result = _catalog_and_index(settings)

    rel_path = "docs/summaries/2026-05/test.md"
    artifact = _artifact_by_path(settings, rel_path)
    sections = [row for row in _sections(settings) if row["artifact_id"] == artifact["id"]]

    assert result.indexed_artifacts == 1
    assert len(sections) == 3
    assert sections[0]["heading_path"] == "Daily Summary"
    assert sections[0]["start_line"] == 1
    assert sections[0]["end_line"] == 2
    assert sections[1]["heading_path"] == "Daily Summary > AAPL"
    assert sections[1]["start_line"] == 3
    assert sections[1]["end_line"] == 4
    assert sections[2]["heading_path"] == "Daily Summary > TSLA"
    assert sections[2]["start_line"] == 5
    assert sections[2]["end_line"] == 6


def test_indexes_no_heading_markdown(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    md_path = tmp_repo / "docs" / "summaries" / "2026-05" / "plain.md"
    md_path.parent.mkdir(parents=True)
    md_path.write_text("plain body without headings\nsecond line\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    sections = _sections(settings)
    assert len(sections) == 1
    assert sections[0]["section_type"] == "document"
    assert sections[0]["heading_path"] == ""


def test_updates_artifact_indexed_status(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    md_path = tmp_repo / "docs" / "summaries" / "2026-05" / "test.md"
    md_path.parent.mkdir(parents=True)
    md_path.write_text("# summary\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    build_artifact_catalog(settings)

    before = _artifact_by_path(settings, "docs/summaries/2026-05/test.md")
    assert before["index_status"] == "pending"
    assert before["indexed_at"] is None

    index_markdown_sections(settings)

    after = _artifact_by_path(settings, "docs/summaries/2026-05/test.md")
    assert after["index_status"] == "indexed"
    assert after["indexed_at"] is not None


def test_reindexes_stale_artifact_idempotently(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    md_path = tmp_repo / "docs" / "summaries" / "2026-05" / "test.md"
    md_path.parent.mkdir(parents=True)
    md_path.write_text("# v1\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)
    first_count = len(_sections(settings))

    rel_path = "docs/summaries/2026-05/test.md"
    md_path.write_text("# v1\n## updated\nnew section\n", encoding="utf-8")
    build_artifact_catalog(settings)
    assert _artifact_by_path(settings, rel_path)["index_status"] == "stale"

    index_markdown_sections(settings)
    second_count = len(_sections(settings))

    assert second_count == 2
    assert second_count == first_count + 1


def test_keeps_prd_memory_ineligible(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    md_path = tmp_repo / "project-docs" / "research-agent" / "target-system" / "x.md"
    md_path.parent.mkdir(parents=True)
    md_path.write_text("# prd section\nprd body\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    rel_path = "project-docs/research-agent/target-system/x.md"
    artifact = _artifact_by_path(settings, rel_path)
    sections = [row for row in _sections(settings) if row["artifact_id"] == artifact["id"]]

    assert artifact["memory_eligible"] == 0
    assert artifact["index_status"] == "indexed"
    assert sections


def test_writes_markdown_sections_indexed_event(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    md_path = tmp_repo / "docs" / "summaries" / "2026-05" / "test.md"
    md_path.parent.mkdir(parents=True)
    md_path.write_text("# summary\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        events = conn.execute(
            select(agent_events.c.event_type).where(
                agent_events.c.event_type == "markdown_sections_indexed"
            )
        ).all()

    assert events


def test_records_artifact_index_failed(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    settings = _settings(tmp_repo)
    bootstrap_database(settings)

    engine = create_sqlite_engine(settings)
    now = "2026-05-29T00:00:00+00:00"
    with engine.begin() as conn:
        conn.execute(
            insert(source_artifacts).values(
                id="missing-artifact-id",
                source_type="markdown",
                path="docs/summaries/missing.md",
                index_status="pending",
                memory_eligible=1,
                created_at=now,
                updated_at=now,
            )
        )

    index_markdown_sections(settings)

    artifact = _artifact_by_path(settings, "docs/summaries/missing.md")
    assert artifact["index_status"] == "failed"

    with engine.connect() as conn:
        events = conn.execute(
            select(agent_events.c.event_type).where(
                agent_events.c.event_type == "artifact_index_failed"
            )
        ).all()

    assert events


def test_searches_fts_ascii(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    md_path = tmp_repo / "docs" / "summaries" / "2026-05" / "test.md"
    md_path.parent.mkdir(parents=True)
    md_path.write_text("# trade\nAAPL breakout setup\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    results = search_document_sections(settings, "AAPL")
    assert results
    assert any("AAPL" in result.snippet for result in results)


def test_searches_chinese_fallback(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    md_path = tmp_repo / "docs" / "summaries" / "2026-05" / "test.md"
    md_path.parent.mkdir(parents=True)
    md_path.write_text("# 摘要\n中文关键词出现在这里\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    results = search_document_sections(settings, "中文关键词")
    assert results
    assert any("中文关键词" in result.snippet for result in results)


def test_searches_chinese_multi_term_like(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    md_path = tmp_repo / "docs" / "summaries" / "2026-05" / "multi-term.md"
    md_path.parent.mkdir(parents=True)
    md_path.write_text("# 减持\n大股东减持后等三天再观察\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    results = search_document_sections(settings, "减持 三天")
    assert results
    assert any("减持" in result.snippet and "三天" in result.snippet for result in results)


def test_oversized_section_split(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    md_path = tmp_repo / "docs" / "summaries" / "2026-05" / "big.md"
    md_path.parent.mkdir(parents=True)
    long_body = ("paragraph one " * 400 + "\n\n") * 4
    assert len(long_body) > 5000
    md_path.write_text("# Big Section\n" + long_body, encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    rel_path = "docs/summaries/2026-05/big.md"
    artifact = _artifact_by_path(settings, rel_path)
    sections = [row for row in _sections(settings) if row["artifact_id"] == artifact["id"]]

    assert len(sections) > 1
    heading_paths = {section["heading_path"] for section in sections}
    assert heading_paths == {"Big Section"}
    split_indices = sorted(
        json.loads(section["metadata_json"])["split_index"]
        for section in sections
        if section["metadata_json"]
    )
    assert split_indices == list(range(len(sections)))


def test_rejects_path_outside_repo_root(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    tmp_repo.mkdir()
    settings = _settings(tmp_repo)
    bootstrap_database(settings)

    rel_path = "../../../outside.md"
    engine = create_sqlite_engine(settings)
    now = "2026-05-29T00:00:00+00:00"
    with engine.begin() as conn:
        conn.execute(
            insert(source_artifacts).values(
                id="outside-artifact-id",
                source_type="markdown",
                path=rel_path,
                index_status="pending",
                memory_eligible=1,
                created_at=now,
                updated_at=now,
            )
        )

    index_markdown_sections(settings)

    artifact = _artifact_by_path(settings, rel_path)
    assert artifact["index_status"] == "failed"

    with engine.connect() as conn:
        events = conn.execute(
            select(agent_events.c.event_type).where(
                agent_events.c.event_type == "artifact_index_failed"
            )
        ).all()

    assert events


def test_does_not_touch_old_chunks(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    md_path = tmp_repo / "docs" / "summaries" / "2026-05" / "test.md"
    md_path.parent.mkdir(parents=True)
    md_path.write_text("# summary\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)

    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        conn.execute(
            insert(document_chunks).values(
                id="legacy-chunk-id",
                evidence_id="knowledge:legacy",
                source_path=str(md_path),
                source_type="markdown_summary",
                chunk_index=0,
                symbol_hints="[]",
                confidence=0.5,
                raw_text="legacy chunk text",
                content_hash="abc123",
                indexed_at="2026-05-29T00:00:00+00:00",
            )
        )

    _catalog_and_index(settings)

    with engine.connect() as conn:
        rows = conn.execute(select(document_chunks)).mappings().all()

    assert len(rows) == 1
    assert rows[0]["id"] == "legacy-chunk-id"
