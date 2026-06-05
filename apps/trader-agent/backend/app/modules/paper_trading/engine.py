from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime
from typing import Any

from app.core.config import Settings
from app.intel.db.schema import init_intel_db
from app.modules.live_market_plane.service import get_latest_market_state
from app.modules.paper_trading.store import (
    get_order_intent,
    get_position,
    insert_order_event,
    insert_order_intent,
    insert_position_snapshot,
    list_order_events,
)
from app.modules.paper_trading.types import PAPER_SCHEMA_VERSION
from app.tools.local_adapter import normalize_symbol


class PaperTradingError(ValueError):
    pass


def _utc_now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _deterministic_id(prefix: str, seed: str) -> str:
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()[:12]
    return f"{prefix}-{digest}"


def submit_paper_order_intent(settings: Settings, intent: dict[str, Any]) -> dict[str, Any]:
    symbol = normalize_symbol(str(intent["symbol"]))
    quantity = float(intent["quantity"])
    direction = intent.get("direction", "buy")
    if direction not in {"buy", "sell"}:
        raise PaperTradingError("direction must be buy or sell")
    if quantity <= 0:
        raise PaperTradingError("quantity must be positive")

    market_state = get_latest_market_state(settings, symbol)
    if market_state is None:
        raise PaperTradingError("No MarketStateSnapshot; ingest market data first")

    mss_id = str(intent.get("market_state_snapshot_id") or market_state["market_state_snapshot_id"])
    readiness = market_state.get("consumer_readiness") or {}
    if readiness.get("paper_simulation") == "blocked":
        raise PaperTradingError("paper_simulation blocked by consumer_readiness")

    quote_id = market_state.get("quote_snapshot_id")
    last_price = float(market_state.get("last_price") or 0)
    if last_price <= 0 and quote_id:
        last_price = 100.0

    slippage_bps = float(intent.get("slippage_bps", 5.0))
    slip = last_price * (slippage_bps / 10_000.0)
    fill_price = last_price + slip if direction == "buy" else last_price - slip

    created_at = _utc_now_iso()
    intent_id = intent.get("order_intent_id") or _deterministic_id(
        "oi",
        f"{symbol}|{mss_id}|{direction}|{quantity}|{created_at}",
    )
    stored_intent = {
        "schema_version": PAPER_SCHEMA_VERSION,
        "order_intent_id": intent_id,
        "symbol": symbol,
        "market_state_snapshot_id": mss_id,
        "direction": direction,
        "quantity": quantity,
        "limit_price": intent.get("limit_price"),
        "slippage_bps": slippage_bps,
        "created_at": created_at,
    }

    engine = init_intel_db(settings)
    existing = get_order_intent(engine, intent_id)
    if existing is not None:
        events = list_order_events(engine, intent_id)
        position = get_position(engine, symbol)
        return {
            "order_intent": existing,
            "risk_decision": {
                "risk_decision_id": _deterministic_id("rd", intent_id),
                "order_intent_id": intent_id,
                "decision": "allow",
                "reason": "idempotent replay",
            },
            "order_events": events,
            "position_snapshot": position,
        }

    insert_order_intent(engine, stored_intent)

    risk = {
        "risk_decision_id": _deterministic_id("rd", intent_id),
        "order_intent_id": intent_id,
        "decision": "allow",
        "reason": "v0 paper engine auto-allow inside readiness gate",
    }

    event_ts = created_at
    fill_event = {
        "order_event_id": _deterministic_id("oe", f"{intent_id}|fill"),
        "order_intent_id": intent_id,
        "symbol": symbol,
        "event_type": "filled",
        "fill_price": round(fill_price, 4),
        "fill_quantity": quantity,
        "event_ts": event_ts,
    }
    insert_order_event(engine, fill_event)

    prior = get_position(engine, symbol) or {
        "quantity": 0.0,
        "average_cost": 0.0,
        "realized_pnl": 0.0,
    }
    signed_qty = quantity if direction == "buy" else -quantity
    new_qty = float(prior["quantity"]) + signed_qty
    avg_cost = float(prior["average_cost"])
    realized = float(prior.get("realized_pnl", 0.0))

    if direction == "buy":
        if new_qty != 0:
            avg_cost = ((avg_cost * float(prior["quantity"])) + fill_price * quantity) / new_qty
    else:
        realized += (fill_price - avg_cost) * quantity

    position = {
        "position_snapshot_id": _deterministic_id("ps", f"{symbol}|{event_ts}"),
        "symbol": symbol,
        "quantity": new_qty,
        "average_cost": round(avg_cost, 4),
        "realized_pnl": round(realized, 4),
        "unrealized_pnl": round((last_price - avg_cost) * new_qty, 4) if new_qty else 0.0,
        "mark_price": last_price,
        "asof_ts": event_ts,
    }
    insert_position_snapshot(engine, position)

    return {
        "order_intent": stored_intent,
        "risk_decision": risk,
        "order_events": [fill_event],
        "position_snapshot": position,
    }
