from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.core.config import Settings
from app.tools.evidence import NormalizedEvidence, coerce_scalar, make_evidence
from app.tools.local_adapter import CapabilityDisabledError, normalize_symbol

LONGBRIDGE_MARKET_DATA = "market_data.longbridge"

PROVIDER = "longbridge.market_data"
LIMITATIONS = [
    "Market data only; broker, account, order, and simulation capabilities are not exposed.",
    "Provider data may be delayed or subject to vendor entitlement limits.",
]

Transport = Callable[[str, dict[str, Any]], dict[str, Any] | list[dict[str, Any]]]


class LongbridgeMarketDataAdapter:
    def __init__(self, settings: Settings, *, transport: Transport | None = None) -> None:
        self.settings = settings
        self.transport = transport

    def get_quote(self, symbol: str) -> NormalizedEvidence:
        self._require_capability()
        normalized_symbol = normalize_symbol(symbol)
        raw = self._request("quote", {"symbol": normalized_symbol})
        if not isinstance(raw, dict):
            raise ValueError("Longbridge quote transport must return one object")
        return self._normalize_market_row(normalized_symbol, raw, evidence_kind="quote")

    def get_candlesticks(self, symbol: str, *, period: str = "1d") -> list[NormalizedEvidence]:
        self._require_capability()
        normalized_symbol = normalize_symbol(symbol)
        raw = self._request("candlesticks", {"symbol": normalized_symbol, "period": period})
        if not isinstance(raw, list):
            raise ValueError("Longbridge candlestick transport must return a list")
        return [
            self._normalize_market_row(normalized_symbol, row, evidence_kind="candlestick")
            for row in raw
        ]

    def _request(
        self,
        endpoint: str,
        params: dict[str, Any],
    ) -> dict[str, Any] | list[dict[str, Any]]:
        if self.transport is None:
            raise RuntimeError("Longbridge market data transport is not configured")
        return self.transport(endpoint, params)

    def _normalize_market_row(
        self,
        symbol: str,
        row: dict[str, Any],
        *,
        evidence_kind: str,
    ) -> NormalizedEvidence:
        timestamp = str(row.get("timestamp") or row.get("time"))
        if timestamp == "None":
            raise ValueError("Longbridge market data row is missing timestamp")
        payload = {
            key: coerce_scalar(value)
            for key, value in row.items()
            if key not in {"timestamp", "time", "symbol"}
        }
        payload["evidence_kind"] = evidence_kind
        return make_evidence(
            source_type="market_bar",
            provider=PROVIDER,
            symbol=symbol,
            timestamp=timestamp,
            payload=payload,
            confidence="medium",
            limitations=LIMITATIONS,
            freshness="provider_reported",
            cost_category="manual_entitlement",
        )

    def _require_capability(self) -> None:
        if LONGBRIDGE_MARKET_DATA not in self.settings.enabled_tool_capabilities:
            raise CapabilityDisabledError(LONGBRIDGE_MARKET_DATA)
