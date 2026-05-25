from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from app.modules.market_snapshot import EvidenceGap, MarketSnapshot


@dataclass(frozen=True)
class SetupCandidate:
    setup_type: str
    status: str
    reason: str
    trigger_condition: str
    invalidation: str
    evidence_refs: list[str]
    symbol: str


@dataclass(frozen=True)
class SetupDetectionResult:
    symbol: str
    candidates: list[SetupCandidate] = field(default_factory=list)
    gaps: list[EvidenceGap] = field(default_factory=list)


def detect_setups(snapshot: MarketSnapshot) -> SetupDetectionResult:
    candidates: list[SetupCandidate] = []
    gaps: list[EvidenceGap] = []

    _detect_gap_fill(snapshot, gaps)
    _detect_sharp_drop_volume_contraction(snapshot, candidates, gaps)
    _detect_btc_move_alert(snapshot, candidates, gaps)
    _detect_post_reduction_wait_window(snapshot, candidates, gaps)
    _detect_friday_options_risk_pattern(snapshot, candidates, gaps)

    return SetupDetectionResult(symbol=snapshot.symbol, candidates=candidates, gaps=gaps)


def _detect_gap_fill(snapshot: MarketSnapshot, gaps: list[EvidenceGap]) -> None:
    gaps.append(
        EvidenceGap(
            gap_type="insufficient_evidence",
            setup_type="gap_fill",
            reason=(
                "Gap-fill detection needs previous session close and current session open "
                "evidence; current fixtures only provide intraday bars."
            ),
            evidence_refs=tuple(_refs(snapshot.bars)),
        )
    )


def _detect_sharp_drop_volume_contraction(
    snapshot: MarketSnapshot,
    candidates: list[SetupCandidate],
    gaps: list[EvidenceGap],
) -> None:
    bars = snapshot.bars
    if len(bars) < 3:
        gaps.append(
            EvidenceGap(
                gap_type="insufficient_evidence",
                setup_type="sharp_drop_volume_contraction",
                reason=(
                    "Need at least three market bars to detect a sharp drop "
                    "followed by volume contraction."
                ),
                evidence_refs=tuple(_refs(bars)),
            )
        )
        return

    for index in range(1, len(bars) - 1):
        previous = bars[index - 1]
        drop_bar = bars[index]
        contraction_bar = bars[index + 1]
        previous_close = _close(previous)
        drop_close = _close(drop_bar)
        drop_volume = _volume(drop_bar)
        contraction_volume = _volume(contraction_bar)
        if previous_close <= 0:
            continue
        drop_pct = (drop_close - previous_close) / previous_close
        volume_contracted = contraction_volume <= drop_volume * 0.5
        if drop_pct <= -0.04 and volume_contracted:
            candidates.append(
                SetupCandidate(
                    symbol=snapshot.symbol,
                    setup_type="sharp_drop_volume_contraction",
                    status="waiting_trigger",
                    reason=(
                        f"{snapshot.symbol} fell {abs(drop_pct):.1%} and the next bar's volume "
                        "contracted by at least half, so the setup remains in waiting state."
                    ),
                    trigger_condition=(
                        "Wait for a later bar to reclaim the sharp-drop bar's VWAP or high with "
                        "confirmed liquidity."
                    ),
                    invalidation=(
                        "Invalidate if price makes a fresh low on expanding volume or the setup "
                        "ages beyond the current session."
                    ),
                    evidence_refs=_refs([previous, drop_bar, contraction_bar]),
                )
            )
            return

    gaps.append(
        EvidenceGap(
            gap_type="insufficient_evidence",
            setup_type="sharp_drop_volume_contraction",
            reason=(
                "No sharp-drop bar followed by clear volume contraction was present "
                "in market bars."
            ),
            evidence_refs=tuple(_refs(bars)),
        )
    )


