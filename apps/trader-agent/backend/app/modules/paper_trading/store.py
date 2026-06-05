from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine


def insert_order_intent(engine: Engine, intent: dict[str, Any]) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO paper_order_intents
                (order_intent_id, symbol, market_state_snapshot_id, payload_json, created_at)
                VALUES (:id, :symbol, :mss, :payload, :created)
                """
            ),
            {
                "id": intent["order_intent_id"],
                "symbol": intent["symbol"],
                "mss": intent["market_state_snapshot_id"],
                "payload": json.dumps(intent, ensure_ascii=False),
                "created": intent["created_at"],
            },
        )


def insert_order_event(engine: Engine, event: dict[str, Any]) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO paper_order_events
                (order_event_id, order_intent_id, symbol, payload_json, event_ts)
                VALUES (:id, :intent, :symbol, :payload, :ts)
                """
            ),
            {
                "id": event["order_event_id"],
                "intent": event["order_intent_id"],
                "symbol": event["symbol"],
                "payload": json.dumps(event, ensure_ascii=False),
                "ts": event["event_ts"],
            },
        )


def insert_position_snapshot(engine: Engine, position: dict[str, Any]) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO paper_position_snapshots
                (position_snapshot_id, symbol, payload_json, asof_ts)
                VALUES (:id, :symbol, :payload, :asof)
                """
            ),
            {
                "id": position["position_snapshot_id"],
                "symbol": position["symbol"],
                "payload": json.dumps(position, ensure_ascii=False),
                "asof": position["asof_ts"],
            },
        )


def get_order_intent(engine: Engine, order_intent_id: str) -> dict[str, Any] | None:
    with engine.begin() as conn:
        row = conn.execute(
            text(
                """
                SELECT payload_json FROM paper_order_intents
                WHERE order_intent_id = :id
                """
            ),
            {"id": order_intent_id},
        ).fetchone()
    if row is None:
        return None
    return json.loads(row[0])


def list_order_events(engine: Engine, order_intent_id: str) -> list[dict[str, Any]]:
    with engine.begin() as conn:
        rows = conn.execute(
            text(
                """
                SELECT payload_json FROM paper_order_events
                WHERE order_intent_id = :id
                ORDER BY event_ts
                """
            ),
            {"id": order_intent_id},
        ).fetchall()
    return [json.loads(row[0]) for row in rows]


def get_position(engine: Engine, symbol: str) -> dict[str, Any] | None:
    with engine.begin() as conn:
        row = conn.execute(
            text(
                """
                SELECT payload_json FROM paper_position_snapshots
                WHERE symbol = :symbol
                ORDER BY asof_ts DESC
                LIMIT 1
                """
            ),
            {"symbol": symbol},
        ).fetchone()
    if row is None:
        return None
    return json.loads(row[0])
