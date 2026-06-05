from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.intel.db.connection import get_intel_engine


def _insert_json(
    engine: Engine,
    *,
    table: str,
    id_column: str,
    artifact_id: str,
    symbol: str,
    market: str,
    asof_ts: str,
    received_at: str,
    payload: dict[str, Any],
) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                INSERT INTO {table}
                ({id_column}, symbol, market, asof_ts, received_at, payload_json)
                VALUES (:id, :symbol, :market, :asof, :received, :payload)
                """
            ),
            {
                "id": artifact_id,
                "symbol": symbol,
                "market": market,
                "asof": asof_ts,
                "received": received_at,
                "payload": json.dumps(payload, ensure_ascii=False),
            },
        )


def insert_provider_trace(engine: Engine, payload: dict[str, Any]) -> None:
    trace_id = payload["provider_trace_id"]
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO m2_provider_traces
                (provider_trace_id, symbol, market, received_at, payload_json)
                VALUES (:id, :symbol, :market, :received, :payload)
                """
            ),
            {
                "id": trace_id,
                "symbol": payload["normalized_symbol"],
                "market": payload["market"],
                "received": payload["received_at"],
                "payload": json.dumps(payload, ensure_ascii=False),
            },
        )


def insert_quote_snapshot(engine: Engine, quote: dict[str, Any]) -> None:
    _insert_json(
        engine,
        table="m2_quote_snapshots",
        id_column="quote_snapshot_id",
        artifact_id=quote["quote_snapshot_id"],
        symbol=quote["symbol"],
        market=quote["market"],
        asof_ts=quote["asof_ts"],
        received_at=quote["received_at"],
        payload=quote,
    )


def insert_market_state(engine: Engine, state: dict[str, Any]) -> None:
    _insert_json(
        engine,
        table="m2_market_state_snapshots",
        id_column="market_state_snapshot_id",
        artifact_id=state["market_state_snapshot_id"],
        symbol=state["symbol"],
        market=state["market"],
        asof_ts=state["asof_ts"],
        received_at=state["received_at"],
        payload=state,
    )


def get_latest_market_state(engine: Engine, symbol: str) -> dict[str, Any] | None:
    with engine.begin() as conn:
        row = conn.execute(
            text(
                """
                SELECT payload_json FROM m2_market_state_snapshots
                WHERE symbol = :symbol
                ORDER BY asof_ts DESC, received_at DESC
                LIMIT 1
                """
            ),
            {"symbol": symbol},
        ).fetchone()
    if row is None:
        return None
    return json.loads(row[0])
