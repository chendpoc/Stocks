from __future__ import annotations

from app.core.config import Settings
from app.core.events import record_agent_event
from app.core.time import utc_now_iso
from app.db.models import memory_items
from app.db.session import create_sqlite_engine
from app.modules.json_row_codec import coerce_json_value

_BULLISH_KEYWORDS = frozenset(
    {"buy", "long", "做多", "bull", "bullish", "call", "above", "breakout", "long-only"}
)
_BEARISH_KEYWORDS = frozenset(
    {"sell", "short", "做空", "bear", "bearish", "put", "below", "breakdown", "short-only"}
)


def _normalize_symbols(symbols: list[str] | str | None) -> set[str]:
    if isinstance(symbols, str):
        symbols = coerce_json_value(symbols, [])
    return {symbol.upper() for symbol in (symbols or []) if symbol}


def _normalize_tags(tags: list[str] | str | None) -> set[str]:
    if isinstance(tags, str):
        tags = coerce_json_value(tags, [])
    return {tag.strip().lower() for tag in (tags or []) if tag}


def _text_blob(item: dict) -> str:
    parts = [
        item.get("rule_text") or "",
        item.get("summary") or "",
        item.get("title") or "",
        item.get("invalidation") or "",
    ]
    return " ".join(parts).lower()


def _has_opposite_direction(left: dict, right: dict) -> bool:
    left_text = _text_blob(left)
    right_text = _text_blob(right)
    left_bull = any(keyword in left_text for keyword in _BULLISH_KEYWORDS)
    left_bear = any(keyword in left_text for keyword in _BEARISH_KEYWORDS)
    right_bull = any(keyword in right_text for keyword in _BULLISH_KEYWORDS)
    right_bear = any(keyword in right_text for keyword in _BEARISH_KEYWORDS)
    return (left_bull and right_bear) or (left_bear and right_bull)


def _has_contradictory_invalidation(left: dict, right: dict) -> bool:
    left_inv = (left.get("invalidation") or "").lower()
    right_inv = (right.get("invalidation") or "").lower()
    if not left_inv or not right_inv:
        return False
    left_bull = any(keyword in left_inv for keyword in _BULLISH_KEYWORDS)
    left_bear = any(keyword in left_inv for keyword in _BEARISH_KEYWORDS)
    right_bull = any(keyword in right_inv for keyword in _BULLISH_KEYWORDS)
    right_bear = any(keyword in right_inv for keyword in _BEARISH_KEYWORDS)
    return (left_bull and right_bear) or (left_bear and right_bull)


def _items_conflict(item: dict, existing: dict) -> bool:
    item_symbols = _normalize_symbols(item.get("symbols_json"))
    existing_symbols = _normalize_symbols(existing.get("symbols_json"))
    if not item_symbols or not existing_symbols or not (item_symbols & existing_symbols):
        return False

    item_tags = _normalize_tags(item.get("tags_json"))
    existing_tags = _normalize_tags(existing.get("tags_json"))
    tag_overlap = bool(item_tags & existing_tags)
    same_scope = (
        item.get("market_scope")
        and existing.get("market_scope")
        and item.get("market_scope") == existing.get("market_scope")
    )
    if not tag_overlap and not same_scope:
        return False

    return _has_opposite_direction(item, existing) or _has_contradictory_invalidation(
        item, existing
    )


def detect_conflict(item: dict, existing_items: list[dict]) -> bool:
    """Check if item conflicts with any existing active memory."""
    return bool(find_conflicts(item, existing_items))


def find_conflicts(item: dict, existing_items: list[dict]) -> list[str]:
    """Return IDs of existing active memory items that conflict with item."""
    conflicts: list[str] = []
    for existing in existing_items:
        if existing.get("status") != "active":
            continue
        if _items_conflict(item, existing):
            existing_id = existing.get("id")
            if existing_id:
                conflicts.append(str(existing_id))
    return conflicts


def mark_conflict(
    settings: Settings,
    item_id: str,
    conflicting_item_id: str,
) -> None:
    """Mark both items as conflicted, write audit events."""
    engine = create_sqlite_engine(settings)
    now = utc_now_iso()
    with engine.begin() as conn:
        for memory_id in (item_id, conflicting_item_id):
            conn.execute(
                memory_items.update()
                .where(memory_items.c.id == memory_id)
                .values(status="conflicted", updated_at=now, updated_by="human")
            )

    for memory_id in (item_id, conflicting_item_id):
        record_agent_event(
            settings,
            event_type="memory_conflict_marked",
            status="completed",
            input_summary={
                "memory_item_id": memory_id,
                "conflicting_item_id": (
                    conflicting_item_id if memory_id == item_id else item_id
                ),
            },
        )
