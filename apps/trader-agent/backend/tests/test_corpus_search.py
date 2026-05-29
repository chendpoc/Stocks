from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, insert, select

from app.core.config import Settings
from app.db.migrations import bootstrap_database
from app.db.models import document_chunks
from app.db.session import create_sqlite_engine
from app.main import create_app
from app.modules.artifact_catalog import build_artifact_catalog
from app.modules.corpus_search import search_corpus
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


def test_searches_sections_via_fts(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    md_path = tmp_repo / "docs" / "summaries" / "2026-05" / "signal.md"
    md_path.parent.mkdir(parents=True)
    md_path.write_text("# Trade Signal\nAAPL breakout signal noted here\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    results = search_corpus(settings, query="AAPL")
    assert results
    assert any(result.heading_path for result in results)
    assert any("AAPL" in result.snippet for result in results)


def test_searches_chinese_like(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    md_path = tmp_repo / "docs" / "summaries" / "2026-05" / "cn.md"
    md_path.parent.mkdir(parents=True)
    md_path.write_text("# 摘要\n市场回调风险需要关注\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    results = search_corpus(settings, query="市场回调")
    assert results
    assert any("市场回调" in result.snippet for result in results)


def test_searches_chinese_multi_term_like(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    md_path = tmp_repo / "docs" / "summaries" / "2026-05" / "multi-term.md"
    md_path.parent.mkdir(parents=True)
    md_path.write_text("# 减持\n大股东减持后等三天再观察\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    results = search_corpus(settings, query="减持 三天")
    assert results
    assert any("减持" in result.snippet and "三天" in result.snippet for result in results)


def test_filters_by_symbol(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    md_path = tmp_repo / "docs" / "summaries" / "2026-05" / "tickers.md"
    md_path.parent.mkdir(parents=True)
    md_path.write_text(
        "# Tickers\nTSLA momentum looks strong in this section\n",
        encoding="utf-8",
    )

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    tsla_results = search_corpus(settings, query="momentum", symbol="TSLA")
    assert tsla_results
    assert all("TSLA" in result.symbols for result in tsla_results)

    nvda_results = search_corpus(settings, query="momentum", symbol="NVDA")
    assert nvda_results == []


def test_filters_by_source_type(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    summary_path = tmp_repo / "docs" / "summaries" / "2026-05" / "summary.md"
    summary_path.parent.mkdir(parents=True)
    summary_path.write_text("# Summary\ngenerated summary corpus phrase\n", encoding="utf-8")

    prd_path = (
        tmp_repo
        / "docs"
        / "research-agent"
        / "target-system"
        / "trader-agent"
        / "prd-note.md"
    )
    prd_path.parent.mkdir(parents=True)
    prd_path.write_text("# PRD\nprd corpus phrase here\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    summary_results = search_corpus(
        settings,
        query="corpus phrase",
        source_type="generated_summary",
    )
    assert summary_results
    assert all(result.source_type == "generated_summary" for result in summary_results)

    prd_results = search_corpus(
        settings,
        query="corpus phrase",
        source_type="prd",
    )
    assert prd_results
    assert all(result.source_type == "prd" for result in prd_results)

    excluded = search_corpus(
        settings,
        query="corpus phrase",
        source_type="generated_summary",
        limit=50,
    )
    assert all(result.source_path.endswith("summary.md") for result in excluded)


def test_filters_by_date_range(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    md_path = tmp_repo / "docs" / "summaries" / "2026-05-15" / "dated.md"
    md_path.parent.mkdir(parents=True)
    md_path.write_text("# Dated\ndate filtered corpus content\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    in_range = search_corpus(
        settings,
        query="date filtered",
        start="2026-05-01",
        end="2026-05-31",
    )
    assert in_range

    out_of_range = search_corpus(
        settings,
        query="date filtered",
        start="2026-06-01",
    )
    assert out_of_range == []


def test_returns_backward_compatible_fields(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    md_path = tmp_repo / "docs" / "summaries" / "2026-05" / "compat.md"
    md_path.parent.mkdir(parents=True)
    md_path.write_text("# Compat\nbackward compatible search text\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    payload = search_corpus(settings, query="backward")[0].as_dict()
    assert {
        "evidence_id",
        "source_path",
        "snippet",
        "source_type",
        "confidence",
        "timestamp",
    } <= payload.keys()


def test_returns_new_section_fields(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    md_path = tmp_repo / "docs" / "summaries" / "2026-05" / "fields.md"
    md_path.parent.mkdir(parents=True)
    md_path.write_text("# Fields\nsection field search text\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    payload = search_corpus(settings, query="section field")[0].as_dict()
    assert {
        "section_id",
        "heading_path",
        "start_line",
        "end_line",
        "symbols",
    } <= payload.keys()


def test_search_api_endpoint(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    md_path = tmp_repo / "docs" / "summaries" / "2026-05" / "api.md"
    md_path.parent.mkdir(parents=True)
    md_path.write_text("# API\ntest endpoint search content\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    client = TestClient(create_app(settings=settings))
    response = client.get("/api/knowledge/search", params={"q": "test"})

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload["results"], list)


def test_empty_query_rejected(tmp_path: Path) -> None:
    settings = _settings(tmp_path / "repo")
    app = create_app(settings=settings)
    client = TestClient(app)

    response = client.get("/api/knowledge/search", params={"q": ""})

    assert response.status_code == 422


def test_no_regression_on_old_chunks(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    md_path = tmp_repo / "docs" / "summaries" / "2026-05" / "chunk-safe.md"
    md_path.parent.mkdir(parents=True)
    md_path.write_text("# Safe\nchunk table should remain\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        conn.execute(
            insert(document_chunks).values(
                id="legacy-chunk-id",
                evidence_id="legacy-evidence-id",
                source_path="legacy/path.md",
                source_type="markdown_summary",
                chunk_index=0,
                symbol_hints='["LEGACY"]',
                timestamp_hint="2026-05-01",
                confidence=0.82,
                raw_text="legacy chunk body",
                content_hash="legacy-hash",
                indexed_at="2026-05-29T00:00:00+00:00",
            )
        )

    search_corpus(settings, query="chunk table")

    with engine.connect() as conn:
        count = conn.execute(select(func.count()).select_from(document_chunks)).scalar_one()

    assert count == 1


def test_search_rejects_empty_query_module_level(tmp_path: Path) -> None:
    settings = _settings(tmp_path / "repo")
    bootstrap_database(settings)

    with pytest.raises(ValueError, match="query must not be empty"):
        search_corpus(settings, query=" ")
