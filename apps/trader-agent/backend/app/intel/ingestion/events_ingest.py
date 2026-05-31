from __future__ import annotations

import json
import urllib.error
import urllib.request
from uuid import uuid4

from sqlalchemy import text

from app.core.time import utc_now_iso
from app.intel import logger
from app.modules._json import dumps, json_array_like_pattern


def create_event(
    engine,
    *,
    ts: str,
    event_type: str,
    title: str,
    raw_text: str,
    actor: str | None = None,
    affected_symbols: list[str] | None = None,
    source: str = "manual",
    source_type: str | None = None,
    confidence: float = 0.5,
    url: str | None = None,
) -> dict:
    event_id = str(uuid4())
    symbols_json = dumps(affected_symbols or [])
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO events
                (event_id, ts, event_type, actor, title, raw_text, source, source_type,
                 affected_symbols, confidence, url)
                VALUES (:event_id, :ts, :event_type, :actor, :title, :raw_text, :source,
                        :source_type, :affected_symbols, :confidence, :url)
                """
            ),
            {
                "event_id": event_id,
                "ts": ts,
                "event_type": event_type,
                "actor": actor,
                "title": title,
                "raw_text": raw_text,
                "source": source,
                "source_type": source_type,
                "affected_symbols": symbols_json,
                "confidence": confidence,
                "url": url,
            },
        )
    return {
        "event_id": event_id,
        "ts": ts,
        "event_type": event_type,
        "title": title,
        "affected_symbols": affected_symbols or [],
    }


def list_events(
    engine,
    *,
    symbol: str | None = None,
    days: int = 7,
    limit: int = 20,
) -> list[dict]:
    params: dict = {"limit": limit}
    symbol_filter = ""
    if symbol:
        symbol_filter = "AND affected_symbols LIKE :symbol_pattern"
        params["symbol_pattern"] = json_array_like_pattern(symbol.upper())

    with engine.connect() as conn:
        rows = conn.execute(
            text(
                f"""
                SELECT event_id, ts, event_type, actor, title, raw_text, source,
                       source_type, affected_symbols, confidence, url, created_at
                FROM events
                WHERE datetime(ts) >= datetime('now', '-{int(days)} days')
                {symbol_filter}
                ORDER BY ts DESC
                LIMIT :limit
                """
            ),
            params,
        ).mappings().all()
    result = []
    for row in rows:
        item = dict(row)
        item["affected_symbols"] = json.loads(item["affected_symbols"] or "[]")
        result.append(item)
    return result


def fetch_ark_trades(symbol: str | None = None) -> list[dict]:
    url = "https://arkfunds.io/api/v2/etf/trades"
    try:
        with urllib.request.urlopen(url, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("ARK trades fetch failed: %s", exc)
        return []

    trades: list[dict] = []
    for entry in payload if isinstance(payload, list) else payload.get("trades", []):
        sym = str(entry.get("ticker") or entry.get("symbol") or "").upper()
        if symbol and sym != symbol.upper():
            continue
        trades.append(
            {
                "ts": entry.get("date") or entry.get("ts") or utc_now_iso(),
                "actor": "ARK",
                "action_type": entry.get("direction") or entry.get("action") or "trade",
                "symbol": sym,
                "quantity": entry.get("shares") or entry.get("quantity"),
                "value_estimate": entry.get("value") or entry.get("market_value"),
                "source": "arkfunds.io",
                "delay_type": "T+1",
            }
        )
    return trades


def ingest_ark_trades(engine, symbol: str | None = None) -> int:
    trades = fetch_ark_trades(symbol)
    if not trades:
        return 0
    inserted = 0
    with engine.begin() as conn:
        for trade in trades:
            if not trade.get("symbol"):
                continue
            result = conn.execute(
                text(
                    """
                    INSERT INTO smart_money_actions
                    (ts, actor, action_type, symbol, quantity, value_estimate, source, delay_type)
                    VALUES (:ts, :actor, :action_type, :symbol, :quantity, :value_estimate,
                            :source, :delay_type)
                    """
                ),
                trade,
            )
            inserted += result.rowcount or 0
    logger.info("Ingested %s ARK trades", inserted)
    return inserted
