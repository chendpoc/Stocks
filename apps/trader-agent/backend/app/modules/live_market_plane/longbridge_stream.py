from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from typing import Any

from app.core.config import Settings
from app.modules.live_market_plane.constants import M2_US_SYMBOLS
from app.modules.live_market_plane.longbridge_config import (
    load_longbridge_config,
    longbridge_credentials_configured,
    longbridge_sdk_available,
)
from app.modules.live_market_plane.push_normalize import (
    push_depth_to_row,
    push_quote_to_row,
    push_trade_to_row,
)
from app.modules.live_market_plane.service import MarketPlaneError, persist_websocket_push

logger = logging.getLogger(__name__)


@dataclass
class SymbolPushCache:
    quote_row: dict[str, Any] | None = None
    depth_row: dict[str, Any] | None = None
    trade_row: dict[str, Any] | None = None
    last_error: str | None = None


@dataclass
class StreamRuntime:
    thread: threading.Thread | None = None
    stop_event: threading.Event = field(default_factory=threading.Event)
    started_at: str | None = None
    symbols: tuple[str, ...] = ()
    push_counts: dict[str, int] = field(default_factory=dict)
    caches: dict[str, SymbolPushCache] = field(default_factory=dict)
    last_error: str | None = None
    account_hint: str = "longbridge_openapi_env"


_RUNTIME = StreamRuntime()
_LOCK = threading.Lock()


def stream_status() -> dict[str, Any]:
    with _LOCK:
        running = _RUNTIME.thread is not None and _RUNTIME.thread.is_alive()
        return {
            "running": running,
            "started_at": _RUNTIME.started_at,
            "symbols": list(_RUNTIME.symbols),
            "push_counts": dict(_RUNTIME.push_counts),
            "last_error": _RUNTIME.last_error,
            "sdk_available": longbridge_sdk_available(),
            "credentials_configured": longbridge_credentials_configured(),
            "account_hint": (
                "Use paper-account Access Token in LONGBRIDGE_ACCESS_TOKEN for 模拟盘; "
                "quote permissions follow App Key, trading permissions follow Token."
            ),
        }


def _flush_symbol(settings: Settings, symbol: str) -> None:
    with _LOCK:
        cache = _RUNTIME.caches.get(symbol)
        if cache is None or cache.quote_row is None:
            return
        quote_row = dict(cache.quote_row)
        depth_row = dict(cache.depth_row) if cache.depth_row else None
        trade_row = dict(cache.trade_row) if cache.trade_row else None
    try:
        persist_websocket_push(
            settings,
            symbol,
            quote_row=quote_row,
            depth_row=depth_row,
            trade_row=trade_row,
        )
        with _LOCK:
            _RUNTIME.push_counts[symbol] = _RUNTIME.push_counts.get(symbol, 0) + 1
    except MarketPlaneError as exc:
        with _LOCK:
            if symbol in _RUNTIME.caches:
                _RUNTIME.caches[symbol].last_error = str(exc)
        logger.warning("market plane push persist failed for %s: %s", symbol, exc)


def _run_stream(settings: Settings, symbols: tuple[str, ...]) -> None:
    from longbridge.openapi import QuoteContext, SubType

    try:
        config = load_longbridge_config()
        ctx = QuoteContext(config)
    except Exception as exc:
        with _LOCK:
            _RUNTIME.last_error = str(exc)
        return

    def on_quote(symbol: str, event: Any) -> None:
        if _RUNTIME.stop_event.is_set():
            return
        row = push_quote_to_row(symbol, event)
        with _LOCK:
            cache = _RUNTIME.caches.setdefault(symbol, SymbolPushCache())
            cache.quote_row = row
        _flush_symbol(settings, symbol)

    def on_depth(symbol: str, event: Any) -> None:
        if _RUNTIME.stop_event.is_set():
            return
        row = push_depth_to_row(event)
        with _LOCK:
            cache = _RUNTIME.caches.setdefault(symbol, SymbolPushCache())
            cache.depth_row = row
            if cache.quote_row is None:
                cache.quote_row = {"timestamp": row["timestamp"], "last_done": 0, "symbol": symbol}
        _flush_symbol(settings, symbol)

    def on_trade(symbol: str, event: Any) -> None:
        if _RUNTIME.stop_event.is_set():
            return
        row = push_trade_to_row(symbol, event)
        with _LOCK:
            cache = _RUNTIME.caches.setdefault(symbol, SymbolPushCache())
            cache.trade_row = row
            if cache.quote_row is None:
                cache.quote_row = {
                    "timestamp": row["timestamp"],
                    "last_done": row.get("price") or 0,
                    "symbol": symbol,
                }
            elif row.get("price"):
                cache.quote_row["last_done"] = row["price"]
                cache.quote_row["timestamp"] = row["timestamp"]
        _flush_symbol(settings, symbol)

    ctx.set_on_quote(on_quote)
    ctx.set_on_depth(on_depth)
    ctx.set_on_trade(on_trade)
    ctx.subscribe(
        list(symbols),
        [SubType.Quote, SubType.Depth, SubType.Trade],
    )
    logger.info("Longbridge quote stream subscribed: %s", symbols)
    while not _RUNTIME.stop_event.is_set():
        _RUNTIME.stop_event.wait(timeout=1.0)


def start_stream(
    settings: Settings,
    *,
    symbols: tuple[str, ...] | None = None,
) -> dict[str, Any]:
    chosen = symbols or M2_US_SYMBOLS
    for symbol in chosen:
        if symbol not in M2_US_SYMBOLS:
            raise MarketPlaneError(f"Symbol {symbol} outside M2 universe {M2_US_SYMBOLS}")

    if not longbridge_sdk_available():
        raise RuntimeError(
            "longbridge SDK not installed; pip install 'trader-agent-core[longbridge]'"
        )
    if not longbridge_credentials_configured():
        raise RuntimeError(
            "Set LONGBRIDGE_APP_KEY, LONGBRIDGE_APP_SECRET, LONGBRIDGE_ACCESS_TOKEN "
            "(模拟盘 Access Token 与实盘不同)"
        )

    with _LOCK:
        if _RUNTIME.thread is not None and _RUNTIME.thread.is_alive():
            return stream_status()

        _RUNTIME.stop_event.clear()
        _RUNTIME.symbols = tuple(chosen)
        _RUNTIME.caches = {s: SymbolPushCache() for s in chosen}
        _RUNTIME.push_counts = {}
        _RUNTIME.last_error = None
        from app.modules.live_market_plane.push_normalize import _utc_now_iso

        _RUNTIME.started_at = _utc_now_iso()

        thread = threading.Thread(
            target=_run_stream,
            args=(settings, _RUNTIME.symbols),
            name="longbridge-market-plane-ws",
            daemon=True,
        )
        _RUNTIME.thread = thread
        thread.start()

    return stream_status()


def stop_stream() -> dict[str, Any]:
    with _LOCK:
        _RUNTIME.stop_event.set()
        thread = _RUNTIME.thread
    if thread is not None:
        thread.join(timeout=5.0)
    with _LOCK:
        _RUNTIME.thread = None
    return stream_status()
