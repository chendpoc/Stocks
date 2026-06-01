from __future__ import annotations

from pathlib import Path

from sqlalchemy import text

from app.core.config import Settings
from app.intel.db.connection import get_intel_engine, set_intel_db_path
from app.intel.db.schema import MVP_PATTERNS, init_intel_db
from app.intel.features.pattern_matcher import scan_patterns


def _settings(tmp_repo: Path) -> Settings:
    return Settings(
        repo_root=tmp_repo,
        data_dir=tmp_repo / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
    )


def test_migration_backfills_all_5_patterns_trigger_sql(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    tmp_repo.mkdir()
    set_intel_db_path(tmp_repo / "data" / "market_intel.db")
    engine = init_intel_db(_settings(tmp_repo))

    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT pattern_id, trigger_sql FROM patterns
                WHERE pattern_id IN (
                  'taco_pattern','higher_low_accumulation','volume_contraction_pullback',
                  'vwap_reclaim','relative_strength_divergence'
                )
                """
            )
        ).mappings().all()

    assert len(rows) == len(MVP_PATTERNS)
    for row in rows:
        assert row["trigger_sql"] is not None and str(row["trigger_sql"]).strip() != ""


def test_pattern_matcher_returns_alert_when_trigger_hits(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    tmp_repo.mkdir()
    set_intel_db_path(tmp_repo / "data" / "market_intel.db")
    engine = init_intel_db(_settings(tmp_repo))

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO signals
                (signal_id, ts, symbol, signal_type, raw_description, severity, status)
                VALUES ('hl_1', datetime('now'), 'TSLA', 'higher_low_candidate', 'hl', 0.7, 'new')
                """
            )
        )

    alerts = scan_patterns(engine)
    ids = {a["pattern_id"] for a in alerts}
    assert "higher_low_accumulation" in ids
