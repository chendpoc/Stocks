from __future__ import annotations

from sqlalchemy import inspect

from app.db.migrations import bootstrap_database
from app.db.session import create_sqlite_engine


def test_clean_data_dir_bootstraps_phase0_tables(temp_settings) -> None:
    bootstrap_database(temp_settings)
    engine = create_sqlite_engine(temp_settings)
    inspector = inspect(engine)

    expected_tables = {
        "trader_raw_messages",
        "trader_semantic_events",
        "market_context_snapshots",
        "event_outcomes",
        "playbooks",
        "signals",
        "trade_tickets",
        "agent_messages",
        "agent_events",
        "agent_tasks",
        "agent_rules",
        "agent_capabilities",
        "approval_requests",
        "human_feedback",
        "rule_candidates",
        "rule_candidate_evidence_requirements",
        "lite_backtest_reports",
        "rule_proposals",
        "rule_versions",
    }

    assert expected_tables.issubset(set(inspector.get_table_names()))

