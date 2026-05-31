from __future__ import annotations

from uuid import uuid4

from sqlalchemy import text

from app.core.time import utc_now_iso
from app.intel import logger
from app.modules._json import dumps, json_array_like_pattern

_VERDICT_CONFIDENCE = {
    "supported": 0.8,
    "rejected": 0.75,
    "mixed": 0.55,
    "inconclusive": 0.5,
}


def create_lesson_from_outcome(
    engine,
    outcome: dict,
    hypothesis: dict,
) -> dict:
    lesson_id = str(uuid4())
    symbol = outcome.get("symbol") or hypothesis.get("symbol")
    verdict = outcome.get("verdict") or "inconclusive"
    lesson_text = (
        f"Hypothesis: {hypothesis.get('claim', '')}. "
        f"Outcome: {verdict} (return {outcome.get('return_pct', 0):.2f}%). "
        f"Invalidation: {hypothesis.get('invalidation_condition', '')}"
    )
    summary = lesson_text[:200]
    rule_text = hypothesis.get("professional_explanation") or lesson_text[:600]
    row = {
        "lesson_id": lesson_id,
        "ts": utc_now_iso(),
        "symbol": symbol,
        "symbols_json": dumps([symbol] if symbol else []),
        "pattern_id": None,
        "explanation_type": "postmortem",
        "market_regime": None,
        "lesson_text": lesson_text,
        "summary": summary,
        "rule_text": rule_text[:600],
        "tags_json": dumps(["lesson", "postmortem", verdict]),
        "confidence": _VERDICT_CONFIDENCE.get(verdict, 0.5),
        "source_type": "postmortem",
        "when_to_apply": hypothesis.get("professional_explanation"),
        "when_not_to_apply": hypothesis.get("invalidation_condition"),
        "weight_update": None,
        "verdict": verdict,
    }
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO lessons
                (lesson_id, ts, symbol, symbols_json, pattern_id, explanation_type,
                 market_regime, lesson_text, summary, rule_text, tags_json, confidence,
                 source_type, when_to_apply, when_not_to_apply, weight_update, verdict)
                VALUES (:lesson_id, :ts, :symbol, :symbols_json, :pattern_id, :explanation_type,
                        :market_regime, :lesson_text, :summary, :rule_text, :tags_json, :confidence,
                        :source_type, :when_to_apply, :when_not_to_apply, :weight_update, :verdict)
                """
            ),
            row,
        )
    logger.info("Created postmortem lesson %s for %s", lesson_id, symbol)
    return row


def list_lessons(
    engine,
    *,
    symbol: str | None = None,
    limit: int = 20,
) -> list[dict]:
    clauses = ["1=1"]
    params: dict = {"limit": limit}
    if symbol:
        clauses.append("(symbol = :symbol OR symbols_json LIKE :symbol_pattern)")
        params["symbol"] = symbol.upper()
        params["symbol_pattern"] = json_array_like_pattern(symbol.upper())
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
                LIMIT :limit
                """
            ),
            params,
        ).mappings().all()
    return [dict(row) for row in rows]
