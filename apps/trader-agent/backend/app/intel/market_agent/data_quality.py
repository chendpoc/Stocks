from __future__ import annotations

from typing import Any

from app.intel.market_agent.schemas import MarketDataQuality


class DataQualityGate:
    def __call__(
        self,
        bars: list[dict[str, Any]],
        *,
        timeframe: str,
        min_required: int | None = None,
        expected_count: int | None = None,
    ) -> MarketDataQuality:
        return evaluate_data_quality(
            bars,
            timeframe=timeframe,
            min_required=min_required,
            expected_count=expected_count,
        )


def evaluate_data_quality(
    bars: list[dict[str, Any]],
    *,
    timeframe: str,
    min_required: int | None = None,
    expected_count: int | None = None,
) -> MarketDataQuality:
    normalized_tf = _normalize_timeframe(timeframe)
    if not normalized_tf:
        return MarketDataQuality(
            status="blocked",
            reason="timeframe is required",
            bar_count=0,
            min_required=min_required if isinstance(min_required, int) else 1,
            quality_status="quality_blocked",
        )

    required = min_required if isinstance(min_required, int) else max(1, _default_min_required(normalized_tf))
    if required <= 0:
        return MarketDataQuality(
            status="blocked",
            reason="min_required must be greater than 0",
            bar_count=len(bars),
            min_required=required,
            quality_status="quality_blocked",
        )

    bar_count = len(bars)
    expected = expected_count if isinstance(expected_count, int) and expected_count > 0 else required
    completeness = _clamp_ratio(bar_count / expected if expected > 0 else 0.0)
    gap_count = max(0, expected - bar_count)
    quality_score = max(0, min(100, round(completeness * 100)))
    quality_status = _quality_status_for_completeness(completeness)

    if bar_count >= required:
        return MarketDataQuality(
            status="pass",
            reason=f"{bar_count} bars >= required {required} for {normalized_tf}",
            bar_count=bar_count,
            min_required=required,
            quality_score=quality_score,
            gap_count=gap_count,
            completeness=round(completeness, 4),
            quality_status=quality_status,
        )

    if bar_count == 0:
        return MarketDataQuality(
            status="failed",
            reason=f"no bars for {normalized_tf}; required {required}",
            bar_count=0,
            min_required=required,
            quality_score=quality_score,
            gap_count=gap_count,
            completeness=round(completeness, 4),
            quality_status=quality_status,
        )

    return MarketDataQuality(
        status="warning",
        reason=f"insufficient bars for {normalized_tf}: {bar_count} < required {required}",
        bar_count=bar_count,
        min_required=required,
        quality_score=quality_score,
        gap_count=gap_count,
        completeness=round(completeness, 4),
        quality_status=quality_status,
    )


def _normalize_timeframe(timeframe: str) -> str:
    return timeframe.strip().lower()


def _default_min_required(timeframe: str) -> int:
    defaults = {
        "1d": 20,
        "5m": 24,
        "1m": 10,
        "2m": 10,
        "15m": 10,
        "30m": 10,
        "1h": 12,
        "2h": 12,
        "4h": 8,
    }
    return defaults.get(timeframe, 3)


def _clamp_ratio(value: float) -> float:
    if value < 0:
        return 0.0
    if value > 1:
        return 1.0
    return value


def _quality_status_for_completeness(completeness: float) -> str:
    if completeness < 0.5:
        return "quality_critical"
    if completeness < 0.9:
        return "quality_degraded"
    return "quality_pass"
