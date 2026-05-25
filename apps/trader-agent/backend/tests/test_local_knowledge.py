from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.config import Settings
from app.db.migrations import bootstrap_database
from app.db.models import document_chunks
from app.db.session import create_sqlite_engine
from app.main import create_app
from app.modules.document_indexer import index_local_knowledge
from app.modules.knowledge_source_registry import list_local_knowledge_sources
from app.modules.local_search import search_local_knowledge

FIXTURE_KNOWLEDGE_ROOT = Path(__file__).resolve().parent / "fixtures" / "knowledge"


def _settings(tmp_path: Path) -> Settings:
    repo_root = Path(__file__).resolve().parents[4]
    data_dir = tmp_path / "trader-agent-data"
    raw_dir = data_dir / "raw"
    raw_dir.mkdir(parents=True)
    (raw_dir / "trader_messages.jsonl").write_text(
        (FIXTURE_KNOWLEDGE_ROOT / "raw" / "trader_messages.jsonl").read_text(
            encoding="utf-8"
        ),
        encoding="utf-8",
    )
    return Settings(
        repo_root=repo_root,
        data_dir=data_dir,
        fixture_data_dir=FIXTURE_KNOWLEDGE_ROOT,
        knowledge_docs_root=FIXTURE_KNOWLEDGE_ROOT / "docs" / "summaries",
        rulepack_path=repo_root / "apps" / "trader-agent" / "shared" / "rulepacks" / "v0_1_0.yaml",
    )


def test_registry_lists_existing_sources_and_ignores_missing_optional_jsonl(tmp_path: Path) -> None:
    settings = _settings(tmp_path)

    sources = list_local_knowledge_sources(
        settings,
        docs_root=FIXTURE_KNOWLEDGE_ROOT / "docs" / "summaries",
    )

    source_paths = {source.path.name for source in sources}
    assert "2026-05-22-zhao.md" in source_paths
    assert "trader_messages.jsonl" in source_paths
    assert "x_posts.jsonl" not in source_paths


def test_reindex_is_idempotent_and_stores_normalized_chunks(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)

    first = index_local_knowledge(
        settings,
        docs_root=FIXTURE_KNOWLEDGE_ROOT / "docs" / "summaries",
    )
    second = index_local_knowledge(
        settings,
        docs_root=FIXTURE_KNOWLEDGE_ROOT / "docs" / "summaries",
    )

    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        chunk_count = conn.execute(select(func.count()).select_from(document_chunks)).scalar_one()
        tsla_chunk = conn.execute(
            select(document_chunks).where(document_chunks.c.raw_text.like("%TSLA%"))
        ).mappings().first()

    assert first.indexed_count == second.indexed_count
    assert chunk_count == second.indexed_count
    assert tsla_chunk is not None
    assert tsla_chunk["source_type"] in {"markdown_summary", "trader_message"}
    assert "TSLA" in tsla_chunk["symbol_hints"]
    assert tsla_chunk["confidence"] > 0


def test_search_filters_by_ticker_rule_phrase_and_date_range(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    index_local_knowledge(
        settings,
        docs_root=FIXTURE_KNOWLEDGE_ROOT / "docs" / "summaries",
    )

    results = search_local_knowledge(
        settings,
        query="减持 三天",
        symbol="TSLA",
        start="2026-05-22",
        end="2026-05-22",
        limit=5,
    )

    assert len(results) >= 1
    top = results[0]
    assert top.evidence_id.startswith("knowledge:")
    assert top.source_path.endswith("2026-05-22-zhao.md") or top.source_path.endswith(
        "trader_messages.jsonl"
    )
    assert top.source_type in {"markdown_summary", "trader_message"}
    assert "减持" in top.snippet
    assert "TSLA" in top.symbol_hints
    assert top.timestamp is not None
    assert top.confidence > 0


def test_mixed_ticker_and_chinese_query_requires_every_term(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    index_local_knowledge(settings)

    results = search_local_knowledge(
        settings,
        query="TSLA 不存在词",
        symbol="TSLA",
        limit=5,
    )

    assert results == []


def test_search_rejects_empty_query_and_invalid_limit_without_scanning(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)

    with pytest.raises(ValueError, match="query must not be empty"):
        search_local_knowledge(settings, query=" ", limit=5)

    with pytest.raises(ValueError, match="limit must be between 1 and 50"):
        search_local_knowledge(settings, query="TSLA", limit=0)


def test_knowledge_api_reindexes_and_searches(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    app = create_app(settings=settings)
    client = TestClient(app)

    reindex_response = client.post("/api/knowledge/reindex")

    assert reindex_response.status_code == 200
    assert reindex_response.json()["indexed_count"] >= 2

    search_response = client.get(
        "/api/knowledge/search",
        params={
            "q": "post reduction wait window",
            "symbol": "TSLA",
            "start": "2026-05-22",
            "end": "2026-05-22",
            "limit": 5,
        },
    )

    assert search_response.status_code == 200
    payload = search_response.json()
    assert payload["query"] == "post reduction wait window"
    assert payload["results"]
    assert {
        "evidence_id",
        "source_path",
        "snippet",
        "source_type",
        "confidence",
        "timestamp",
        "symbol_hints",
    } <= set(payload["results"][0])
