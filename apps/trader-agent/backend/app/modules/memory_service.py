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
from app.modules._json import json_array_contains
from app.modules.json_row_codec import (
    deserialize_json_fields_in_row,
    serialize_json_fields_in_row,
)
from app.modules.conflict_detector import find_conflicts

_JSON_FIELDS = (
    "evidence_refs_json",
    "symbols_json",
    "related_symbols_json",
    "asset_classes_json",
    "tags_json",
    "review_flags_json",
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
    "tags_json",
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


class MemoryItemConflictError(ValueError):
    def __init__(self, conflicts: list[dict[str, Any]]) -> None:
        self.conflicts = conflicts
        titles = "、".join(conflict["title"] for conflict in conflicts)
        super().__init__(f"与已有 memory 冲突：{titles}")


RESOLVE_CONFLICT_ACTIONS = frozenset(
    {"keep_mine", "keep_other", "merge", "deprecate_both"}
)


def _memory_item_from_row(row: dict[str, Any]) -> dict[str, Any]:
    payload = deserialize_json_fields_in_row(row, _JSON_FIELDS, default=None)
    if payload.get("confidence") is not None:
        payload["confidence"] = float(payload["confidence"])
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
        "tags_json": candidate.get("tags_json") or [],
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
    return [_memory_item_from_row(dict(row)) for row in rows]


def _candidate_review_flags(candidate: dict[str, Any]) -> list[str]:
    flags = candidate.get("review_flags_json") or []
    return list(flags)


def _should_skip_batch_candidate(candidate: dict[str, Any]) -> bool:
    if candidate.get("candidate_status") != "candidate":
        return True
    flags = _candidate_review_flags(candidate)
    return "possible_conflict" in flags


def _memory_candidate_from_row(row: dict[str, Any]) -> dict[str, Any]:
    candidate = deserialize_json_fields_in_row(row, _CANDIDATE_JSON_FIELDS, default=None)
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
    conn.execute(memory_items.insert().values(**serialize_json_fields_in_row(row, _JSON_FIELDS)))
    active_items.append(_memory_item_from_row(row))

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


def _conflict_summaries(conn, conflict_ids: list[str]) -> list[dict[str, Any]]:
    summaries: list[dict[str, Any]] = []
    for conflict_id in conflict_ids:
        row = (
            conn.execute(select(memory_items).where(memory_items.c.id == conflict_id))
            .mappings()
            .one_or_none()
        )
        if row is None:
            continue
        item = _memory_item_from_row(dict(row))
        summaries.append(
            {
                "memory_item_id": conflict_id,
                "title": item.get("title") or "",
                "memory_type": item.get("memory_type"),
            }
        )
    return summaries


def _memory_item_probe(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "memory_type": item["memory_type"],
        "title": item["title"],
        "summary": item.get("summary"),
        "rule_text": item.get("rule_text"),
        "applicability": item.get("applicability"),
        "invalidation": item.get("invalidation"),
        "symbols_json": item.get("symbols_json") or [],
        "tags_json": item.get("tags_json") or [],
        "market_scope": item.get("market_scope"),
        "status": "active",
    }


def create_memory_item(
    settings: Settings,
    item: dict[str, Any],
    *,
    confirm: bool = False,
) -> dict[str, Any]:
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
    serialized = serialize_json_fields_in_row(row, _JSON_FIELDS)
    pending_events: list[_PendingEvent] = []
    conflict_ids: list[str] = []

    with engine.begin() as conn:
        active_items = _load_active_memory_items(conn)
        conflict_ids = find_conflicts(_memory_item_probe(item), active_items)
        if conflict_ids and not confirm:
            raise MemoryItemConflictError(_conflict_summaries(conn, conflict_ids))
        conn.execute(memory_items.insert().values(**serialized))

    pending_events.append(
        _PendingEvent(
            event_type="memory_item_created",
            status="completed",
            input_summary={"memory_item_id": item_id},
        )
    )
    for conflicting_id in conflict_ids:
        pending_events.append(
            _PendingEvent(
                event_type="memory_conflict_marked",
                status="completed",
                input_summary={
                    "memory_item_id": item_id,
                    "conflicting_item_id": conflicting_id,
                },
            )
        )
    _flush_pending_events(settings, pending_events)

    result = _memory_item_from_row(row)
    if conflict_ids:
        result["conflicts_found"] = conflict_ids
    return result


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
        stmt = stmt.where(
            json_array_contains(memory_items.c.symbols_json, normalized_symbol)
        )
    fetch_limit = limit * _SYMBOL_FETCH_MULTIPLIER if symbol else limit
    stmt = stmt.offset(offset).limit(fetch_limit)

    with engine.connect() as conn:
        rows = conn.execute(stmt).mappings().all()
    items = [_memory_item_from_row(dict(row)) for row in rows]
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
    return _memory_item_from_row(dict(row))


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
    serialized = serialize_json_fields_in_row(payload, _JSON_FIELDS)

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
    return _memory_item_from_row(dict(row))


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
    return _memory_item_from_row(dict(row))


def _merge_evidence_refs(
    left: list[Any] | None, right: list[Any] | None
) -> list[Any]:
    merged: list[Any] = list(left or [])
    for ref in right or []:
        if ref not in merged:
            merged.append(ref)
    return merged


def resolve_memory_conflict(
    settings: Settings,
    item_id: str,
    *,
    other_item_id: str,
    resolution: str,
    review_note: str | None = None,
    merged_fields: dict[str, Any] | None = None,
    updated_by: str = "human",
) -> dict[str, Any]:
    if resolution not in RESOLVE_CONFLICT_ACTIONS:
        raise ValueError("invalid resolution")
    if item_id == other_item_id:
        raise ValueError("memory items must be different")

    engine = create_sqlite_engine(settings)
    now = utc_now_iso()

    with engine.begin() as conn:
        left_row = (
            conn.execute(select(memory_items).where(memory_items.c.id == item_id))
            .mappings()
            .one_or_none()
        )
        right_row = (
            conn.execute(select(memory_items).where(memory_items.c.id == other_item_id))
            .mappings()
            .one_or_none()
        )
        if left_row is None or right_row is None:
            raise ValueError("memory item not found")

        left = _memory_item_from_row(dict(left_row))
        right = _memory_item_from_row(dict(right_row))
        if left.get("status") not in {"conflicted", "active"} or right.get("status") not in {
            "conflicted",
            "active",
        }:
            raise ValueError("memory items are not eligible for conflict resolution")

        winner_id = item_id
        loser_id = other_item_id
        if resolution == "keep_other":
            winner_id, loser_id = other_item_id, item_id
        elif resolution == "deprecate_both":
            winner_id = ""
            loser_id = ""

        if resolution == "deprecate_both":
            for memory_id in (item_id, other_item_id):
                conn.execute(
                    memory_items.update()
                    .where(memory_items.c.id == memory_id)
                    .values(
                        status="deprecated",
                        updated_at=now,
                        updated_by=updated_by,
                        last_reviewed_at=now,
                    )
                )
        else:
            updates: dict[str, Any] = {
                "status": "active",
                "updated_at": now,
                "updated_by": updated_by,
                "last_reviewed_at": now,
            }
            if resolution == "merge":
                updates["evidence_refs_json"] = _merge_evidence_refs(
                    left.get("evidence_refs_json"),
                    right.get("evidence_refs_json"),
                )
                if merged_fields:
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
                    }
                    for key, value in merged_fields.items():
                        if key in allowed:
                            updates[key] = value
            conn.execute(
                memory_items.update()
                .where(memory_items.c.id == winner_id)
                .values(**serialize_json_fields_in_row(updates, _JSON_FIELDS))
            )
            conn.execute(
                memory_items.update()
                .where(memory_items.c.id == loser_id)
                .values(
                    status="deprecated",
                    updated_at=now,
                    updated_by=updated_by,
                    last_reviewed_at=now,
                )
            )

    record_agent_event(
        settings,
        event_type="memory_conflict_resolved",
        status="completed",
        input_summary={
            "memory_item_id": item_id,
            "other_item_id": other_item_id,
            "resolution": resolution,
            "review_note": review_note,
            "winner_id": winner_id if winner_id else None,
        },
    )

    if resolution == "deprecate_both":
        with engine.connect() as conn:
            rows = conn.execute(
                select(memory_items).where(
                    memory_items.c.id.in_([item_id, other_item_id])
                )
            ).mappings().all()
        return {
            "resolution": resolution,
            "items": [_memory_item_from_row(dict(row)) for row in rows],
        }

    result_id = winner_id if winner_id else item_id
    item = get_memory_item(settings, result_id)
    assert item is not None
    return {
        "resolution": resolution,
        "memory_item_id": result_id,
        "deprecated_item_id": loser_id,
        "item": item,
    }


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
        candidate = _memory_candidate_from_row(dict(candidate_row))
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
        candidate = _memory_candidate_from_row(dict(candidate_row))
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
        candidate = _memory_candidate_from_row(dict(candidate_row))
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

        target = _memory_item_from_row(dict(target_row))
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

            candidate = _memory_candidate_from_row(dict(candidate_row))
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
