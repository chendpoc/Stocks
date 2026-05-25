from __future__ import annotations

import importlib
from collections.abc import Callable, Iterable
from typing import Any

from app.core.config import Settings
from app.tools.evidence import NormalizedEvidence, coerce_scalar, make_evidence
from app.tools.local_adapter import CapabilityDisabledError, normalize_symbol

YFINANCE_MARKET_DATA = "market_data.yfinance"

PROVIDER = "yfinance"
LIMITATIONS = [
    "Provider data may be delayed, adjusted, or unavailable for some intervals.",
    "Use as read-only evidence, not as an execution or routing source.",
]

HistoryProvider = Callable[..., Iterable[dict[str, Any]]]


class YFinanceAdapter:
    def __init__(
        self,
        settings: Settings,
        *,
        history_provider: HistoryProvider | None = None,
    ) -> None:
        self.settings = settings
        self.history_provider = history_provider

    def get_daily_bars(
        self,
        symbol: str,
        start: str | None = None,
        end: str | None = None,
        interval: str = "1d",
    ) -> list[NormalizedEvidence]:
        self._require_capability()
        normalized_symbol = normalize_symbol(symbol)
        rows = self._history_rows(
            symbol=normalized_symbol,
            start=start,
            end=end,
            interval=interval,
        )
        return [
            make_evidence(
                source_type="market_bar",
                provider=PROVIDER,
                symbol=normalized_symbol,
                timestamp=_extract_timestamp(row),
                payload=_market_payload(row),
                confidence="medium",
                limitations=LIMITATIONS,
                freshness="provider_reported",
                cost_category="free_manual",
            )
            for row in rows
        ]

    def _history_rows(self, **kwargs: Any) -> Iterable[dict[str, Any]]:
        if self.history_provider is not None:
            return self.history_provider(**kwargs)

        yf = importlib.import_module("yfinance")
        ticker = yf.Ticker(kwargs["symbol"])
        frame = ticker.history(
            start=kwargs.get("start"),
            end=kwargs.get("end"),
            interval=kwargs.get("interval", "1d"),
        )
        if frame.empty:
            return []
        rows = frame.reset_index().to_dict("records")
        return rows

    def _require_capability(self) -> None:
        if YFINANCE_MARKET_DATA not in self.settings.enabled_tool_capabilities:
            raise CapabilityDisabledError(YFINANCE_MARKET_DATA)


def _extract_timestamp(row: dict[str, Any]) -> str:
    for key in ("timestamp", "Datetime", "Date"):
        value = row.get(key)
        if value is not None:
            return str(value)
    raise ValueError("Missing yfinance row timestamp")


def _market_payload(row: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for key, value in row.items():
        normalized_key = key.lower().replace(" ", "_")
        if normalized_key in {"timestamp", "date", "datetime"}:
            continue
        payload[normalized_key] = coerce_scalar(value)
    return payload
