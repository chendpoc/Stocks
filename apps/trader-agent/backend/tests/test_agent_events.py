from __future__ import annotations

import json
from datetime import UTC, datetime

from sqlalchemy import select

from app.core.config import Settings
from app.core.events import record_agent_event
from app.db.migrations import bootstrap_database
from app.db.models import agent_events
from app.db.session import create_sqlite_engine


def test_record_agent_event_writes_sqlite_first(temp_settings) -> None:
    bootstrap_database(temp_settings)

    event_id = record_agent_event(
        temp_settings,
        event_type="phase0.test",
        status="completed",
        title="Phase 0 test event",
        output_summary={"ok": True},
    )

    engine = create_sqlite_engine(temp_settings)
    with engine.connect() as conn:
        row = (
            conn.execute(select(agent_events).where(agent_events.c.id == event_id))
            .mappings()
            .one()
        )

    assert row["event_type"] == "phase0.test"
    assert row["status"] == "completed"
    timestamp = datetime.fromisoformat(row["timestamp"])
    assert timestamp.tzinfo == UTC
    assert row["timestamp"].endswith("+00:00")
    assert json.loads(row["output_summary"]) == {"ok": True}


def test_record_agent_event_can_mirror_jsonl(tmp_path, temp_settings) -> None:
    settings = Settings(
        repo_root=temp_settings.repo_root,
        data_dir=tmp_path / "data",
        rulepack_path=temp_settings.rulepack_path,
        enable_event_jsonl_mirror=True,
    )
    bootstrap_database(settings)

    event_id = record_agent_event(
        settings,
        event_type="phase0.mirror",
        status="completed",
        title="Mirror event",
    )

    mirror_path = settings.data_dir / "audit" / "agent_events.jsonl"
    lines = mirror_path.read_text(encoding="utf-8").splitlines()

    assert len(lines) == 1
    payload = json.loads(lines[0])
    assert payload["id"] == event_id
    assert payload["event_type"] == "phase0.mirror"


def test_agent_events_timestamp_has_no_sqlite_server_default(temp_settings) -> None:
    bootstrap_database(temp_settings)

    engine = create_sqlite_engine(temp_settings)
    with engine.connect() as conn:
        rows = conn.exec_driver_sql("PRAGMA table_info(agent_events)").mappings().all()

    timestamp_column = next(row for row in rows if row["name"] == "timestamp")
    assert timestamp_column["dflt_value"] is None
