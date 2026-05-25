from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.rulepack.loader import RulePack

MARKET_STRUCTURE_TERMS = {
    "ATR",
    "CPI",
    "EMA",
    "EOD",
    "EPS",
    "ETF",
    "FOMC",
    "GDP",
    "IPO",
    "MACD",
    "NAV",
    "RSI",
    "SEC",
    "SMA",
    "VWAP",
}


@dataclass(frozen=True)
class TickerCandidate:
    symbol: str
    alias: str
    status: str
    asset_class: str = "equity"
    confidence: float = 0.0
    ambiguity_notes: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class TickerResolution:
    active_universe_matches: list[TickerCandidate]
    candidates: list[TickerCandidate]


class TickerAliasResolver:
    def __init__(self, active_universe: list[str]) -> None:
        self.active_universe = tuple(dict.fromkeys(symbol.upper() for symbol in active_universe))

    @classmethod
    def from_rulepack(cls, rulepack: RulePack) -> TickerAliasResolver:
        return cls(rulepack.universe_symbols)

    def resolve_text(self, text: str) -> TickerResolution:
        candidates: list[TickerCandidate] = []
        seen: set[tuple[str, str, str]] = set()

        def add(candidate: TickerCandidate) -> None:
            key = (candidate.symbol, candidate.alias, candidate.status)
            if key not in seen:
                candidates.append(candidate)
                seen.add(key)

        upper_text = text.upper()
        for symbol in self.active_universe:
            if re.search(rf"(?<![A-Z]){re.escape(symbol)}(?![A-Z])", upper_text):
                add(TickerCandidate(symbol=symbol, alias=symbol, status="active", confidence=0.98))

        if "大盘" in text:
            for symbol in ("SPY", "QQQ"):
                add(
                    TickerCandidate(
                        symbol=symbol,
                        alias="大盘",
                        status="candidate",
                        confidence=0.62,
                        ambiguity_notes=["大盘 can refer to SPY or QQQ; keep as candidate."],
                    )
                )

        if "比特币" in text or re.search(r"(?<![A-Z])BTC(?![A-Z])", upper_text):
            add(
                TickerCandidate(
                    symbol="BTC",
                    alias="BTC" if "BTC" in upper_text else "比特币",
                    status="context_asset",
                    asset_class="market_context",
                    confidence=0.95,
                )
            )

        known_context = set(self.active_universe) | {"BTC", "SPY", "QQQ"}
        for token in re.findall(r"(?<![A-Z])([A-Z]{2,5})(?![A-Z])", upper_text):
            if token in MARKET_STRUCTURE_TERMS:
                continue
            if token not in known_context:
                add(
                    TickerCandidate(
                        symbol=token,
                        alias=token,
                        status="requires_approval",
                        confidence=0.4,
                        ambiguity_notes=["Ticker is outside the fixed RulePack universe."],
                    )
                )

        active = [candidate for candidate in candidates if candidate.status == "active"]
        return TickerResolution(active_universe_matches=active, candidates=candidates)
