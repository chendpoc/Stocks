from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.core.config import Settings
from app.core.time import utc_now_iso
from app.db.models import agent_events
from app.db.session import create_sqlite_engine


def _json_text(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def record_agent_event(
    settings: Settings,
    *,
    event_type: str,
    status: str,
    title: str | None = None,
    summary: str | None = None,
    input_summary: Any = None,
    output_summary: Any = None,
    run_id: str | None = None,
    task_id: str | None = None,
    signal_id: str | None = None,
    symbol: str | None = None,
    tool_name: str | None = None,
    duration_ms: int | None = None,
    error: str | None = None,
) -> str:
    event_id = str(uuid4())
    timestamp = utc_now_iso()
    sqlite_payload = {
        "id": event_id,
        "timestamp": timestamp,
        "run_id": run_id,
        "task_id": task_id,
        "signal_id": signal_id,
        "symbol": symbol,
        "event_type": event_type,
        "status": status,
        "title": title,
        "summary": summary,
        "input_summary": _json_text(input_summary),
        "output_summary": _json_text(output_summary),
        "tool_name": tool_name,
        "duration_ms": duration_ms,
        "error": error,
    }

    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        conn.execute(agent_events.insert().values(**sqlite_payload))

    if settings.enable_event_jsonl_mirror:
        mirror_payload = {
            **sqlite_payload,
            "input_summary": input_summary,
            "output_summary": output_summary,
        }
        mirror_path = Path(settings.data_dir) / "audit" / "agent_events.jsonl"
        mirror_path.parent.mkdir(parents=True, exist_ok=True)
        with mirror_path.open("a", encoding="utf-8") as file:
            file.write(json.dumps(mirror_payload, ensure_ascii=False, sort_keys=True) + "\n")

    return event_id
