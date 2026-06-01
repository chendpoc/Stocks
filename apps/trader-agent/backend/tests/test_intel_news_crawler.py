from __future__ import annotations

from pathlib import Path

from sqlalchemy import text

from app.core.config import Settings
from app.intel.db.connection import get_intel_engine, set_intel_db_path
from app.intel.db.schema import init_intel_db
from app.intel.ingestion.news_crawler import ingest_news


def _settings(tmp_repo: Path) -> Settings:
    return Settings(
        repo_root=tmp_repo,
        data_dir=tmp_repo / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
    )


def test_ingest_news_writes_source_type_news(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    tmp_repo.mkdir()
    set_intel_db_path(tmp_repo / "data" / "market_intel.db")
    settings = _settings(tmp_repo)
    engine = init_intel_db(settings)

    inserted = ingest_news(settings, engine)
    assert inserted >= 1

    with engine.connect() as conn:
        count = conn.execute(
            text("SELECT COUNT(*) FROM events WHERE source_type = 'news'")
        ).scalar()

    assert int(count) > 0
