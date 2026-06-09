from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.modules.live_market_plane.longbridge_config import (
    load_longbridge_config,
    longbridge_credentials_configured,
    longbridge_sdk_available,
)
from app.modules.live_market_plane.push_normalize import (
    _sequence_to_ts,
    push_object_to_dict,
)
Transport = Callable[[str, dict[str, Any]], dict[str, Any] | list[dict[str, Any]]]


def longbridge_rest_transport_available() -> bool:
    return longbridge_sdk_available() and longbridge_credentials_configured()


def build_longbridge_rest_transport() -> Transport:
    if not longbridge_rest_transport_available():
        raise RuntimeError(
            "Longbridge REST transport unavailable; install SDK and set "
            "LONGBRIDGE_APP_KEY, LONGBRIDGE_APP_SECRET, LONGBRIDGE_ACCESS_TOKEN"
        )

    def transport(
        endpoint: str,
        params: dict[str, Any],
    ) -> dict[str, Any] | list[dict[str, Any]]:
        from longbridge.openapi import AdjustType, Period, QuoteContext

        symbol = str(params["symbol"])
        ctx = QuoteContext(load_longbridge_config())

        if endpoint == "quote":
            rows = ctx.quote([symbol])
            if not rows:
                raise ValueError(f"No Longbridge quote returned for {symbol}")
            payload = push_object_to_dict(rows[0])
            if "timestamp" not in payload and "time" not in payload:
                sequence = payload.get("sequence")
                payload["timestamp"] = _sequence_to_ts(
                    sequence if isinstance(sequence, int) else None
                )
            payload.setdefault("symbol", symbol)
            return payload

        if endpoint == "candlesticks":
            period_key = str(params.get("period", "1d"))
            period = _map_candlestick_period(period_key, Period)
            rows = ctx.candlesticks(
                symbol,
                period,
                100,
                AdjustType.NoAdjust,
            )
            normalized: list[dict[str, Any]] = []
            for row in rows:
                payload = push_object_to_dict(row)
                if "timestamp" not in payload and "time" not in payload:
                    sequence = payload.get("sequence") or payload.get("timestamp")
                    if isinstance(sequence, int):
                        payload["timestamp"] = _sequence_to_ts(sequence)
                payload.setdefault("symbol", symbol)
                normalized.append(payload)
            return normalized

        raise ValueError(f"Unsupported Longbridge REST endpoint: {endpoint}")

    return transport


def _map_candlestick_period(period_key: str, period_enum: Any) -> Any:
    mapping = {
        "1m": "Min_1",
        "5m": "Min_5",
        "15m": "Min_15",
        "30m": "Min_30",
        "1h": "Min_60",
        "1d": "Day",
        "1w": "Week",
        "1mo": "Month",
        "1M": "Month",
    }
    attr = mapping.get(period_key, "Day")
    if hasattr(period_enum, attr):
        return getattr(period_enum, attr)
    return getattr(period_enum, "Day")
