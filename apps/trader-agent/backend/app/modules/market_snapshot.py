from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.rulepack.loader import load_rulepack
from app.tools.local_adapter import (
    CapabilityDisabledError,
    FixtureNotFoundError,
    LocalToolAdapter,
    normalize_symbol,
)


@dataclass(frozen=True)
class EvidenceGap:
    gap_type: str
    reason: str
    capability: str | None = None
    source: str | None = None
    setup_type: str | None = None
    evidence_refs: tuple[str, ...] = field(default_factory=tuple)


class EvidenceGapError(RuntimeError):
    def __init__(self, gap: EvidenceGap) -> None:
        super().__init__(gap.reason)
        self.gap = gap


@dataclass(frozen=True)
class MarketSnapshot:
    symbol: str
    start: str
    end: str
    bars: list[dict[str, Any]]
    news: list[dict[str, Any]]
    filings: list[dict[str, Any]]
    calendar: list[dict[str, Any]]
    evidence_refs: list[str]


def build_market_snapshot(
    *,
    adapter: LocalToolAdapter,
    symbol: str,
    start: str,
    end: str,
) -> MarketSnapshot:
    normalized_symbol = normalize_symbol(symbol)
    rulepack = load_rulepack(adapter.settings.rulepack_path)
    if normalized_symbol not in rulepack.universe_symbols:
        raise EvidenceGapError(
            EvidenceGap(
                gap_type="outside_fixed_universe",
                source="rulepack",
                reason=(
                    f"Cannot build market snapshot for {normalized_symbol}: "
                    "symbol is outside the fixed universe."
                ),
            )
        )

    try:
        bars = adapter.get_market_bars(symbol=normalized_symbol, start=start, end=end)
        calendar = adapter.get_market_calendar(start=start, end=end)
        news = adapter.get_news_events(symbol=normalized_symbol, start=start, end=end)
        filings = adapter.get_filing_events(symbol=normalized_symbol, start=start, end=end)
    except CapabilityDisabledError as exc:
        raise EvidenceGapError(
            EvidenceGap(
                gap_type="missing_capability",
                capability=exc.capability,
                reason=(
                    "Cannot build market snapshot: "
                    f"required {exc.capability} evidence is disabled."
                ),
            )
        ) from exc
    except FixtureNotFoundError as exc:
        raise EvidenceGapError(
            EvidenceGap(
                gap_type="missing_fixture",
                source=str(exc.path),
                reason=f"Cannot build market snapshot: fixture evidence is missing at {exc.path}.",
            )
        ) from exc

    if not bars:
        raise EvidenceGapError(
            EvidenceGap(
                gap_type="insufficient_evidence",
                reason=(
                    f"Cannot build market snapshot for {symbol}: "
                    "no market bars in requested window."
                ),
            )
        )
    if not calendar:
        raise EvidenceGapError(
            EvidenceGap(
                gap_type="insufficient_evidence",
                reason=(
                    "Cannot build market snapshot: "
                    "no market calendar sessions in requested window."
                ),
            )
        )

    evidence = [*bars, *calendar, *news, *filings]
    return MarketSnapshot(
        symbol=bars[0].symbol,
        start=start,
        end=end,
        bars=[_evidence_to_record(item) for item in bars],
        news=[_evidence_to_record(item) for item in news],
        filings=[_evidence_to_record(item) for item in filings],
        calendar=[_evidence_to_record(item) for item in calendar],
        evidence_refs=[
            _evidence_ref(item.provider, item.symbol, item.timestamp) for item in evidence
        ],
    )


def _evidence_to_record(evidence: Any) -> dict[str, Any]:
    return {
        "provider": evidence.provider,
        "timestamp": evidence.timestamp,
        "symbol": evidence.symbol,
        "payload": evidence.payload,
        "cost_category": evidence.cost_category,
        "evidence_ref": _evidence_ref(evidence.provider, evidence.symbol, evidence.timestamp),
    }


def _evidence_ref(provider: str, symbol: str, timestamp: str) -> str:
    return f"{provider}:{symbol}:{timestamp}"
