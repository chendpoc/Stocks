from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from app.core.config import Settings
from app.tools.evidence import NormalizedEvidence, make_evidence, within_range
from app.tools.local_adapter import CapabilityDisabledError, FixtureNotFoundError, normalize_symbol

SEC_EDGAR = "sec.edgar"

PROVIDER = "sec.edgar"
LIMITATIONS = [
    "Not legal advice; filing context labels are heuristic.",
    "EDGAR-style local rows may lag accepted live SEC filings.",
]

FilingFetcher = Callable[..., list[dict[str, Any]]]

CONTEXT_FORM_HINTS = {
    "earnings": {"10-Q", "10-K", "8-K"},
    "reduction": {"144", "4"},
    "major_holding": {"SC 13D", "SC 13G", "13F-HR"},
    "litigation": {"8-K", "10-Q", "10-K"},
    "corporate_action": {"8-K", "S-4", "DEF 14A"},
}

CONTEXT_TEXT_HINTS = {
    "earnings": ("earnings", "revenue", "eps", "quarterly", "annual results"),
    "reduction": ("sale", "sell", "sold", "reduction", "insider sale", "disposition"),
    "major_holding": ("beneficial ownership", "major holder", "stake", "13g", "13d"),
    "litigation": ("litigation", "lawsuit", "legal proceeding", "settlement"),
    "corporate_action": ("split", "dividend", "merger", "acquisition", "corporate action"),
}


class SecFilingAdapter:
    def __init__(
        self,
        settings: Settings,
        *,
        local_path: Path | None = None,
        fetcher: FilingFetcher | None = None,
    ) -> None:
        self.settings = settings
        self.fetcher = fetcher
        self.local_path = (
            local_path
            if local_path is not None
            else None
            if fetcher is not None
            else settings.sec_filings_archive_path
        )

    def lookup(
        self,
        symbol: str,
        *,
        contexts: set[str] | None = None,
        start: str | None = None,
        end: str | None = None,
    ) -> list[NormalizedEvidence]:
        self._require_capability()
        normalized_symbol = normalize_symbol(symbol)
        requested_contexts = contexts or set(CONTEXT_FORM_HINTS)
        rows: list[NormalizedEvidence] = []

        for raw in self._load_rows(symbol=normalized_symbol, start=start, end=end):
            row_symbol = normalize_symbol(str(raw.get("symbol", normalized_symbol)))
            if row_symbol != normalized_symbol:
                continue
            timestamp = str(raw["timestamp"])
            if not within_range(timestamp, start, end):
                continue
            validated_contexts = _validated_contexts(raw) & requested_contexts
            if not validated_contexts:
                continue
            payload = _payload_without_shape_fields(raw)
            payload["validated_contexts"] = sorted(validated_contexts)
            rows.append(
                make_evidence(
                    source_type="filing",
                    provider=PROVIDER,
                    symbol=row_symbol,
                    timestamp=timestamp,
                    payload=payload,
                    confidence="medium",
                    limitations=LIMITATIONS,
                    freshness="local_or_injected",
                    cost_category="free_manual",
                )
            )
        return rows

    def _load_rows(
        self,
        *,
        symbol: str,
        start: str | None,
        end: str | None,
    ) -> list[dict[str, Any]]:
        if self.local_path is not None:
            if not self.local_path.exists():
                raise FixtureNotFoundError(self.local_path)
            with self.local_path.open("r", encoding="utf-8") as handle:
                return [json.loads(line) for line in handle if line.strip()]
        if self.fetcher is not None:
            return self.fetcher(symbol=symbol, start=start, end=end)
        raise FixtureNotFoundError(self.settings.sec_filings_archive_path)

    def _require_capability(self) -> None:
        if SEC_EDGAR not in self.settings.enabled_tool_capabilities:
            raise CapabilityDisabledError(SEC_EDGAR)


def _validated_contexts(row: dict[str, Any]) -> set[str]:
    explicit = row.get("context")
    if isinstance(explicit, str) and explicit in CONTEXT_FORM_HINTS:
        return {explicit}
    explicit_many = row.get("contexts")
    if isinstance(explicit_many, list):
        return {str(context) for context in explicit_many if str(context) in CONTEXT_FORM_HINTS}

    form_type = str(row.get("form_type", "")).upper()
    haystack = " ".join(str(row.get(key, "")) for key in ("summary", "title", "description"))
    lower_haystack = haystack.lower()
    contexts: set[str] = set()
    for context, forms in CONTEXT_FORM_HINTS.items():
        form_matches = form_type in forms
        text_matches = any(hint in lower_haystack for hint in CONTEXT_TEXT_HINTS[context])
        if form_matches and text_matches:
            contexts.add(context)
    return contexts


def _payload_without_shape_fields(row: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in row.items() if key not in {"timestamp", "symbol"}}
