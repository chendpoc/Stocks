from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.core.config import Settings
from app.core.events import record_agent_event
from app.core.time import utc_now_iso
from app.db.models import trader_raw_messages
from app.db.session import create_sqlite_engine
from app.modules._json import dumps


@dataclass(frozen=True)
class ImportFailure:
    index: int
    reason: str


@dataclass(frozen=True)
class ImportSummary:
    run_id: str
    created_count: int
    duplicate_count: int
    failed_count: int
    message_ids: list[str] = field(default_factory=list)
    failures: list[ImportFailure] = field(default_factory=list)


def import_jsonl(
    settings: Settings,
    path: str | Path,
    *,
    default_source: str | None = None,
) -> ImportSummary:
    jsonl_path = Path(path)
    records: list[dict[str, Any]] = []
    with jsonl_path.open("r", encoding="utf-8") as file:
        for line in file:
            if line.strip():
                records.append(json.loads(line))
    return import_records(settings, records, default_source=default_source)


def import_records(
    settings: Settings,
    records: list[dict[str, Any]],
    *,
    default_source: str | None = None,
) -> ImportSummary:
    run_id = str(uuid4())
    record_agent_event(
        settings,
        event_type="corpus.import.started",
        status="started",
        run_id=run_id,
        input_summary={"items": len(records), "default_source": default_source},
    )

    created_count = 0
    duplicate_count = 0
    failures: list[ImportFailure] = []
    message_ids: list[str] = []
    engine = create_sqlite_engine(settings)

    with engine.begin() as conn:
        for index, record in enumerate(records):
            try:
                payload = _normalize_record(record, default_source=default_source)
            except ValueError as exc:
                failures.append(ImportFailure(index=index, reason=str(exc)))
                continue

            exists = conn.execute(
                select(trader_raw_messages.c.id).where(
                    trader_raw_messages.c.content_hash == payload["content_hash"]
                )
            ).scalar_one_or_none()
            if exists is not None:
                duplicate_count += 1
                continue

            message_id = str(uuid4())
            conn.execute(trader_raw_messages.insert().values(id=message_id, **payload))
            message_ids.append(message_id)
            created_count += 1

    summary = ImportSummary(
        run_id=run_id,
        created_count=created_count,
        duplicate_count=duplicate_count,
        failed_count=len(failures),
        message_ids=message_ids,
        failures=failures,
    )
    record_agent_event(
        settings,
        event_type="corpus.import.completed",
        status="completed" if not failures else "completed_with_failures",
        run_id=run_id,
        output_summary={
            "created_count": created_count,
            "duplicate_count": duplicate_count,
            "failed_count": len(failures),
        },
    )
    return summary


def _normalize_record(record: dict[str, Any], *, default_source: str | None) -> dict[str, Any]:
    source = str(record.get("source") or default_source or "").strip()
    if not source:
        raise ValueError("missing source")

    raw_text = str(record.get("raw_text") or record.get("text") or "").strip()
    if not raw_text:
        raise ValueError("empty raw_text")

    timestamp = _normalize_timestamp(record.get("timestamp"))
    author = record.get("author")
    author_text = str(author).strip() if author is not None else None
    attachments = {
        "attachments": record.get("attachments", []),
        "context": record.get("context"),
        "outcome": record.get("outcome"),
    }
    content_hash = _content_hash(
        source=source,
        timestamp=timestamp,
        author=author_text,
        raw_text=raw_text,
    )
    return {
        "source": source,
        "source_url": record.get("source_url"),
        "author": author_text,
        "timestamp": timestamp,
        "raw_text": raw_text,
        "attachments": dumps(attachments),
        "reply_to": record.get("reply_to"),
        "imported_at": utc_now_iso(),
        "content_hash": content_hash,
    }


def _normalize_timestamp(value: Any) -> str:
    if not value:
        raise ValueError("missing timestamp")
    if isinstance(value, datetime):
        timestamp = value
    else:
        timestamp = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if timestamp.tzinfo is None:
        raise ValueError("timestamp must include timezone")
    return timestamp.astimezone(UTC).isoformat()


def _content_hash(*, source: str, timestamp: str, author: str | None, raw_text: str) -> str:
    canonical = "\n".join([source, timestamp, author or "", raw_text])
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
