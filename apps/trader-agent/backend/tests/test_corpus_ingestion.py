from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import func, select

from app.db.migrations import bootstrap_database
from app.db.models import agent_events, trader_raw_messages
from app.db.session import create_sqlite_engine
from app.modules.corpus import import_jsonl, import_records

FIXTURE = Path(__file__).parent / "fixtures" / "trader_messages.jsonl"


def test_import_jsonl_keeps_raw_file_readable_and_normalizes_records(temp_settings) -> None:
    bootstrap_database(temp_settings)

    summary = import_jsonl(temp_settings, FIXTURE)

    assert summary.created_count == 5
    assert summary.duplicate_count == 0
    first_line = json.loads(FIXTURE.read_text(encoding="utf-8").splitlines()[0])
    assert "减持后等三天" in first_line["raw_text"]

    engine = create_sqlite_engine(temp_settings)
    with engine.connect() as conn:
        rows = conn.execute(select(trader_raw_messages)).mappings().all()

    assert len(rows) == 5
    assert rows[0]["content_hash"]
    assert rows[0]["timestamp"].endswith("+00:00")
    assert "减持后等三天" in rows[0]["raw_text"]


def test_import_records_deduplicates_by_content_hash_and_writes_batch_events(temp_settings) -> None:
    bootstrap_database(temp_settings)
    record = {
        "source": "api",
        "author": "zhao",
        "timestamp": "2026-05-25T09:30:00-04:00",
        "raw_text": "AAPL 回补缺口后等承接。",
    }

    first = import_records(temp_settings, [record], default_source="api")
    second = import_records(temp_settings, [record], default_source="api")

    assert first.created_count == 1
    assert second.created_count == 0
    assert second.duplicate_count == 1

    engine = create_sqlite_engine(temp_settings)
    with engine.connect() as conn:
        raw_count = conn.execute(select(func.count()).select_from(trader_raw_messages)).scalar_one()
        events = conn.execute(select(agent_events.c.event_type, agent_events.c.status)).all()

    assert raw_count == 1
    assert ("corpus.import.started", "started") in events
    assert ("corpus.import.completed", "completed") in events
