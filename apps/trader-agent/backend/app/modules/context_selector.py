from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import or_, select

from app.core.config import Settings
from app.core.time import utc_now_iso
from app.db.models import memory_items
from app.db.session import create_sqlite_engine
from app.modules._json import json_array_contains, loads

SELECTOR_VERSION = "v1"
CONFIDENCE_THRESHOLD = 0.5

_TASK_TYPE_PREFERENCE: dict[str, list[str]] = {
    "market_intent_explanation": ["market_mechanism", "source_pattern_summary"],
    "signal_explanation": ["trading_rule", "market_mechanism"],
    "agent_conversation": ["source_pattern_summary", "trading_rule", "market_mechanism"],
    "learning_review": ["trading_rule", "market_mechanism"],
}

_SCORE_WEIGHTS = {
    "symbol_match": 30,
    "related_symbol_match": 15,
    "tag_match": 25,
    "task_type_preferred": 20,
    "task_type_secondary": 10,
    "market_scope_match": 10,
    "recency_bonus": 5,
    "evidence_bonus": 5,
}

_JSON_FIELDS = (
    "evidence_refs_json",
    "symbols_json",
    "related_symbols_json",
    "tags_json",
)


@dataclass
class ContextMemory:
    memory_id: str
    memory_type: str
    title: str
    summary: str
    rule_text: str
    symbols: list[str]
    confidence: float
    relevance_score: int
    rank: int
    source_date: str | None
    heading_path: str | None
    evidence_count: int


@dataclass
class ContextSelectionResult:
    memories: list[ContextMemory]
    total_chars: int
    pool_count: int
    candidate_count: int
    excluded_count: int
    selector_version: str = SELECTOR_VERSION
    selected_reasons: dict[str, list[str]] = field(default_factory=dict)
    excluded_reasons: dict[str, str] = field(default_factory=dict)


@dataclass
class _ScoredItem:
    item: dict[str, Any]
    score: int
    reasons: list[str]


def _normalize_list(value: Any) -> list:
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        return loads(value, [])
    return []


def _normalize_symbols(values: list[Any]) -> set[str]:
    return {str(value).strip().upper() for value in values if value}


def _normalize_tags(values: list[Any]) -> set[str]:
    return {str(value).strip().lower() for value in values if value}


def _days_ago(n: int) -> str:
    return (datetime.now(UTC) - timedelta(days=n)).isoformat()


def _deserialize_row(row: dict[str, Any]) -> dict[str, Any]:
    payload = dict(row)
    for field_name in _JSON_FIELDS:
        if field_name in payload and payload[field_name] is not None:
            value = payload[field_name]
            if isinstance(value, str):
                payload[field_name] = loads(value, default=None)
    if payload.get("confidence") is not None:
        payload["confidence"] = float(payload["confidence"])
    return payload


def _resolve_task_type(task_type: str) -> str:
    normalized = (task_type or "").strip()
    if normalized in _TASK_TYPE_PREFERENCE:
        return normalized
    return "agent_conversation"


def _eligible_pool_filters(now_iso: str):
    return (
        memory_items.c.status == "active",
        memory_items.c.confidence >= CONFIDENCE_THRESHOLD,
        or_(
            memory_items.c.valid_until.is_(None),
            memory_items.c.valid_until >= now_iso,
        ),
    )


def _build_overlap_filters(
    *,
    symbols: list[str] | None,
    tags: list[str] | None,
    market_scope: str | None,
    task_type: str,
) -> list[Any]:
    clauses: list[Any] = []
    for symbol in symbols or []:
        normalized = symbol.strip().upper()
        if not normalized:
            continue
        clauses.append(json_array_contains(memory_items.c.symbols_json, normalized))
        clauses.append(
            json_array_contains(memory_items.c.related_symbols_json, normalized)
        )
    for tag in tags or []:
        normalized = tag.strip().lower()
        if not normalized:
            continue
        clauses.append(json_array_contains(memory_items.c.tags_json, normalized))
    if market_scope:
        clauses.append(memory_items.c.market_scope == market_scope)
    prefs = _TASK_TYPE_PREFERENCE.get(task_type, [])
    if prefs:
        clauses.append(memory_items.c.memory_type.in_(prefs))
    return clauses


def _score_item(
    item: dict[str, Any],
    *,
    task_type: str,
    symbols: list[str] | None,
    tags: list[str] | None,
    market_scope: str | None,
) -> _ScoredItem:
    score = 0
    reasons: list[str] = []
    item_symbols = _normalize_symbols(_normalize_list(item.get("symbols_json")))
    item_tags = _normalize_tags(_normalize_list(item.get("tags_json")))
    related_symbols = _normalize_symbols(_normalize_list(item.get("related_symbols_json")))

    for symbol in symbols or []:
        symbol_upper = symbol.strip().upper()
        if not symbol_upper:
            continue
        if symbol_upper in item_symbols:
            score += _SCORE_WEIGHTS["symbol_match"]
            reasons.append(f"symbol:{symbol}")
        if symbol_upper in related_symbols:
            score += _SCORE_WEIGHTS["related_symbol_match"]
            reasons.append(f"related_symbol:{symbol}")

    input_tags = _normalize_tags(tags or [])
    for tag in input_tags:
        if tag in item_tags:
            score += _SCORE_WEIGHTS["tag_match"]
            reasons.append(f"tag:{tag}")

    memory_type = item.get("memory_type")
    prefs = _TASK_TYPE_PREFERENCE.get(task_type, [])
    if memory_type in prefs:
        if memory_type == prefs[0]:
            score += _SCORE_WEIGHTS["task_type_preferred"]
        else:
            score += _SCORE_WEIGHTS["task_type_secondary"]
        reasons.append(f"type:{memory_type}")

    if market_scope and item.get("market_scope") == market_scope:
        score += _SCORE_WEIGHTS["market_scope_match"]
        reasons.append("scope_match")

    last_reviewed = item.get("last_reviewed_at")
    if last_reviewed and last_reviewed >= _days_ago(30):
        score += _SCORE_WEIGHTS["recency_bonus"]
        reasons.append("recent")

    evidence_refs = _normalize_list(item.get("evidence_refs_json"))
    if len(evidence_refs) >= 2:
        score += _SCORE_WEIGHTS["evidence_bonus"]
        reasons.append("evidence")

    return _ScoredItem(item=item, score=score, reasons=reasons)


