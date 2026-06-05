from __future__ import annotations

from datetime import UTC, datetime
from typing import Any


def _utc_now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _sequence_to_ts(sequence: int | None) -> str:
    if sequence and sequence > 0:
        micros = sequence // 1000 if sequence > 10_000_000_000_000 else sequence * 1000
        return datetime.fromtimestamp(micros / 1_000_000, tz=UTC).replace(microsecond=0).isoformat().replace(
            "+00:00", "Z"
        )
    return _utc_now_iso()


def push_object_to_dict(event: Any) -> dict[str, Any]:
    if isinstance(event, dict):
        return dict(event)
    if hasattr(event, "model_dump"):
        return event.model_dump()
    if hasattr(event, "__dict__"):
        return {k: v for k, v in vars(event).items() if not k.startswith("_")}
    return {"value": str(event)}


def push_quote_to_row(symbol: str, event: Any) -> dict[str, Any]:
    payload = push_object_to_dict(event)
    sequence = payload.get("sequence")
    last = payload.get("last_done") or payload.get("last") or payload.get("price")
    return {
        "timestamp": _sequence_to_ts(sequence if isinstance(sequence, int) else None),
        "last_done": last,
        "bid": payload.get("bid") or payload.get("bid_price"),
        "ask": payload.get("ask") or payload.get("ask_price"),
        "volume": payload.get("volume"),
        "symbol": symbol,
    }


def push_depth_to_row(event: Any) -> dict[str, Any]:
    payload = push_object_to_dict(event)
    bids = payload.get("bid") or payload.get("bids") or []
    asks = payload.get("ask") or payload.get("asks") or []
    levels: list[dict[str, Any]] = []
    for level in bids:
        levels.append({"side": "bid", **push_object_to_dict(level)})
    for level in asks:
        levels.append({"side": "ask", **push_object_to_dict(level)})
    sequence = payload.get("sequence")
    return {
        "timestamp": _sequence_to_ts(sequence if isinstance(sequence, int) else None),
        "depth_levels": levels,
        "bids": bids,
        "asks": asks,
    }


def push_trade_to_row(symbol: str, event: Any) -> dict[str, Any]:
    payload = push_object_to_dict(event)
    sequence = payload.get("sequence") or payload.get("timestamp")
    ts = _sequence_to_ts(sequence if isinstance(sequence, int) else None)
    return {
        "timestamp": ts,
        "price": payload.get("price"),
        "volume": payload.get("volume"),
        "aggressor_hint": payload.get("direction") or payload.get("trade_direction"),
        "symbol": symbol,
        "trade_tape_available": True,
    }
