from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from app.modules.live_market_plane.constants import NORMALIZATION_VERSION, SCHEMA_VERSION
from app.modules.live_market_plane.types import DataQualityFlag, ProviderTrace
from app.tools.local_adapter import normalize_symbol


def _utc_now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _market_from_symbol(symbol: str) -> str:
    if symbol.endswith(".US"):
        return "US"
    if symbol.endswith(".HK"):
        return "HK"
    return "UNKNOWN"


def build_provider_trace(
    *,
    symbol: str,
    source_channel: str,
    entitlement_state: str = "unknown",
    raw_ref: str | None = None,
) -> ProviderTrace:
    normalized = normalize_symbol(symbol)
    trace: ProviderTrace = {
        "provider_trace_id": f"ptr-{uuid.uuid4().hex[:12]}",
        "provider": "longbridge",
        "source_channel": source_channel,
        "source_endpoint": "quote",
        "provider_symbol": normalized,
        "normalized_symbol": normalized,
        "market": _market_from_symbol(normalized),
        "received_at": _utc_now_iso(),
        "normalization_version": NORMALIZATION_VERSION,
        "entitlement_state": entitlement_state,
    }
    if raw_ref:
        trace["raw_payload_ref"] = raw_ref
    return trace


def quote_snapshot_from_longbridge_row(
    *,
    symbol: str,
    row: dict[str, Any],
    provider_trace: ProviderTrace,
    source_channel: str,
) -> dict[str, Any]:
    normalized = normalize_symbol(symbol)
    asof_ts = str(row.get("timestamp") or row.get("time") or _utc_now_iso())
    received_at = _utc_now_iso()
    last = float(row.get("last_done") or row.get("last") or row.get("close") or 0)
    bid = row.get("bid")
    ask = row.get("ask")
    quality_flags: list[DataQualityFlag] = []
    if source_channel in {"fixture", "file_replay"}:
        quality_flags.append(
            {
                "flag_code": "non_live_source",
                "severity": "warning",
                "message": "Quote normalized from non-live source; readiness cannot upgrade to live.",
            }
        )
    if not row.get("depth_levels"):
        quality_flags.append(
            {
                "flag_code": "depth_unavailable",
                "severity": "warning",
                "message": "Order book depth not ingested in v0 slice.",
            }
        )
    if not row.get("trade_tape_available"):
        quality_flags.append(
            {
                "flag_code": "trade_tape_unavailable",
                "severity": "warning",
                "message": "Trade tape not ingested in v0 slice.",
            }
        )
    return {
        "schema_version": SCHEMA_VERSION,
        "quote_snapshot_id": f"qs-{uuid.uuid4().hex[:12]}",
        "symbol": normalized,
        "market": _market_from_symbol(normalized),
        "asof_ts": asof_ts,
        "received_at": received_at,
        "provider_trace": provider_trace,
        "quality_flags": quality_flags,
        "last_price": last,
        "bid_price": float(bid) if bid is not None else None,
        "ask_price": float(ask) if ask is not None else None,
        "currency": row.get("currency") or "USD",
        "session": row.get("session") or "regular",
    }


def order_book_snapshot_from_depth_row(
    *,
    symbol: str,
    depth_row: dict[str, Any],
    provider_trace: ProviderTrace,
) -> dict[str, Any]:
    normalized = normalize_symbol(symbol)
    asof_ts = str(depth_row.get("timestamp") or _utc_now_iso())
    return {
        "schema_version": SCHEMA_VERSION,
        "order_book_snapshot_id": f"obs-{uuid.uuid4().hex[:12]}",
        "symbol": normalized,
        "market": _market_from_symbol(normalized),
        "asof_ts": asof_ts,
        "received_at": _utc_now_iso(),
        "provider_trace": provider_trace,
        "quality_flags": [],
        "bids": depth_row.get("bids") or [],
        "asks": depth_row.get("asks") or [],
        "depth_levels": depth_row.get("depth_levels") or [],
    }


def trade_tick_from_row(
    *,
    symbol: str,
    row: dict[str, Any],
    provider_trace: ProviderTrace,
) -> dict[str, Any]:
    normalized = normalize_symbol(symbol)
    asof_ts = str(row.get("timestamp") or _utc_now_iso())
    return {
        "schema_version": SCHEMA_VERSION,
        "trade_tick_id": f"tt-{uuid.uuid4().hex[:12]}",
        "symbol": normalized,
        "market": _market_from_symbol(normalized),
        "asof_ts": asof_ts,
        "received_at": _utc_now_iso(),
        "provider_trace": provider_trace,
        "quality_flags": [],
        "price": row.get("price"),
        "volume": row.get("volume"),
        "aggressor_hint": row.get("aggressor_hint"),
    }
