from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import select

from app.db.migrations import bootstrap_database
from app.db.models import trader_raw_messages, trader_semantic_events
from app.db.session import create_sqlite_engine
from app.modules.corpus import import_jsonl
from app.modules.semantic_extraction import extract_semantic_events_for_all

FIXTURE = Path(__file__).parent / "fixtures" / "trader_messages.jsonl"


def test_extracts_wait_three_days_rule_with_source_ticker_trigger_and_invalidation(
    temp_settings,
) -> None:
    bootstrap_database(temp_settings)
    import_jsonl(temp_settings, FIXTURE)

    summary = extract_semantic_events_for_all(temp_settings)

    assert summary.created_count >= 1
    engine = create_sqlite_engine(temp_settings)
    with engine.connect() as conn:
        row = (
            conn.execute(
                select(trader_semantic_events, trader_raw_messages.c.source)
                .join(
                    trader_raw_messages,
                    trader_raw_messages.c.id == trader_semantic_events.c.raw_message_id,
                )
                .where(trader_semantic_events.c.setup_hint == "post_reduction_wait_three_days")
            )
            .mappings()
            .one()
        )

    assert row["source"] == "zhao-notes"
    assert row["symbol"] == "TSLA"
    assert row["action"] == "wait"
    assert (
        row["entry_condition"]
        == "wait_three_days_after_reduction_then_require_volume_vwap_reclaim"
    )
    assert "跌破前低" in row["invalidation"]
    aliases = json.loads(row["aliases"])
    assert aliases["ticker_context"][0]["symbol"] == "TSLA"
    assert row["confidence"] >= 0.75


def test_extracts_minimum_rule_hints_without_llm(temp_settings) -> None:
    bootstrap_database(temp_settings)
    import_jsonl(temp_settings, FIXTURE)

    extract_semantic_events_for_all(temp_settings)

    engine = create_sqlite_engine(temp_settings)
    with engine.connect() as conn:
        setup_hints = {
            row[0]
            for row in conn.execute(select(trader_semantic_events.c.setup_hint)).all()
            if row[0]
        }

    assert {
        "sharp_drop_volume_contraction",
        "second_handshake",
        "gap_fill_acceptance",
        "friday_options_double_kill",
        "btc_move_alert",
    }.issubset(setup_hints)
