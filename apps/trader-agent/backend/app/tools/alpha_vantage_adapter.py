from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any
from urllib.parse import urlencode
from urllib.request import urlopen

from app.core.config import Settings
from app.tools.evidence import NormalizedEvidence, coerce_scalar, make_evidence
from app.tools.local_adapter import CapabilityDisabledError, normalize_symbol

ALPHA_VANTAGE_MARKET_DATA = "market_data.alpha_vantage"

PROVIDER = "alpha_vantage"
BASE_URL = "https://www.alphavantage.co/query"
LIMITATIONS = [
    "Manual API key is required; free tier can be rate-limited or delayed.",
    "Use as read-only evidence, not as an execution or routing source.",
]

Transport = Callable[[dict[str, Any]], dict[str, Any]]


class AlphaVantageAdapter:
    def __init__(self, settings: Settings, *, transport: Transport | None = None) -> None:
        self.settings = settings
        self.transport = transport

    def get_daily_bars(self, symbol: str) -> list[NormalizedEvidence]:
        self._require_capability()
        api_key = self._require_api_key()
        normalized_symbol = normalize_symbol(symbol)
        params = {
            "function": "TIME_SERIES_DAILY",
            "symbol": normalized_symbol,
            "apikey": api_key,
            "outputsize": "compact",
        }
        raw = self._request(params)
        series = raw.get("Time Series (Daily)")
        if not isinstance(series, dict):
            raise ValueError("Alpha Vantage response is missing daily time series")
        return [
            self._normalize_daily_bar(normalized_symbol, timestamp, values)
            for timestamp, values in sorted(series.items())
        ]

    def _request(self, params: dict[str, Any]) -> dict[str, Any]:
        if self.transport is not None:
            return self.transport(params)
        url = f"{BASE_URL}?{urlencode(params)}"
        with urlopen(url, timeout=20) as response:  # noqa: S310
            return json.loads(response.read().decode("utf-8"))

    def _normalize_daily_bar(
        self,
        symbol: str,
        timestamp: str,
        values: dict[str, Any],
    ) -> NormalizedEvidence:
        payload = {
            "open": coerce_scalar(values.get("1. open")),
            "high": coerce_scalar(values.get("2. high")),
            "low": coerce_scalar(values.get("3. low")),
            "close": coerce_scalar(values.get("4. close")),
            "volume": coerce_scalar(values.get("5. volume")),
        }
        return make_evidence(
            source_type="market_bar",
            provider=PROVIDER,
            symbol=symbol,
            timestamp=timestamp,
            payload=payload,
            confidence="medium",
            limitations=LIMITATIONS,
            freshness="provider_reported",
            cost_category="free_manual_key",
        )

    def _require_capability(self) -> None:
        if ALPHA_VANTAGE_MARKET_DATA not in self.settings.enabled_tool_capabilities:
            raise CapabilityDisabledError(ALPHA_VANTAGE_MARKET_DATA)

    def _require_api_key(self) -> str:
        if not self.settings.alpha_vantage_api_key:
            raise CapabilityDisabledError("alpha_vantage.api_key")
        return self.settings.alpha_vantage_api_key
