from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.core.config import Settings
from app.core.events import record_agent_event
from app.core.time import utc_now_iso
from app.db.models import memory_candidates, memory_items
from app.db.session import create_sqlite_engine
from app.modules._json import dumps, loads
from app.modules.conflict_detector import find_conflicts

_JSON_FIELDS = (
    "evidence_refs_json",
    "symbols_json",
    "related_symbols_json",
    "asset_classes_json",
    "tags_json",
)
_SYMBOL_FETCH_MULTIPLIER = 5
_CANDIDATE_JSON_FIELDS = (
    "trigger_conditions_json",
    "invalidation_conditions_json",
    "evidence_refs_json",
    "symbols_json",
    "related_symbols_json",
    "asset_classes_json",
    "review_flags_json",
)


@dataclass(frozen=True)
class _PendingEvent:
    event_type: str
    status: str
    input_summary: dict[str, Any]


@dataclass
class ActivateResult:
    memory_item_id: str
    candidate_ids: list[str]
    conflicts_found: list[str]


@dataclass
class BatchResult:
    activated: list[str]
    rejected: list[str]
    skipped: list[str]


def _deserialize_memory_row(row: dict[str, Any]) -> dict[str, Any]:
    payload = dict(row)
    for field_name in _JSON_FIELDS:
        if field_name in payload and payload[field_name] is not None:
            value = payload[field_name]
            if isinstance(value, str):
                payload[field_name] = loads(value, default=None)
    if payload.get("confidence") is not None:
        payload["confidence"] = float(payload["confidence"])
    return payload


def _serialize_json_fields(item: dict[str, Any]) -> dict[str, Any]:
    payload = dict(item)
    for field_name in _JSON_FIELDS:
        if field_name in payload and payload[field_name] is not None:
            payload[field_name] = dumps(payload[field_name])
    return payload


def _invalidation_text(candidate: dict[str, Any]) -> str | None:
    invalidation = candidate.get("invalidation_conditions_json")
    if invalidation is None:
        return None
    if isinstance(invalidation, str):
        return invalidation
    if isinstance(invalidation, list):
        return "; ".join(str(part) for part in invalidation if part)
    return str(invalidation)


def _candidate_to_memory_item(candidate: dict[str, Any]) -> dict[str, Any]:
    return {
        "memory_type": candidate["candidate_type"],
        "title": candidate["title"],
        "summary": candidate.get("summary"),
        "rule_text": candidate.get("normalized_rule"),
        "applicability": candidate.get("applicability"),
        "invalidation": _invalidation_text(candidate),
        "evidence_refs_json": candidate.get("evidence_refs_json") or [],
        "symbols_json": candidate.get("symbols_json") or [],
        "related_symbols_json": candidate.get("related_symbols_json") or [],
        "asset_classes_json": candidate.get("asset_classes_json") or [],
        "tags_json": [],
        "market_scope": candidate.get("market_scope"),
        "confidence": candidate.get("confidence"),
        "status": "active",
        "updated_by": "human",
    }


def _load_active_memory_items(conn) -> list[dict[str, Any]]:
    rows = (
        conn.execute(select(memory_items).where(memory_items.c.status == "active"))
        .mappings()
        .all()
    )
    return [_deserialize_memory_row(dict(row)) for row in rows]


def _candidate_review_flags(candidate: dict[str, Any]) -> list[str]:
    flags = candidate.get("review_flags_json") or []
    if isinstance(flags, str):
        flags = loads(flags, [])
    return list(flags)


def _should_skip_batch_candidate(candidate: dict[str, Any]) -> bool:
    if candidate.get("candidate_status") != "candidate":
        return True
    flags = _candidate_review_flags(candidate)
    return "possible_conflict" in flags


def _deserialize_candidate_row(row: dict[str, Any]) -> dict[str, Any]:
    candidate = dict(row)
    for field_name in _CANDIDATE_JSON_FIELDS:
        if field_name in candidate:
            candidate[field_name] = loads(candidate[field_name], default=None)
    if candidate.get("confidence") is not None:
        candidate["confidence"] = float(candidate["confidence"])
    return candidate


def _require_pending_candidate(candidate: dict[str, Any]) -> None:
    if candidate.get("candidate_status") != "candidate":
        raise ValueError("candidate already processed")


