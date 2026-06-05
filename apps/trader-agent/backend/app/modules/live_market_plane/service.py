from __future__ import annotations

import uuid
from typing import Any, Callable

from app.core.config import Settings
from app.intel.db.schema import init_intel_db
from app.modules.live_market_plane.constants import M2_US_SYMBOLS, SCHEMA_VERSION
from app.modules.live_market_plane.normalize import (
    build_provider_trace,
    order_book_snapshot_from_depth_row,
    quote_snapshot_from_longbridge_row,
    trade_tick_from_row,
)
from app.modules.live_market_plane.readiness import compute_consumer_readiness
from app.modules.live_market_plane.store import (
    get_latest_market_state as load_latest_market_state,
    insert_market_state,
    insert_order_book_snapshot,
    insert_provider_trace,
    insert_quote_snapshot,
    insert_trade_tick,
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
    order_book_snapshot_id: str | None = None,
    trade_tick_id: str | None = None,
) -> dict[str, Any]:
    readiness = compute_consumer_readiness(quote=quote, source_mode=source_mode)
    state: dict[str, Any] = {
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
    if order_book_snapshot_id:
        state["order_book_snapshot_id"] = order_book_snapshot_id
    if trade_tick_id:
        state["latest_trade_tick_id"] = trade_tick_id
    return state


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


def persist_websocket_market_row(
    settings: Settings,
    symbol: str,
    row: dict[str, Any],
) -> dict[str, Any]:
    """Persist a merged quote/depth/trade push row as MarketStateSnapshot."""
    return persist_websocket_push(
        settings,
        symbol,
        quote_row=row,
        depth_row=row if row.get("depth_levels") else None,
        trade_row=row if row.get("trade_tape_available") else None,
    )


def persist_websocket_push(
    settings: Settings,
    symbol: str,
    *,
    quote_row: dict[str, Any],
    depth_row: dict[str, Any] | None = None,
    trade_row: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Persist quote + optional depth/trade artifacts and a MarketStateSnapshot."""
    normalized = normalize_symbol(symbol)
    if normalized not in M2_US_SYMBOLS:
        raise MarketPlaneError(
            f"Symbol {normalized} is outside the M2 v0 universe {M2_US_SYMBOLS}"
        )

    merged = dict(quote_row)
    if depth_row:
        merged.update(depth_row)
    if trade_row:
        merged["trade_tape_available"] = True
        if trade_row.get("price") is not None:
            merged["last_done"] = trade_row["price"]
        if trade_row.get("timestamp"):
            merged["timestamp"] = trade_row["timestamp"]

    engine = init_intel_db(settings)
    trace = build_provider_trace(
        symbol=normalized,
        source_channel="websocket",
        entitlement_state="realtime",
    )
    insert_provider_trace(engine, trace)

    quote = quote_snapshot_from_longbridge_row(
        symbol=normalized,
        row=merged,
        provider_trace=trace,
        source_channel="websocket",
    )
    insert_quote_snapshot(engine, quote)

    order_book_id: str | None = None
    if depth_row and depth_row.get("depth_levels"):
        book = order_book_snapshot_from_depth_row(
            symbol=normalized,
            depth_row=depth_row,
            provider_trace=trace,
        )
        insert_order_book_snapshot(engine, book)
        order_book_id = book["order_book_snapshot_id"]

    trade_id: str | None = None
    if trade_row:
        tick = trade_tick_from_row(symbol=normalized, row=trade_row, provider_trace=trace)
        insert_trade_tick(engine, tick)
        trade_id = tick["trade_tick_id"]

    state = build_market_state_from_quote(
        quote,
        source_mode="live",
        order_book_snapshot_id=order_book_id,
        trade_tick_id=trade_id,
    )
    insert_market_state(engine, state)
    return state
