from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import func, select

from app.db.migrations import bootstrap_database
from app.db.models import (
    event_outcomes,
    market_context_snapshots,
    playbooks,
    trader_semantic_events,
)
from app.db.session import create_sqlite_engine
from app.modules.corpus import import_jsonl
from app.modules.market_context import build_context_snapshots_for_events
from app.modules.outcome_labeling import label_event_outcomes_from_raw_message_fixtures
from app.modules.playbook import aggregate_playbooks
from app.modules.semantic_extraction import extract_semantic_events_for_all

FIXTURE = Path(__file__).parent / "fixtures" / "trader_messages.jsonl"


def test_phase_1a_chain_writes_context_outcomes_and_rule_like_playbook(temp_settings) -> None:
    bootstrap_database(temp_settings)
    import_jsonl(temp_settings, FIXTURE)
    extract_semantic_events_for_all(temp_settings)

    context_summary = build_context_snapshots_for_events(temp_settings)
    outcome_summary = label_event_outcomes_from_raw_message_fixtures(temp_settings)
    playbook_summary = aggregate_playbooks(temp_settings)

    assert context_summary.created_count >= 1
    assert outcome_summary.created_count >= 1
    assert playbook_summary.created_count >= 1

    engine = create_sqlite_engine(temp_settings)
    with engine.connect() as conn:
        semantic_count = conn.execute(
            select(func.count()).select_from(trader_semantic_events)
        ).scalar_one()
        context_rows = conn.execute(select(market_context_snapshots)).mappings().all()
        outcome_rows = conn.execute(select(event_outcomes)).mappings().all()
        playbook_row = conn.execute(
            select(playbooks).where(playbooks.c.setup_type == "post_reduction_wait_three_days")
        ).mappings().one()

    assert semantic_count >= 5
    assert any(json.loads(row["news_summary"])["evidence_gap"] is True for row in context_rows)
    assert outcome_rows[0]["final_label"] == "worked"
    assert playbook_row["sample_size"] >= 1
    assert "TSLA" in json.loads(playbook_row["symbols"])
    assert "wait_three_days_after_reduction" in json.loads(playbook_row["required_conditions"])[0]
    assert "跌破前低" in json.loads(playbook_row["invalidation_conditions"])[0]


def test_phase_1a_derived_outputs_are_idempotent_when_rerun(temp_settings) -> None:
    bootstrap_database(temp_settings)
    import_jsonl(temp_settings, FIXTURE)

    def run_chain() -> dict[str, int]:
        extract_semantic_events_for_all(temp_settings)
        build_context_snapshots_for_events(temp_settings)
        label_event_outcomes_from_raw_message_fixtures(temp_settings)
        aggregate_playbooks(temp_settings)

        engine = create_sqlite_engine(temp_settings)
        with engine.connect() as conn:
            return {
                "semantic": conn.execute(
                    select(func.count()).select_from(trader_semantic_events)
                ).scalar_one(),
                "context": conn.execute(
                    select(func.count()).select_from(market_context_snapshots)
                ).scalar_one(),
                "outcomes": conn.execute(
                    select(func.count()).select_from(event_outcomes)
                ).scalar_one(),
                "playbooks": conn.execute(select(func.count()).select_from(playbooks)).scalar_one(),
            }

    first_counts = run_chain()
    second_counts = run_chain()

    assert second_counts == first_counts
