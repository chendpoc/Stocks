from __future__ import annotations

from pathlib import Path

from sqlalchemy import text

from app.core.config import Settings
from app.db.migrations import bootstrap_database
from app.db.session import create_sqlite_engine


def _settings(tmp_path: Path) -> Settings:
    return Settings(
        repo_root=tmp_path,
        data_dir=tmp_path / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
    )


def test_bootstrap_adds_missing_tags_json_column(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE memory_candidates (
                    id TEXT PRIMARY KEY NOT NULL,
                    candidate_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    candidate_status TEXT NOT NULL DEFAULT 'candidate',
                    created_by TEXT NOT NULL
                )
                """
            )
        )

    bootstrap_database(settings)

    with engine.connect() as conn:
        columns = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(memory_candidates)"))
        }
    assert "tags_json" in columns


def test_bootstrap_adds_missing_review_flags_json_column(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE memory_items (
                    id TEXT PRIMARY KEY NOT NULL,
                    memory_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active',
                    updated_by TEXT NOT NULL DEFAULT 'human'
                )
                """
            )
        )

    bootstrap_database(settings)

    with engine.connect() as conn:
        columns = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(memory_items)"))
        }
    assert "review_flags_json" in columns
