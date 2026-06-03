from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import text

from app.core.time import utc_now_iso
from app.intel import logger
from app.modules.json_row_codec import serialize_json_field

TRADE_IDEA_STATUSES = [
    "no_trade",
    "watchlist",
    "setup_forming",
    "trade_candidate",
    "invalidated",
    "closed",
]


def generate_trade_idea_from_hypothesis(engine, hypothesis: dict) -> dict | None:
    tradability = hypothesis.get("tradability", "no_trade")
    if tradability == "no_trade":
        return None

    symbol = hypothesis["symbol"]
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    with engine.connect() as conn:
        existing = conn.execute(
            text(
                """
                SELECT trade_idea_id, trigger_conditions, invalidation_conditions
                FROM trade_ideas
                WHERE symbol = :symbol AND date(ts) = :today
                ORDER BY ts DESC LIMIT 1
                """
            ),
            {"symbol": symbol, "today": today},
        ).mappings().fetchone()

    status_map = {
        "watchlist": "watchlist",
        "setup_forming": "setup_forming",
        "trade_candidate": "trade_candidate",
    }
    status = status_map.get(tradability, "watchlist")
    trigger = hypothesis.get("invalidation_condition", "")
    thesis = hypothesis.get("claim", "")

    if existing:
        merged_trigger = existing["trigger_conditions"] or ""
        if trigger and trigger not in merged_trigger:
            merged_trigger = f"{merged_trigger}; {trigger}".strip("; ")
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    UPDATE trade_ideas
                    SET trigger_conditions = :trigger, thesis = :thesis, status = :status,
                        confidence = :confidence
                    WHERE trade_idea_id = :trade_idea_id
                    """
                ),
                {
                    "trigger": merged_trigger,
                    "thesis": thesis,
                    "status": status,
                    "confidence": hypothesis.get("confidence", 0.5),
                    "trade_idea_id": existing["trade_idea_id"],
                },
            )
        return {"trade_idea_id": existing["trade_idea_id"], "merged": True}

    trade_idea_id = str(uuid4())
    row = {
        "trade_idea_id": trade_idea_id,
        "ts": utc_now_iso(),
        "symbol": symbol,
        "direction": "long" if "跌" not in thesis else "neutral",
        "setup_type": hypothesis.get("signal_id", "hypothesis"),
        "status": status,
        "thesis": thesis,
        "trigger_conditions": trigger,
        "invalidation_conditions": hypothesis.get("invalidation_condition"),
        "suggested_structure": None,
        "risk_notes": serialize_json_field(hypothesis.get("audit_warnings") or []),
        "confidence": hypothesis.get("confidence", 0.5),
        "hypothesis_id": hypothesis.get("hypothesis_id"),
    }
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO trade_ideas
                (trade_idea_id, ts, symbol, direction, setup_type, status, thesis,
                 trigger_conditions, invalidation_conditions, suggested_structure,
                 risk_notes, confidence, hypothesis_id)
                VALUES (:trade_idea_id, :ts, :symbol, :direction, :setup_type, :status,
                        :thesis, :trigger_conditions, :invalidation_conditions,
                        :suggested_structure, :risk_notes, :confidence, :hypothesis_id)
                """
            ),
            row,
        )
    logger.info("Created trade idea %s for %s", trade_idea_id, symbol)
    return row


def list_trade_ideas(
    engine,
    *,
    symbol: str | None = None,
    status: str | None = None,
    limit: int = 20,
) -> list[dict]:
    clauses = ["1=1"]
    params: dict = {"limit": limit}
    if symbol:
        clauses.append("symbol = :symbol")
        params["symbol"] = symbol.upper()
    if status:
        clauses.append("status = :status")
        params["status"] = status
    where = " AND ".join(clauses)
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                f"""
                SELECT * FROM trade_ideas
                WHERE {where}
                ORDER BY ts DESC
                LIMIT :limit
                """
            ),
            params,
        ).mappings().all()
    return [dict(row) for row in rows]