def _memory_item_has_symbol(item: dict[str, Any], symbol: str) -> bool:
    symbols = item.get("symbols_json") or []
    if isinstance(symbols, str):
        symbols = loads(symbols, [])
    target = symbol.strip().upper()
    return target in {str(value).upper() for value in symbols if value}


def _flush_pending_events(settings: Settings, events: list[_PendingEvent]) -> None:
    for event in events:
        record_agent_event(
            settings,
            event_type=event.event_type,
            status=event.status,
            input_summary=event.input_summary,
        )


def _activate_candidate_in_conn(
    conn,
    *,
    candidate_id: str,
    candidate: dict[str, Any],
    active_items: list[dict[str, Any]],
    now: str,
) -> tuple[str, list[str]]:
    _require_pending_candidate(candidate)
    memory_item_id = str(uuid4())
    memory_payload = _candidate_to_memory_item(candidate)
    conflicts_found = find_conflicts(memory_payload, active_items)
    review_flags: list[str] | None = None
    if conflicts_found:
        review_flags = _candidate_review_flags(candidate)
        if "possible_conflict" not in review_flags:
            review_flags.append("possible_conflict")

    row = {
        "id": memory_item_id,
        **memory_payload,
        "created_at": now,
        "updated_at": now,
    }
    conn.execute(memory_items.insert().values(**_serialize_json_fields(row)))
    active_items.append(_deserialize_memory_row(row))

    candidate_updates: dict[str, Any] = {
        "candidate_status": "activated",
        "reviewed_at": now,
    }
    if review_flags is not None:
        candidate_updates["review_flags_json"] = dumps(review_flags)
    conn.execute(
        memory_candidates.update()
        .where(memory_candidates.c.id == candidate_id)
        .values(**candidate_updates)
    )
    return memory_item_id, conflicts_found


def _activate_pending_events(
    candidate_id: str,
    memory_item_id: str,
    conflicts_found: list[str],
) -> list[_PendingEvent]:
    events = [
        _PendingEvent(
            event_type="memory_candidate_activated",
            status="completed",
            input_summary={
                "candidate_id": candidate_id,
                "memory_item_id": memory_item_id,
            },
        )
    ]
    events.extend(
        _PendingEvent(
            event_type="memory_conflict_marked",
            status="completed",
            input_summary={
                "memory_item_id": memory_item_id,
                "conflicting_item_id": conflicting_id,
            },
        )
        for conflicting_id in conflicts_found
    )
    return events


def create_memory_item(settings: Settings, item: dict[str, Any]) -> dict[str, Any]:
    engine = create_sqlite_engine(settings)
    now = utc_now_iso()
    item_id = str(uuid4())
    row = {
        "id": item_id,
        "memory_type": item["memory_type"],
        "title": item["title"],
        "summary": item.get("summary"),
        "rule_text": item.get("rule_text"),
        "applicability": item.get("applicability"),
        "invalidation": item.get("invalidation"),
        "evidence_refs_json": item.get("evidence_refs_json"),
        "symbols_json": item.get("symbols_json"),
        "related_symbols_json": item.get("related_symbols_json"),
        "asset_classes_json": item.get("asset_classes_json"),
        "tags_json": item.get("tags_json"),
        "market_scope": item.get("market_scope"),
        "confidence": item.get("confidence"),
        "status": item.get("status", "active"),
        "updated_by": item.get("updated_by", "human"),
        "valid_from": item.get("valid_from"),
        "valid_until": item.get("valid_until"),
        "last_reviewed_at": item.get("last_reviewed_at"),
        "created_at": now,
        "updated_at": now,
    }
    serialized = _serialize_json_fields(row)

    with engine.begin() as conn:
        conn.execute(memory_items.insert().values(**serialized))

    return _deserialize_memory_row(row)


