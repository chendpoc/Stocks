from __future__ import annotations

from pathlib import Path

from sqlalchemy import text

from app.core.config import Settings
from app.intel.db.connection import get_intel_engine, set_intel_db_path
from app.intel.db.schema import (
    _migrate_decision_outcomes_columns,
    _migrate_evaluation_reports_columns,
    _migrate_market_bars_columns,
    init_intel_db,
)


def _settings(tmp_repo: Path) -> Settings:
    return Settings(
        repo_root=tmp_repo,
        data_dir=tmp_repo / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
    )


def _init_intel_db(tmp_repo: Path):
    db_path = tmp_repo / "data" / "market_intel.db"
    set_intel_db_path(db_path)
    return init_intel_db(_settings(tmp_repo))


def test_market_agent_schema_adds_five_tables_and_keeps_stage1_tables(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    tmp_repo.mkdir()
    engine = _init_intel_db(tmp_repo)

    with engine.connect() as conn:
        table_rows = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        ).fetchall()
    table_names = {row[0] for row in table_rows}

    for table in (
        "feature_snapshots",
        "setup_events",
        "pattern_memories",
        "failure_memories",
        "session_context_packs",
    ):
        assert table in table_names

    for table in (
        "market_bars",
        "model_decisions",
        "decision_outcomes",
        "insight_candidates",
        "insight_candidate_outcomes",
        "symbols",
    ):
        assert table in table_names

    market_bars_cols = {
        row[1]
        for row in engine.connect().execute(text("PRAGMA table_info(market_bars)")).fetchall()
    }
    assert "quality_status" in market_bars_cols
    assert "ingested_at" in market_bars_cols
    assert "quality_score" in market_bars_cols
    assert "gap_count" in market_bars_cols

    decision_outcome_cols = {
        row[1]
        for row in engine.connect().execute(text("PRAGMA table_info(decision_outcomes)")).fetchall()
    }
    assert "barrier_result" in decision_outcome_cols

    evaluation_report_cols = {
        row[1]
        for row in engine.connect().execute(text("PRAGMA table_info(evaluation_reports)")).fetchall()
    }
    assert "evidence_utility_score" in evaluation_report_cols
    assert "contra_predictive_power" in evaluation_report_cols


def test_market_agent_no_legacy_market_memory_tables_created(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    tmp_repo.mkdir()
    engine = _init_intel_db(tmp_repo)
    with engine.connect() as conn:
        table_names = {
            row[0]
            for row in conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            ).fetchall()
        }
    assert "market_snapshots" not in table_names
    assert "decision_memories" not in table_names
    assert "outcome_memories" not in table_names


def test_market_bars_quality_status_migration_adds_column_when_missing(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    tmp_repo.mkdir()
    db_path = tmp_repo / "data" / "market_intel.db"
    set_intel_db_path(db_path)
    settings = _settings(tmp_repo)
    engine = get_intel_engine(settings)

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS market_bars (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  symbol TEXT NOT NULL,
                  timeframe TEXT NOT NULL,
                  ts TEXT NOT NULL,
                  open REAL,
                  high REAL,
                  low REAL,
                  close REAL,
                  volume REAL,
                  vwap REAL,
                  source TEXT,
                  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                  UNIQUE(symbol, timeframe, ts)
                )
                """
            )
        )
        _migrate_market_bars_columns(conn)
        cols_after_first = {
            row[1] for row in conn.execute(text("PRAGMA table_info(market_bars)")).fetchall()
        }
        _migrate_market_bars_columns(conn)
        cols_after_second = {
            row[1] for row in conn.execute(text("PRAGMA table_info(market_bars)")).fetchall()
        }

    assert "ingested_at" in cols_after_first
    assert "quality_status" in cols_after_first
    assert "quality_score" in cols_after_first
    assert "gap_count" in cols_after_first
    assert cols_after_first == cols_after_second


def test_outcome_and_evaluation_metric_migrations_are_idempotent(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    tmp_repo.mkdir()
    db_path = tmp_repo / "data" / "market_intel.db"
    set_intel_db_path(db_path)
    engine = get_intel_engine(_settings(tmp_repo))

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS decision_outcomes (
                  outcome_id TEXT PRIMARY KEY,
                  decision_id TEXT NOT NULL,
                  symbol TEXT NOT NULL,
                  horizon TEXT NOT NULL,
                  path TEXT NOT NULL DEFAULT 'model_path'
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS evaluation_reports (
                  report_id TEXT PRIMARY KEY,
                  model_version TEXT NOT NULL,
                  recommendation TEXT NOT NULL,
                  report_json TEXT NOT NULL
                )
                """
            )
        )
        _migrate_decision_outcomes_columns(conn)
        _migrate_evaluation_reports_columns(conn)
        _migrate_decision_outcomes_columns(conn)
        _migrate_evaluation_reports_columns(conn)

        outcome_cols = {
            row[1] for row in conn.execute(text("PRAGMA table_info(decision_outcomes)")).fetchall()
        }
        report_cols = {
            row[1] for row in conn.execute(text("PRAGMA table_info(evaluation_reports)")).fetchall()
        }

    assert "barrier_result" in outcome_cols
    assert "evidence_utility_score" in report_cols
    assert "contra_predictive_power" in report_cols
