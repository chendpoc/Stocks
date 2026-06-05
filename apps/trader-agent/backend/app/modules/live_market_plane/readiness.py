from __future__ import annotations

from datetime import UTC, datetime

from app.modules.live_market_plane.constants import (
    ANALYSIS_BLOCKED_QUOTE_AGE_S,
    ANALYSIS_WARNING_QUOTE_AGE_S,
    PAPER_BLOCKED_QUOTE_AGE_S,
)
from app.modules.live_market_plane.types import ConsumerReadiness, DataQualityFlag


def _parse_ts(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized)


def compute_consumer_readiness(
    *,
    quote: dict,
    source_mode: str,
) -> ConsumerReadiness:
    asof_ts = quote["asof_ts"]
    age_s = (datetime.now(UTC) - _parse_ts(asof_ts)).total_seconds()
    if age_s < 0:
        age_s = 0.0

    quality_flags: list[DataQualityFlag] = list(quote.get("quality_flags") or [])
    has_depth_gap = any(f.get("flag_code") == "depth_unavailable" for f in quality_flags)
    has_trade_gap = any(f.get("flag_code") == "trade_tape_unavailable" for f in quality_flags)

    analysis: str = "ready"
    if age_s > ANALYSIS_BLOCKED_QUOTE_AGE_S:
        analysis = "blocked"
    elif age_s > ANALYSIS_WARNING_QUOTE_AGE_S:
        analysis = "warning"

    paper: str = "ready"
    if (
        source_mode != "live"
        or age_s > PAPER_BLOCKED_QUOTE_AGE_S
        or has_depth_gap
        or has_trade_gap
    ):
        paper = "blocked"

    mode: str = source_mode
    if source_mode == "live" and any(f.get("flag_code") == "non_live_source" for f in quality_flags):
        mode = "degraded"

    return {
        "analysis_monitoring": analysis,  # type: ignore[typeddict-item]
        "paper_simulation": paper,  # type: ignore[typeddict-item]
        "source_mode": mode,  # type: ignore[typeddict-item]
    }
