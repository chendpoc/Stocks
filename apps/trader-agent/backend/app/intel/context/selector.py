from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import text

from app.intel import logger
from app.modules._json import json_array_like_pattern
from app.modules.json_row_codec import coerce_json_value

CONFIDENCE_THRESHOLD = 0.5
SOURCE_TYPE_SCORE = {"postmortem": 10, "seed": 6, "manual": 4}

_SCORE_WEIGHTS = {
    "symbol_match": 30,
    "tag_match": 25,
    "confidence": 20,
    "source_type": 10,
    "recency": 15,
}


def _normalize_list(value: Any) -> list:
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        return coerce_json_value(value, [])
    return []


def _normalize_symbols(values: list[Any]) -> set[str]:
    return {str(value).strip().upper() for value in values if value}


def _normalize_tags(values: list[Any]) -> set[str]:
    return {str(value).strip().lower() for value in values if value}


def _lesson_symbols(row: dict[str, Any]) -> set[str]:
    symbols = _normalize_symbols(_normalize_list(row.get("symbols_json")))
    symbol = row.get("symbol")
    if symbol:
        symbols.add(str(symbol).strip().upper())
    return symbols


def _score_lesson(
    row: dict[str, Any],
    *,
    symbols: list[str] | None,
    tags: list[str] | None,
) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    lesson_symbols = _lesson_symbols(row)
    lesson_tags = _normalize_tags(_normalize_list(row.get("tags_json")))

    for symbol in symbols or []:
        symbol_upper = symbol.strip().upper()
        if not symbol_upper:
            continue
        if symbol_upper in lesson_symbols:
            score += _SCORE_WEIGHTS["symbol_match"]
            reasons.append(f"symbol:{symbol_upper}")

    for tag in _normalize_tags(tags or []):
        if tag in lesson_tags:
            score += _SCORE_WEIGHTS["tag_match"]
            reasons.append(f"tag:{tag}")

    confidence = float(row.get("confidence") or 0.0)
    if confidence >= CONFIDENCE_THRESHOLD:
        score += int(_SCORE_WEIGHTS["confidence"] * confidence)
        reasons.append(f"confidence:{confidence:.2f}")

    source_type = str(row.get("source_type") or "manual")
    score += SOURCE_TYPE_SCORE.get(source_type, 4)
    reasons.append(f"source:{source_type}")

    ts = row.get("ts") or row.get("created_at")
    if ts:
        try:
            lesson_dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
            if lesson_dt.tzinfo is None:
                lesson_dt = lesson_dt.replace(tzinfo=UTC)
            if lesson_dt >= datetime.now(UTC) - timedelta(days=30):
                score += _SCORE_WEIGHTS["recency"]
                reasons.append("recent")
        except ValueError:
            pass

    return score, reasons


def _truncate(text_value: str | None, max_chars: int) -> str:
    value = str(text_value or "")
    return value[:max_chars]


def select_lessons(
    engine,
    *,
    symbols: list[str] | None = None,
    tags: list[str] | None = None,
    max_items: int = 10,
    max_chars_per: int = 600,
    max_total: int = 6000,
) -> list[dict]:
    """Score and rank lessons from market_intel.db for context injection."""
    clauses = ["confidence >= :min_confidence"]
    params: dict[str, Any] = {"min_confidence": CONFIDENCE_THRESHOLD, "fetch_limit": 200}
    symbol_filters: list[str] = []
    for symbol in symbols or []:
        normalized = symbol.strip().upper()
        if not normalized:
            continue
        symbol_filters.append("symbol = :sym_" + normalized)
        params["sym_" + normalized] = normalized
        symbol_filters.append("symbols_json LIKE :pat_" + normalized)
        params["pat_" + normalized] = json_array_like_pattern(normalized)

    if symbol_filters:
        clauses.append("(" + " OR ".join(symbol_filters) + ")")

    where = " AND ".join(clauses)
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                f"""
                SELECT lesson_id, ts, symbol, symbols_json, pattern_id, explanation_type,
                       market_regime, lesson_text, summary, rule_text, tags_json, confidence,
                       source_type, when_to_apply, when_not_to_apply, weight_update, verdict,
                       created_at
                FROM lessons
                WHERE {where}
                ORDER BY ts DESC
                LIMIT :fetch_limit
                """
            ),
            params,
        ).mappings().all()

    pool = [dict(row) for row in rows]
    if not pool and symbols:
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    """
                    SELECT lesson_id, ts, symbol, symbols_json, pattern_id, explanation_type,
                           market_regime, lesson_text, summary, rule_text, tags_json, confidence,
                           source_type, when_to_apply, when_not_to_apply, weight_update, verdict,
                           created_at
                    FROM lessons
                    WHERE confidence >= :min_confidence
                    ORDER BY ts DESC
                    LIMIT :fetch_limit
                    """
                ),
                {"min_confidence": CONFIDENCE_THRESHOLD, "fetch_limit": 200},
            ).mappings().all()
        pool = [dict(row) for row in rows]

    scored: list[tuple[int, list[str], dict]] = []
    for row in pool:
        score, reasons = _score_lesson(row, symbols=symbols, tags=tags)
        if symbols and score == 0:
            continue
        scored.append((score, reasons, row))

    scored.sort(key=lambda entry: (entry[0], entry[2].get("ts") or ""), reverse=True)

    selected: list[dict] = []
    total_chars = 0
    for score, reasons, row in scored:
        if len(selected) >= max_items:
            break
        summary = _truncate(row.get("summary") or row.get("lesson_text"), max_chars_per)
        rule_text = _truncate(row.get("rule_text") or row.get("when_to_apply"), max_chars_per)
        char_cost = len(summary) + len(rule_text)
        if total_chars + char_cost > max_total:
            continue
        selected.append(
            {
                "lesson_id": row["lesson_id"],
                "symbols": sorted(_lesson_symbols(row)),
                "summary": summary,
                "rule_text": rule_text,
                "tags": _normalize_list(row.get("tags_json")),
                "confidence": float(row.get("confidence") or 0.0),
                "source_type": row.get("source_type"),
                "verdict": row.get("verdict"),
                "relevance_score": score,
                "selection_reasons": reasons,
            }
        )
        total_chars += char_cost

    logger.info("select_lessons picked %s items (%s chars)", len(selected), total_chars)
    return selected