def list_memory_items(
    settings: Settings,
    *,
    status: str | None = None,
    memory_type: str | None = None,
    symbol: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> list[dict[str, Any]]:
    engine = create_sqlite_engine(settings)
    stmt = select(memory_items).order_by(memory_items.c.created_at.desc())
    if status:
        stmt = stmt.where(memory_items.c.status == status)
    if memory_type:
        stmt = stmt.where(memory_items.c.memory_type == memory_type)
    if symbol:
        normalized_symbol = symbol.strip().upper()
        stmt = stmt.where(memory_items.c.symbols_json.like(f'%{normalized_symbol}%'))
    fetch_limit = limit * _SYMBOL_FETCH_MULTIPLIER if symbol else limit
    stmt = stmt.offset(offset).limit(fetch_limit)

    with engine.connect() as conn:
        rows = conn.execute(stmt).mappings().all()
    items = [_deserialize_memory_row(dict(row)) for row in rows]
    if symbol:
        normalized_symbol = symbol.strip().upper()
        items = [item for item in items if _memory_item_has_symbol(item, normalized_symbol)]
    return items[:limit]


def get_memory_item(settings: Settings, item_id: str) -> dict[str, Any] | None:
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        row = (
            conn.execute(select(memory_items).where(memory_items.c.id == item_id))
            .mappings()
            .one_or_none()
        )
    if row is None:
        return None
    return _deserialize_memory_row(dict(row))


def update_memory_item(
    settings: Settings,
    item_id: str,
    updates: dict[str, Any],
    updated_by: str = "human",
) -> dict[str, Any] | None:
    engine = create_sqlite_engine(settings)
    now = utc_now_iso()
    allowed = {
        "title",
        "summary",
        "rule_text",
        "applicability",
        "invalidation",
        "symbols_json",
        "related_symbols_json",
        "asset_classes_json",
        "tags_json",
        "market_scope",
        "confidence",
        "status",
        "valid_from",
        "valid_until",
        "last_reviewed_at",
    }
    payload = {key: value for key, value in updates.items() if key in allowed}
    payload["updated_by"] = updated_by
    payload["updated_at"] = now
    serialized = _serialize_json_fields(payload)

    with engine.begin() as conn:
        existing = (
            conn.execute(select(memory_items).where(memory_items.c.id == item_id))
            .mappings()
            .one_or_none()
        )
        if existing is None:
            return None
        conn.execute(
            memory_items.update().where(memory_items.c.id == item_id).values(**serialized)
        )
        row = (
            conn.execute(select(memory_items).where(memory_items.c.id == item_id))
            .mappings()
            .one()
        )
    return _deserialize_memory_row(dict(row))


def deprecate_memory_item(settings: Settings, item_id: str) -> dict[str, Any] | None:
    engine = create_sqlite_engine(settings)
    now = utc_now_iso()
    with engine.begin() as conn:
        existing = (
            conn.execute(select(memory_items).where(memory_items.c.id == item_id))
            .mappings()
            .one_or_none()
        )
        if existing is None:
            return None
        conn.execute(
            memory_items.update()
            .where(memory_items.c.id == item_id)
            .values(status="deprecated", updated_at=now, updated_by="human")
        )
        row = (
            conn.execute(select(memory_items).where(memory_items.c.id == item_id))
            .mappings()
            .one()
        )

    record_agent_event(
        settings,
        event_type="memory_item_deprecated",
        status="completed",
        input_summary={"memory_item_id": item_id},
    )
    return _deserialize_memory_row(dict(row))


def activate_candidate(settings: Settings, candidate_id: str) -> ActivateResult:
    engine = create_sqlite_engine(settings)
    now = utc_now_iso()
    pending_events: list[_PendingEvent] = []

    with engine.begin() as conn:
        candidate_row = (
            conn.execute(
                select(memory_candidates).where(memory_candidates.c.id == candidate_id)
            )
            .mappings()
            .one_or_none()
        )
        if candidate_row is None:
            raise ValueError("candidate not found")
        candidate = _deserialize_candidate_row(dict(candidate_row))
        active_items = _load_active_memory_items(conn)
        memory_item_id, conflicts_found = _activate_candidate_in_conn(
            conn,
            candidate_id=candidate_id,
            candidate=candidate,
            active_items=active_items,
            now=now,
        )

    pending_events.extend(
        _activate_pending_events(candidate_id, memory_item_id, conflicts_found)
    )
    _flush_pending_events(settings, pending_events)

    return ActivateResult(
        memory_item_id=memory_item_id,
        candidate_ids=[candidate_id],
        conflicts_found=conflicts_found,
    )


def reject_candidate(settings: Settings, candidate_id: str) -> dict[str, Any]:
    engine = create_sqlite_engine(settings)
    now = utc_now_iso()
    with engine.begin() as conn:
        candidate_row = (
            conn.execute(
                select(memory_candidates).where(memory_candidates.c.id == candidate_id)
            )
            .mappings()
            .one_or_none()
        )
        if candidate_row is None:
            raise ValueError("candidate not found")
        candidate = _deserialize_candidate_row(dict(candidate_row))
        _require_pending_candidate(candidate)
        conn.execute(
            memory_candidates.update()
            .where(memory_candidates.c.id == candidate_id)
            .values(candidate_status="rejected", reviewed_at=now)
        )

    record_agent_event(
        settings,
        event_type="memory_candidate_rejected",
        status="completed",
        input_summary={"candidate_id": candidate_id},
    )
    return {"candidate_id": candidate_id, "candidate_status": "rejected"}


def merge_candidate(
    settings: Settings,
    candidate_id: str,
    target_memory_item_id: str,
) -> dict[str, Any]:
    engine = create_sqlite_engine(settings)
    now = utc_now_iso()
    with engine.begin() as conn:
        candidate_row = (
            conn.execute(
                select(memory_candidates).where(memory_candidates.c.id == candidate_id)
            )
            .mappings()
            .one_or_none()
        )
        if candidate_row is None:
            raise ValueError("candidate not found")
        candidate = _deserialize_candidate_row(dict(candidate_row))
        _require_pending_candidate(candidate)

        target_row = (
            conn.execute(
                select(memory_items).where(memory_items.c.id == target_memory_item_id)
            )
            .mappings()
            .one_or_none()
        )
        if target_row is None:
            raise ValueError("memory item not found")

        target = _deserialize_memory_row(dict(target_row))
        merged_refs = list(target.get("evidence_refs_json") or [])
        for ref in candidate.get("evidence_refs_json") or []:
            if ref not in merged_refs:
                merged_refs.append(ref)

        conn.execute(
            memory_items.update()
            .where(memory_items.c.id == target_memory_item_id)
            .values(
                evidence_refs_json=dumps(merged_refs),
                updated_at=now,
                updated_by="human",
            )
        )
        conn.execute(
            memory_candidates.update()
            .where(memory_candidates.c.id == candidate_id)
            .values(candidate_status="merged", reviewed_at=now)
        )

    record_agent_event(
        settings,
        event_type="memory_candidate_merged",
        status="completed",
        input_summary={
            "candidate_id": candidate_id,
            "memory_item_id": target_memory_item_id,
        },
    )
    return {
        "candidate_id": candidate_id,
        "candidate_status": "merged",
        "memory_item_id": target_memory_item_id,
    }


def batch_process(
    settings: Settings,
    candidate_ids: list[str],
    action: str,
) -> BatchResult:
    activated: list[str] = []
    rejected: list[str] = []
    skipped: list[str] = []
    pending_events: list[_PendingEvent] = []
    engine = create_sqlite_engine(settings)
    now = utc_now_iso()

    with engine.begin() as conn:
        active_items = _load_active_memory_items(conn)
        for candidate_id in candidate_ids:
            candidate_row = (
                conn.execute(
                    select(memory_candidates).where(memory_candidates.c.id == candidate_id)
                )
                .mappings()
                .one_or_none()
            )
            if candidate_row is None:
                skipped.append(candidate_id)
                continue

            candidate = _deserialize_candidate_row(dict(candidate_row))
            if _should_skip_batch_candidate(candidate):
                skipped.append(candidate_id)
                continue

            try:
                if action == "activate":
                    memory_item_id, conflicts_found = _activate_candidate_in_conn(
                        conn,
                        candidate_id=candidate_id,
                        candidate=candidate,
                        active_items=active_items,
                        now=now,
                    )
                    activated.append(candidate_id)
                    pending_events.extend(
                        _activate_pending_events(
                            candidate_id,
                            memory_item_id,
                            conflicts_found,
                        )
                    )
                elif action == "reject":
                    _require_pending_candidate(candidate)
                    conn.execute(
                        memory_candidates.update()
                        .where(memory_candidates.c.id == candidate_id)
                        .values(candidate_status="rejected", reviewed_at=now)
                    )
                    rejected.append(candidate_id)
                    pending_events.append(
                        _PendingEvent(
                            event_type="memory_candidate_rejected",
                            status="completed",
                            input_summary={"candidate_id": candidate_id},
                        )
                    )
                else:
                    skipped.append(candidate_id)
            except ValueError:
                skipped.append(candidate_id)

    _flush_pending_events(settings, pending_events)
    return BatchResult(activated=activated, rejected=rejected, skipped=skipped)
