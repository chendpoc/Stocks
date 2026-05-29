from __future__ import annotations

from pathlib import Path

from sqlalchemy import insert

from app.core.config import Settings
from app.db.migrations import bootstrap_database
from app.db.models import document_sections, source_artifacts
from app.db.session import create_sqlite_engine
from app.modules.evidence_ref import EvidenceRef, RefType, ResolverStatus


def _settings(tmp_repo: Path) -> Settings:
    repo_root = Path(__file__).resolve().parents[4]
    return Settings(
        repo_root=tmp_repo,
        data_dir=tmp_repo / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
        rulepack_path=repo_root / "apps" / "trader-agent" / "shared" / "rulepacks" / "v0_1_0.yaml",
    )


def _sample_refs() -> list[tuple[RefType, dict]]:
    return [
        (
            RefType.DOCUMENT_SECTION,
            {
                "ref_type": "document_section",
                "ref_id": "sec-1",
                "artifact_id": "art-1",
                "artifact_path": "docs/summaries/2026-05/test.md",
                "section_key": "abc123",
                "text_digest": "digest-1",
                "heading_path": "Daily Summary > 核心理论",
                "start_line": 3,
                "end_line": 5,
            },
        ),
        (
            RefType.IMAGE_ARTIFACT,
            {
                "ref_type": "image_artifact",
                "ref_id": "img-1",
                "artifact_id": "art-img",
                "artifact_path": "docs/images/chart.png",
                "artifact_hash": "hash-img",
                "perceptual_hash": "phash-1",
            },
        ),
        (
            RefType.RAW_CHAT_MESSAGE,
            {
                "ref_type": "raw_chat_message",
                "ref_id": "msg-1",
                "artifact_id": "art-chat",
                "artifact_path": "data/raw/chat.jsonl",
                "message_id": "m-1",
                "conversation_id": "c-1",
                "message_digest": "md-1",
            },
        ),
        (
            RefType.NEWS_ARCHIVE,
            {
                "ref_type": "news_archive",
                "ref_id": "news-1",
                "artifact_id": "art-news",
                "artifact_path": "data/raw/news_events.jsonl",
                "archive_id": "na-1",
                "source_url": "https://example.com/news",
                "published_at": "2026-05-15",
            },
        ),
        (
            RefType.FILING_ARCHIVE,
            {
                "ref_type": "filing_archive",
                "ref_id": "filing-1",
                "artifact_id": "art-filing",
                "artifact_path": "data/raw/filing_events.jsonl",
                "archive_id": "fa-1",
                "content_digest": "cd-1",
            },
        ),
    ]


def test_from_dict_as_dict_roundtrip_for_all_ref_types() -> None:
    for ref_type, payload in _sample_refs():
        ref = EvidenceRef.from_dict(payload)
        assert ref.ref_type == ref_type
        roundtrip = ref.as_dict()
        assert roundtrip["ref_type"] == ref_type.value
        assert EvidenceRef.from_dict(roundtrip).as_dict() == roundtrip


def test_field_specific_values_preserved_for_document_section() -> None:
    payload = _sample_refs()[0][1]
    ref = EvidenceRef.from_dict(payload)
    assert ref.section_key == "abc123"
    assert ref.text_digest == "digest-1"
    assert ref.heading_path == "Daily Summary > 核心理论"


def test_resolve_document_section_found(tmp_path: Path) -> None:
    settings = _settings(tmp_path / "repo")
    bootstrap_database(settings)
    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        conn.execute(
            insert(source_artifacts).values(
                id="art-1",
                source_type="markdown_summary",
                path="docs/summaries/2026-05/test.md",
                index_status="indexed",
                memory_eligible=1,
            )
        )
        conn.execute(
            insert(document_sections).values(
                id="sec-1",
                artifact_id="art-1",
                section_key="abc123",
                text_digest="digest-1",
                section_index=0,
                heading_path="Daily Summary > 核心理论",
                section_type="heading",
                text="theory body",
            )
        )

    ref = EvidenceRef.from_dict(_sample_refs()[0][1])
    resolved = ref.resolve(engine)
    assert resolved.resolver_status == ResolverStatus.RESOLVED


def test_resolve_document_section_stale(tmp_path: Path) -> None:
    settings = _settings(tmp_path / "repo")
    bootstrap_database(settings)
    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        conn.execute(
            insert(source_artifacts).values(
                id="art-1",
                source_type="markdown_summary",
                path="docs/summaries/2026-05/test.md",
                index_status="indexed",
                memory_eligible=1,
            )
        )
        conn.execute(
            insert(document_sections).values(
                id="sec-1",
                artifact_id="art-1",
                section_key="abc123",
                text_digest="changed-digest",
                section_index=0,
                heading_path="Daily Summary > 核心理论",
                section_type="heading",
                text="updated body",
            )
        )

    ref = EvidenceRef.from_dict(_sample_refs()[0][1])
    resolved = ref.resolve(engine)
    assert resolved.resolver_status == ResolverStatus.STALE


def test_resolve_document_section_unresolved(tmp_path: Path) -> None:
    settings = _settings(tmp_path / "repo")
    bootstrap_database(settings)
    engine = create_sqlite_engine(settings)

    ref = EvidenceRef.from_dict(_sample_refs()[0][1])
    resolved = ref.resolve(engine)
    assert resolved.resolver_status == ResolverStatus.UNRESOLVED


def test_as_dict_excludes_none_values() -> None:
    ref = EvidenceRef(
        ref_type=RefType.DOCUMENT_SECTION,
        ref_id="sec-1",
        artifact_id="art-1",
        artifact_path="docs/summaries/test.md",
        section_key="key-1",
    )
    payload = ref.as_dict()
    assert "quote" not in payload
    assert "note" not in payload
    assert "text_digest" not in payload


def test_from_dict_handles_missing_optional_fields() -> None:
    ref = EvidenceRef.from_dict(
        {
            "ref_type": "image_artifact",
            "ref_id": "img-1",
            "artifact_id": "art-img",
            "artifact_path": "docs/images/chart.png",
        }
    )
    assert ref.perceptual_hash is None
    assert ref.resolver_status == ResolverStatus.RESOLVED
