from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.config import Settings
from app.tools.evidence import NormalizedEvidence, make_evidence, within_range
from app.tools.local_adapter import CapabilityDisabledError, FixtureNotFoundError, normalize_symbol

NEWS_ARCHIVE_LOCAL = "news_archive.local"

PROVIDER = "local.news_archive"
LIMITATIONS = ["Local archive may lag source publication updates."]

EVENT_TYPE_KEYWORDS = {
    "macro": ("fed", "cpi", "inflation", "rate-cut", "rates", "jobs", "payroll"),
    "earnings": ("earnings", "guidance", "revenue", "eps", "quarterly results"),
    "filing": ("files", "filing", "8-k", "10-q", "10-k", "13g", "13d", "form"),
    "geopolitical": ("geopolitical", "export restriction", "sanction", "tariff", "war"),
    "sector": ("sector", "industry", "semiconductor", "energy", "financials", "crude oil"),
    "options_market": ("option", "options", "expiry", "gamma", "dealer hedging"),
    "crypto_beta": ("bitcoin", "crypto", "btc", "ethereum", "coinbase"),
}


class NewsArchiveAdapter:
    def __init__(self, settings: Settings, *, archive_path: Path | None = None) -> None:
        self.settings = settings
        self.archive_path = archive_path or settings.news_archive_path

    def lookup(
        self,
        symbol: str,
        start: str | None = None,
        end: str | None = None,
        event_types: set[str] | None = None,
    ) -> list[NormalizedEvidence]:
        self._require_capability()
        normalized_symbol = "*" if symbol.strip() == "*" else normalize_symbol(symbol)
        rows: list[NormalizedEvidence] = []

        with self._archive_path().open("r", encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                raw = json.loads(line)
                row_symbol = str(raw.get("symbol", "*")).upper()
                if normalized_symbol != "*" and row_symbol != normalized_symbol:
                    continue
                timestamp = str(raw["timestamp"])
                if not within_range(timestamp, start, end):
                    continue
                event_type = _classify_event_type(raw)
                if event_types is not None and event_type not in event_types:
                    continue
                payload = _payload_without_shape_fields(raw)
                payload["event_type"] = event_type
                rows.append(
                    make_evidence(
                        source_type="news",
                        provider=PROVIDER,
                        symbol=row_symbol,
                        timestamp=timestamp,
                        payload=payload,
                        confidence="medium",
                        limitations=LIMITATIONS,
                        freshness="local_archive",
                        cost_category="free_local",
                    )
                )
        return rows

    def _archive_path(self) -> Path:
        if not self.archive_path.exists():
            raise FixtureNotFoundError(self.archive_path)
        return self.archive_path

    def _require_capability(self) -> None:
        if NEWS_ARCHIVE_LOCAL not in self.settings.enabled_tool_capabilities:
            raise CapabilityDisabledError(NEWS_ARCHIVE_LOCAL)


def _classify_event_type(row: dict[str, Any]) -> str:
    explicit = row.get("event_type")
    if isinstance(explicit, str) and explicit:
        return explicit

    haystack = " ".join(
        str(row.get(key, ""))
        for key in ("headline", "summary", "title", "body", "source")
    ).lower()
    for event_type, keywords in EVENT_TYPE_KEYWORDS.items():
        if any(keyword in haystack for keyword in keywords):
            return event_type
    return "company_specific"


def _payload_without_shape_fields(row: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in row.items() if key not in {"timestamp", "symbol"}}