def _detect_btc_move_alert(
    snapshot: MarketSnapshot,
    candidates: list[SetupCandidate],
    gaps: list[EvidenceGap],
) -> None:
    btc_news = [
        item
        for item in snapshot.news
        if any(keyword in _text_blob(item) for keyword in ("btc", "bitcoin", "crypto"))
    ]
    if not btc_news:
        gaps.append(
            EvidenceGap(
                gap_type="insufficient_evidence",
                setup_type="btc_move_alert",
                reason=(
                    "No BTC, Bitcoin, or crypto-related news context was present "
                    "for this symbol."
                ),
                evidence_refs=tuple(_refs(snapshot.news)),
            )
        )
        return

    candidates.append(
        SetupCandidate(
            symbol=snapshot.symbol,
            setup_type="btc_move_alert",
            status="observe",
            reason=(
                "Bitcoin or crypto context is present in local news evidence; "
                "treat it as context only."
            ),
            trigger_condition=(
                "Observe whether equity price and volume confirm the crypto-linked move."
            ),
            invalidation=(
                "Dismiss if subsequent local news removes the BTC linkage "
                "or price response fades."
            ),
            evidence_refs=_refs(btc_news),
        )
    )


def _detect_post_reduction_wait_window(
    snapshot: MarketSnapshot,
    candidates: list[SetupCandidate],
    gaps: list[EvidenceGap],
) -> None:
    reduction_filings = [
        item
        for item in snapshot.filings
        if item["payload"].get("form_type") == "144"
        or any(keyword in _text_blob(item) for keyword in ("reduction", "sale", "sell", "insider"))
    ]
    if not reduction_filings:
        gaps.append(
            EvidenceGap(
                gap_type="insufficient_evidence",
                setup_type="post_reduction_wait_window",
                reason="No reduction, sale-plan, or insider-sale filing evidence was present.",
                evidence_refs=tuple(_refs(snapshot.filings)),
            )
        )
        return

    candidates.append(
        SetupCandidate(
            symbol=snapshot.symbol,
            setup_type="post_reduction_wait_window",
            status="waiting_trigger",
            reason=(
                "Reduction-related filing evidence requires a wait window before "
                "any escalation."
            ),
            trigger_condition=(
                "Wait for the next regular session to absorb the filing and require "
                "stabilized volume."
            ),
            invalidation=(
                "Invalidate if new filing context contradicts the reduction watch "
                "or volatility expands."
            ),
            evidence_refs=_refs(reduction_filings),
        )
    )


def _detect_friday_options_risk_pattern(
    snapshot: MarketSnapshot,
    candidates: list[SetupCandidate],
    gaps: list[EvidenceGap],
) -> None:
    friday_sessions = {
        item["timestamp"]
        for item in snapshot.calendar
        if date.fromisoformat(item["timestamp"]).weekday() == 4
    }
    option_news = [
        item
        for item in snapshot.news
        if "option expiry" in _text_blob(item) or "options expiry" in _text_blob(item)
    ]
    if not friday_sessions or not option_news:
        gaps.append(
            EvidenceGap(
                gap_type="insufficient_evidence",
                setup_type="friday_options_risk_pattern",
                reason="Need both a Friday market session and option-expiry news context.",
                evidence_refs=tuple([*_refs(snapshot.calendar), *_refs(snapshot.news)]),
            )
        )
        return

    candidates.append(
        SetupCandidate(
            symbol=snapshot.symbol,
            setup_type="friday_options_risk_pattern",
            status="observe",
            reason="Friday session plus option expiry news creates market-structure risk context.",
            trigger_condition=(
                "Observe spread, liquidity, and pin-risk behavior during the Friday session."
            ),
            invalidation=(
                "Dismiss after the Friday session closes or if option-expiry context is absent."
            ),
            evidence_refs=[
                *_refs(option_news),
                *_refs(_records_for_dates(snapshot.calendar, friday_sessions)),
            ],
        )
    )


def _close(bar: dict[str, Any]) -> float:
    return float(bar["payload"]["close"])


def _volume(bar: dict[str, Any]) -> int:
    return int(bar["payload"]["volume"])


def _refs(records: list[dict[str, Any]]) -> list[str]:
    return [str(item["evidence_ref"]) for item in records]


def _text_blob(record: dict[str, Any]) -> str:
    payload = record["payload"]
    return " ".join(str(value) for value in payload.values()).lower()


def _records_for_dates(records: list[dict[str, Any]], dates: set[str]) -> list[dict[str, Any]]:
    return [item for item in records if item["timestamp"] in dates]
