from __future__ import annotations

import uuid
from typing import Any, Callable

from app.core.config import Settings
from app.intel.db.schema import init_intel_db
from app.modules.live_market_plane.constants import M2_US_SYMBOLS, SCHEMA_VERSION
from app.modules.live_market_plane.normalize import (
    build_provider_trace,
    quote_snapshot_from_longbridge_row,
)
from app.modules.live_market_plane.readiness import compute_consumer_readiness
from app.modules.live_market_plane.store import (
    get_latest_market_state as load_latest_market_state,
    insert_market_state,
    insert_provider_trace,
    insert_quote_snapshot,
)
from app.tools.local_adapter import normalize_symbol
from app.tools.longbridge_adapter import LongbridgeMarketDataAdapter

Transport = Callable[[str, dict[str, Any]], dict[str, Any] | list[dict[str, Any]]]


class MarketPlaneError(ValueError):
    pass


def build_market_state_from_quote(
    quote: dict[str, Any],
    *,
    source_mode: str,
) -> dict[str, Any]:
    readiness = compute_consumer_readiness(quote=quote, source_mode=source_mode)
    return {
        "schema_version": SCHEMA_VERSION,
        "market_state_snapshot_id": f"mss-{uuid.uuid4().hex[:12]}",
        "symbol": quote["symbol"],
        "market": quote["market"],
        "asof_ts": quote["asof_ts"],
        "received_at": quote["received_at"],
        "provider_trace": quote["provider_trace"],
        "quality_flags": quote.get("quality_flags") or [],
        "quote_snapshot_id": quote["quote_snapshot_id"],
        "last_price": quote.get("last_price"),
        "consumer_readiness": readiness,
    }


def ingest_quote_for_symbol(
    settings: Settings,
    symbol: str,
    *,
    transport: Transport | None = None,
    source_channel: str = "rest",
) -> dict[str, Any]:
    normalized = normalize_symbol(symbol)
    if normalized not in M2_US_SYMBOLS:
        raise MarketPlaneError(
            f"Symbol {normalized} is outside the M2 v0 universe {M2_US_SYMBOLS}"
        )

    engine = init_intel_db(settings)
    if transport is not None:
        row_transport: Transport = transport
        adapter = LongbridgeMarketDataAdapter(settings, transport=row_transport)
        evidence = adapter.get_quote(normalized)
        row = {
            "timestamp": evidence.timestamp,
            **evidence.payload,
        }
        entitlement = "realtime"
    else:
        adapter = LongbridgeMarketDataAdapter(settings, transport=None)
        try:
            evidence = adapter.get_quote(normalized)
            row = {
                "timestamp": evidence.timestamp,
                **evidence.payload,
            }
            entitlement = "realtime"
            source_channel = "rest"
        except Exception:
            raise MarketPlaneError(
                "Longbridge transport is not configured; pass transport= for tests "
                "or enable market_data.longbridge capability."
            ) from None

    trace = build_provider_trace(
        symbol=normalized,
        source_channel=source_channel,
        entitlement_state=entitlement,
    )
    insert_provider_trace(engine, trace)
    quote = quote_snapshot_from_longbridge_row(
        symbol=normalized,
        row=row,
        provider_trace=trace,
        source_channel=source_channel,
    )
    insert_quote_snapshot(engine, quote)
    mode = "replay" if source_channel in {"fixture", "file_replay"} else "live"
    state = build_market_state_from_quote(quote, source_mode=mode)
    insert_market_state(engine, state)
    return state


def get_latest_market_state(settings: Settings, symbol: str) -> dict[str, Any] | None:
    engine = init_intel_db(settings)
    return load_latest_market_state(engine, normalize_symbol(symbol))