def _heading_path_from_evidence(evidence_refs: list[Any]) -> str | None:
    for ref in evidence_refs:
        if not isinstance(ref, dict):
            continue
        ref_type = ref.get("ref_type")
        if ref_type == "document_section":
            heading_path = ref.get("heading_path")
            if heading_path:
                return str(heading_path)
    return None


def _source_date_from_item(item: dict[str, Any], evidence_refs: list[Any]) -> str | None:
    for ref in evidence_refs:
        if isinstance(ref, dict) and ref.get("source_date"):
            return str(ref["source_date"])
    created_at = item.get("created_at")
    return str(created_at) if created_at else None


def _truncate_memory_fields(
    summary: str | None,
    rule_text: str | None,
    *,
    max_chars_per_memory: int,
) -> tuple[str, str, int]:
    summary_text = str(summary or "")
    rule_text_text = str(rule_text or "")
    summary_out = summary_text[:max_chars_per_memory]
    rule_out = rule_text_text[:max_chars_per_memory]
    return summary_out, rule_out, len(summary_out) + len(rule_out)


def select_context(
    settings: Settings,
    *,
    task_type: str,
    symbols: list[str] | None = None,
    tags: list[str] | None = None,
    market_scope: str | None = None,
    page_context: str | None = None,
    max_memories: int = 5,
    max_chars_per_memory: int = 800,
    max_total_chars: int = 3000,
) -> ContextSelectionResult:
    del page_context  # reserved for v1; does not affect scoring yet

    resolved_task_type = _resolve_task_type(task_type)
    now_iso = utc_now_iso()
    engine = create_sqlite_engine(settings)
    pool_filters = _eligible_pool_filters(now_iso)
    overlap_filters = _build_overlap_filters(
        symbols=symbols,
        tags=tags,
        market_scope=market_scope,
        task_type=resolved_task_type,
    )

    with engine.connect() as conn:
        pool_rows = conn.execute(
            select(memory_items.c.id).where(*pool_filters)
        ).all()
        candidate_stmt = select(memory_items).where(*pool_filters)
        if overlap_filters:
            candidate_stmt = candidate_stmt.where(or_(*overlap_filters))
        candidate_rows = conn.execute(candidate_stmt).mappings().all()

    pool_ids = {str(row[0]) for row in pool_rows}
    items = [_deserialize_row(dict(row)) for row in candidate_rows]
    candidate_ids = {str(item["id"]) for item in items}

    excluded_reasons: dict[str, str] = {
        item_id: "no_overlap"
        for item_id in pool_ids
        if item_id not in candidate_ids
    }
    scored_items: list[_ScoredItem] = []

    for item in items:
        item_id = str(item["id"])
        scored = _score_item(
            item,
            task_type=resolved_task_type,
            symbols=symbols,
            tags=tags,
            market_scope=market_scope,
        )
        if scored.score == 0:
            excluded_reasons[item_id] = "no_relevant_match"
            continue
        scored_items.append(scored)

    scored_items.sort(
        key=lambda entry: (
            entry.score,
            entry.item.get("last_reviewed_at") or "",
        ),
        reverse=True,
    )

    selected: list[ContextMemory] = []
    selected_reasons: dict[str, list[str]] = {}
    total_chars = 0

    for scored in scored_items:
        item_id = str(scored.item["id"])
        if len(selected) >= max_memories:
            excluded_reasons[item_id] = "budget_exceeded"
            continue

        summary_out, rule_out, char_cost = _truncate_memory_fields(
            scored.item.get("summary"),
            scored.item.get("rule_text"),
            max_chars_per_memory=max_chars_per_memory,
        )
        if total_chars + char_cost > max_total_chars:
            excluded_reasons[item_id] = "budget_exceeded"
            continue

        evidence_refs = _normalize_list(scored.item.get("evidence_refs_json"))
        memory = ContextMemory(
            memory_id=item_id,
            memory_type=str(scored.item["memory_type"]),
            title=str(scored.item["title"]),
            summary=summary_out,
            rule_text=rule_out,
            symbols=sorted(_normalize_symbols(_normalize_list(scored.item.get("symbols_json")))),
            confidence=float(scored.item.get("confidence") or 0.0),
            relevance_score=scored.score,
            rank=len(selected) + 1,
            source_date=_source_date_from_item(scored.item, evidence_refs),
            heading_path=_heading_path_from_evidence(evidence_refs),
            evidence_count=len(evidence_refs),
        )
        selected.append(memory)
        selected_reasons[item_id] = scored.reasons
        excluded_reasons.pop(item_id, None)
        total_chars += char_cost

    pool_count = len(pool_ids)
    selected_count = len(selected)
    return ContextSelectionResult(
        memories=selected,
        total_chars=total_chars,
        pool_count=pool_count,
        candidate_count=len(candidate_ids),
        excluded_count=pool_count - selected_count,
        selected_reasons=selected_reasons,
        excluded_reasons=excluded_reasons,
    )
