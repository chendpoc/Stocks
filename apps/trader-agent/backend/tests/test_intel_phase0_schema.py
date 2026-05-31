from __future__ import annotations

from pathlib import Path

from sqlalchemy import text

from app.core.config import Settings
from app.intel.db.connection import get_intel_engine, set_intel_db_path
from app.intel.db.schema import MVP_PATTERNS, MVP_SYMBOLS, init_intel_db


def _settings(tmp_repo: Path) -> Settings:
    return Settings(
        repo_root=tmp_repo,
        data_dir=tmp_repo / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
    )


def test_intel_schema_creates_tables_and_seeds(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    tmp_repo.mkdir()
    db_path = tmp_repo / "data" / "market_intel.db"
    set_intel_db_path(db_path)
    settings = _settings(tmp_repo)

    engine = init_intel_db(settings)

    with engine.connect() as conn:
        symbol_count = conn.execute(text("SELECT COUNT(*) FROM symbols")).scalar()
        pattern_count = conn.execute(text("SELECT COUNT(*) FROM patterns")).scalar()
        tables = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        ).fetchall()
        table_names = {row[0] for row in tables}
        lesson_cols = {
            row[1] for row in conn.execute(text("PRAGMA table_info(lessons)")).fetchall()
        }
        seed_count = conn.execute(
            text("SELECT COUNT(*) FROM lessons WHERE source_type = 'seed'")
        ).scalar()

    assert symbol_count == len(MVP_SYMBOLS)
    assert pattern_count == len(MVP_PATTERNS)
    for expected in (
        "symbols",
        "market_bars",
        "events",
        "smart_money_actions",
        "patterns",
        "signals",
        "hypotheses",
        "predictions",
        "outcomes",
        "lessons",
        "trade_ideas",
    ):
        assert expected in table_names

    for col in (
        "symbols_json",
        "summary",
        "rule_text",
        "tags_json",
        "confidence",
        "source_type",
    ):
        assert col in lesson_cols

    assert int(seed_count) >= 3
