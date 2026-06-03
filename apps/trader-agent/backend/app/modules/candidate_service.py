from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.core.config import Settings
from app.core.time import utc_now_iso
from app.db.models import memory_candidates
from app.db.session import create_sqlite_engine
from app.modules._json import json_array_contains
from app.modules.json_row_codec import (
    deserialize_json_fields_in_row,
    serialize_json_fields_in_row,
)

_JSON_FIELDS = (
    "trigger_conditions_json",
    "invalidation_conditions_json",
    "evidence_refs_json",
    "symbols_json",
    "related_symbols_json",
    "asset_classes_json",
    "review_flags_json",
    "tags_json",
)


@dataclass
class CandidateCreateResult:
    created: list[str]
    flagged: list[str]


def _normalize_title(title: str) -> str:
    return title.strip().lower()


def _levenshtein(left: str, right: str) -> int:
    if left == right:
        return 0
    if not left:
        return len(right)
    if not right:
        return len(left)
    prev = list(range(len(right) + 1))
    for i, left_char in enumerate(left, 1):
        curr = [i]
        for j, right_char in enumerate(right, 1):
            insert_cost = curr[j - 1] + 1
            delete_cost = prev[j] + 1
            replace_cost = prev[j - 1] + (0 if left_char == right_char else 1)
            curr.append(min(insert_cost, delete_cost, replace_cost))
        prev = curr
    return prev[-1]


def _similarity_ratio(left: str, right: str) -> float:
    max_len = max(len(left), len(right))
    if max_len == 0:
        return 1.0
    return 1.0 - (_levenshtein(left, right) / max_len)


def _symbol_overlap(left: list[str] | None, right: list[str] | None) -> bool:
    left_set = {symbol.upper() for symbol in (left or []) if symbol}
    right_set = {symbol.upper() for symbol in (right or []) if symbol}
    return bool(left_set & right_set)


def _is_possible_duplicate(candidate: dict[str, Any], existing: dict[str, Any]) -> bool:
    title_ratio = _similarity_ratio(
        _normalize_title(candidate.get("title", "")),
        _normalize_title(existing.get("title", "")),
    )
    if title_ratio <= 0.7:
        return False
    candidate_symbols = candidate.get("symbols_json") or []
    existing_symbols = existing.get("symbols_json") or []
    return _symbol_overlap(candidate_symbols, existing_symbols)


def _serialize_candidate_row(
    candidate: dict[str, Any],
    *,
    review_flags: list[str] | None,
) -> dict[str, Any]:
    evidence_refs = candidate.get("evidence_refs_json", [])
    if evidence_refs and isinstance(evidence_refs[0], dict):
        evidence_refs_value = [ref for ref in evidence_refs]
    else:
        evidence_refs_value = evidence_refs

    row = {
        "id": str(uuid4()),
        "candidate_type": candidate["candidate_type"],
        "title": candidate["title"],
        "summary": candidate.get("summary"),
        "normalized_rule": candidate.get("normalized_rule"),
        "applicability": candidate.get("applicability"),
        "trigger_conditions_json": candidate.get("trigger_conditions_json"),
        "invalidation_conditions_json": candidate.get("invalidation_conditions_json"),
        "evidence_refs_json": evidence_refs_value,
        "symbols_json": candidate.get("symbols_json"),
        "related_symbols_json": candidate.get("related_symbols_json"),
        "asset_classes_json": candidate.get("asset_classes_json"),
        "tags_json": candidate.get("tags_json"),
        "market_scope": candidate.get("market_scope"),
        "confidence": candidate.get("confidence"),
        "candidate_status": candidate.get("candidate_status", "candidate"),
        "review_flags_json": review_flags,
        "created_by": candidate["created_by"],
        "created_at": utc_now_iso(),
        "reviewed_at": None,
        "review_note": None,
    }
    return serialize_json_fields_in_row(row, _JSON_FIELDS)


def _candidate_row_from_db(row: dict[str, Any]) -> dict[str, Any]:
    payload = deserialize_json_fields_in_row(row, _JSON_FIELDS, default=None)
    if payload.get("confidence") is not None:
        payload["confidence"] = float(payload["confidence"])
    return payload


def create_candidates(
    settings: Settings,
    candidates: list[dict[str, Any]],
) -> CandidateCreateResult:
    engine = create_sqlite_engine(settings)
    created: list[str] = []
    flagged: list[str] = []

    with engine.begin() as conn:
        existing_rows = conn.execute(select(memory_candidates)).mappings().all()
        existing = [dict(row) for row in existing_rows]

        rows_to_insert: list[dict[str, Any]] = []
        for candidate in candidates:
            review_flags: list[str] | None = None
            if any(_is_possible_duplicate(candidate, row) for row in existing):
                review_flags = ["possible_duplicate"]

            row = _serialize_candidate_row(candidate, review_flags=review_flags)
            rows_to_insert.append(row)
            existing.append(row)
            created.append(row["id"])
            if review_flags:
                flagged.append(row["id"])

        if rows_to_insert:
            conn.execute(memory_candidates.insert(), rows_to_insert)

    return CandidateCreateResult(created=created, flagged=flagged)


def list_candidates(
    settings: Settings,
    *,
    status: str | None = None,
    candidate_type: str | None = None,
    symbol: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> list[dict[str, Any]]:
    engine = create_sqlite_engine(settings)
    stmt = select(memory_candidates).order_by(memory_candidates.c.created_at.desc())
    if status:
        stmt = stmt.where(memory_candidates.c.candidate_status == status)
    if candidate_type:
        stmt = stmt.where(memory_candidates.c.candidate_type == candidate_type)
    if symbol:
        stmt = stmt.where(
            json_array_contains(memory_candidates.c.symbols_json, symbol.strip().upper())
        )
    stmt = stmt.offset(offset).limit(limit)

    with engine.connect() as conn:
        rows = conn.execute(stmt).mappings().all()
    return [_candidate_row_from_db(dict(row)) for row in rows]


def get_candidate(settings: Settings, candidate_id: str) -> dict[str, Any] | None:
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        row = (
            conn.execute(select(memory_candidates).where(memory_candidates.c.id == candidate_id))
            .mappings()
            .one_or_none()
        )
    if row is None:
        return None
    return _candidate_row_from_db(dict(row))
