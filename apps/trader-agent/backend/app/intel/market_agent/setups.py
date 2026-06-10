from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any, Literal

from app.intel.market_agent.features import FeatureEngineOutput
from app.intel.market_agent.repositories import create_setup_event
from app.intel.market_agent.schemas import SetupEvent

SetupStatus = Literal["not_present", "forming", "confirmed", "blocked", "invalidated"]
SetupName = Literal[
    "VWAP_RECLAIM",
    "RELATIVE_STRENGTH_PULLBACK",
    "OPENING_RANGE_BREAKOUT",
]

OPENING_RANGE_BARS = 3


def _sorted_bars(bars: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(bars, key=lambda bar: str(bar.get("ts") or ""))


def _to_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _snapshot_value(feature_snapshot: dict[str, Any] | FeatureEngineOutput, key: str, default: Any = "") -> Any:
    if isinstance(feature_snapshot, dict):
        return feature_snapshot.get(key, default)
    return getattr(feature_snapshot, key, default)


def _payload_from_feature_snapshot(feature_snapshot: FeatureEngineOutput | dict[str, Any]) -> dict[str, Any]:
    if isinstance(feature_snapshot, dict):
        for key in ("features", "features_json", "feature_json"):
            raw = feature_snapshot.get(key)
            if isinstance(raw, dict):
                return dict(raw)
        return {}
    # Support direct repository model objects, where FeatureSnapshot serializes
    # into `features_json`.
    raw = getattr(feature_snapshot, "features_json", None)
    if isinstance(raw, dict):
        return dict(raw)
    return {}


def _clamp_unit(value: float | None) -> float | None:
    if value is None:
        return None
    return max(0.0, min(1.0, value))


def _get_float(field_map: dict[str, Any], *keys: str) -> float | None:
    for key in keys:
        if key in field_map and field_map[key] is not None:
            return _to_float(field_map[key])
    return None


def _make_event_id(symbol: str, timeframe: str, setup_name: str, setup_status: str, event_ts: str) -> str:
    digest = hashlib.sha256(f"{symbol}|{timeframe}|{setup_name}|{setup_status}|{event_ts}".encode("utf-8")).hexdigest()[
        :20
    ]
    return f"se_{setup_name.lower()}_{digest}"


def _event_payload(
    symbol: str,
    timeframe: str,
    setup_name: str,
    setup_status: SetupStatus,
    event_ts: str,
    feature_snapshot_id: str | None,
    confidence: float | None,
    conditions: dict[str, Any],
    invalidations: dict[str, Any],
    evidence_seed: str,
) -> SetupEvent:
    setup_json = {
        "setup_name": setup_name,
        "setup_status": setup_status,
        "confidence": confidence,
        "conditions": conditions,
        "invalidations": invalidations,
        "evidence_seed": evidence_seed,
        "feature_snapshot_id": feature_snapshot_id,
    }
    context_json = {
        "timeframe": timeframe,
        "feature_snapshot_id": feature_snapshot_id,
        "event_seed": evidence_seed,
    }
    return SetupEvent(
        setup_event_id=_make_event_id(symbol, timeframe, setup_name, setup_status, event_ts),
        symbol=symbol,
        event_type=setup_name,
        event_ts=event_ts,
        setup_json=setup_json,
        context_json=context_json,
    )


def _vwap_reclaim_state(
    bars: list[dict[str, Any]],
    features: dict[str, Any],
) -> tuple[SetupStatus, float | None, dict[str, Any], dict[str, Any]]:
    if len(bars) < 2:
        return "not_present", None, {}, {}

    current = bars[-1]
    previous = bars[-2]
    vwap = _get_float(features, "vwap")
    prev_vwap = _get_float(previous, "vwap")
    current_close = _get_float(current, "close")
    prev_close = _get_float(previous, "close")

    if vwap is None or current_close is None or prev_close is None or prev_vwap is None:
        return "not_present", None, {}, {}

    # confirmed: cross from below/equal to above on latest bar
    if prev_close <= prev_vwap and current_close > vwap:
        distance = abs((current_close - vwap) / vwap) if vwap else None
        confidence = _clamp_unit(distance * 10 if distance is not None else None)
        conditions = {
            "previous_close": prev_close,
            "previous_vwap": prev_vwap,
            "current_close": current_close,
            "current_vwap": vwap,
        }
        return "confirmed", confidence, conditions, {}

    if prev_close > vwap and current_close <= vwap:
        invalidations = {
            "reason": "close_back_below_vwap",
            "previous_close": prev_close,
            "previous_vwap": prev_vwap,
            "current_close": current_close,
        }
        return "invalidated", 0.5, {}, invalidations

    if current_close > vwap:
        distance = _get_float(features, "distance_to_vwap")
        return "forming", _clamp_unit(distance / 5 if distance is not None else 0.35), {
            "current_close": current_close,
            "current_vwap": vwap,
        }, {}

    return "not_present", None, {}, {}


def _relative_strength_pullback_state(
    features: dict[str, Any],
) -> tuple[SetupStatus, float | None, dict[str, Any], dict[str, Any]]:
    rs_qqq = _get_float(features, "relative_strength_qqq")
    rs_spy = _get_float(features, "relative_strength_spy")
    close = _get_float(features, "current_price")
    vwap = _get_float(features, "vwap")
    ema20 = _get_float(features, "ema_20")

    available_strengths = {
        "relative_strength_qqq": rs_qqq,
        "relative_strength_spy": rs_spy,
    }
    available_strengths = {
        name: value for name, value in available_strengths.items() if value is not None
    }

    if not available_strengths or close is None:
        return "not_present", None, {}, {}

    above_vwap = vwap is not None and close >= vwap
    above_ema20 = ema20 is not None and close >= ema20
    if not (above_vwap or above_ema20):
        return "not_present", None, {}, {}

    dominant_name, dominant_value = max(
        available_strengths.items(),
        key=lambda item: item[1],
    )

    conditions = {
        "relative_strength_qqq": rs_qqq,
        "relative_strength_spy": rs_spy,
        "relative_strength_dominant_name": dominant_name,
        "relative_strength_dominant_value": dominant_value,
        "above_vwap": above_vwap,
        "above_ema20": above_ema20,
    }

    if dominant_value > 0:
        confidence = _clamp_unit(abs(dominant_value) / 1)
        status: SetupStatus = "confirmed" if dominant_value >= 0.8 else "forming"
        return status, confidence, conditions, {}

    if dominant_value <= 0:
        invalidations = {
            "reason": "relative_strength_not_positive",
            "value": dominant_value,
            "metric": dominant_name,
        }
        return "invalidated", _clamp_unit(abs(dominant_value) / 3), {}, invalidations

    return "not_present", None, {}, {}


def _opening_range_breakout_state(
    bars: list[dict[str, Any]],
    features: dict[str, Any],
) -> tuple[SetupStatus, float | None, dict[str, Any], dict[str, Any]]:
    if len(bars) < OPENING_RANGE_BARS:
        return "not_present", None, {}, {}

    opening_range_high = _get_float(features, "opening_range_high")
    close = _get_float(features, "current_price")
    volume_ratio = _get_float(features, "volume_ratio")

    if close is None or opening_range_high is None or volume_ratio is None:
        return "not_present", None, {}, {}

    conditions = {
        "opening_range_high": opening_range_high,
        "current_close": close,
        "volume_ratio": volume_ratio,
    }
    if close > opening_range_high and volume_ratio >= 1.2:
        confidence = _clamp_unit((volume_ratio - 1.2) / 1.8 + 0.35)
        status: SetupStatus = "confirmed" if volume_ratio >= 2.0 else "forming"
        return status, confidence, conditions, {}

    if close <= opening_range_high and volume_ratio >= 2.0:
        invalidations = {
            "reason": "volume_expansion_without_breakout",
            "opening_range_high": opening_range_high,
            "current_close": close,
        }
        return "invalidated", _clamp_unit(volume_ratio / 2), {}, invalidations

    return "not_present", None, {}, {}


@dataclass(frozen=True)
class SetupDetectionResult:
    setup_name: SetupName | str
    setup_status: SetupStatus
    confidence: float | None
    conditions: dict[str, Any]
    invalidations: dict[str, Any]
    evidence_seed: str


class SetupDetector:
    """Deterministic setup rule evaluation from feature snapshots."""

    def detect(
        self,
        feature_snapshot: FeatureEngineOutput | dict[str, Any],
        recent_bars: list[dict[str, Any]],
    ) -> list[SetupEvent]:
        feature_payload = _payload_from_feature_snapshot(feature_snapshot)
        bars = [
            {
                "close": _to_float(bar.get("close")),
                "vwap": _to_float(bar.get("vwap")),
                "ts": str(bar.get("ts") or ""),
                "high": _to_float(bar.get("high")),
                "low": _to_float(bar.get("low")),
                "open": _to_float(bar.get("open")),
                "volume": _to_float(bar.get("volume")),
            }
            for bar in _sorted_bars(recent_bars)
            if _to_float(bar.get("close")) is not None
        ]

        symbol = str(_snapshot_value(feature_snapshot, "symbol", "")).upper()
        timeframe = str(_snapshot_value(feature_snapshot, "timeframe", "")).lower()
        asof_ts = str(_snapshot_value(feature_snapshot, "asof_ts", ""))
        feature_snapshot_id = _snapshot_value(feature_snapshot, "feature_snapshot_id")
        if not asof_ts and bars:
            asof_ts = str(bars[-1].get("ts") or "")

        quality_status = str(
            _snapshot_value(feature_snapshot, "quality_status", feature_payload.get("quality_status", "pass"))
        )
        if quality_status in {"failed", "blocked"}:
            blocked_event = _event_payload(
                symbol=symbol or "UNKNOWN",
                timeframe=timeframe or "1d",
                setup_name="QUALITY_CHECK",
                setup_status="blocked",
                event_ts=asof_ts or "",
                feature_snapshot_id=feature_snapshot_id,
                confidence=None,
                conditions={"quality_status": quality_status},
                invalidations={"reason": "feature_quality_blocked"},
                evidence_seed="quality_status",
            )
            return [blocked_event]

        results: list[SetupDetectionResult] = []

        vwap_status, vwap_confidence, vwap_conditions, vwap_invalidations = _vwap_reclaim_state(
            bars,
            feature_payload,
        )
        if vwap_status != "not_present":
            results.append(
                SetupDetectionResult(
                    setup_name="VWAP_RECLAIM",
                    setup_status=vwap_status,
                    confidence=vwap_confidence,
                    conditions=vwap_conditions,
                    invalidations=vwap_invalidations,
                    evidence_seed="vwap_reclaim",
                )
            )

        rs_status, rs_confidence, rs_conditions, rs_invalidations = _relative_strength_pullback_state(
            feature_payload,
        )
        if rs_status != "not_present":
            results.append(
                SetupDetectionResult(
                    setup_name="RELATIVE_STRENGTH_PULLBACK",
                    setup_status=rs_status,
                    confidence=rs_confidence,
                    conditions=rs_conditions,
                    invalidations=rs_invalidations,
                    evidence_seed="relative_strength_pullback",
                )
            )

        or_status, or_confidence, or_conditions, or_invalidations = _opening_range_breakout_state(
            bars,
            feature_payload,
        )
        if or_status != "not_present":
            results.append(
                SetupDetectionResult(
                    setup_name="OPENING_RANGE_BREAKOUT",
                    setup_status=or_status,
                    confidence=or_confidence,
                    conditions=or_conditions,
                    invalidations=or_invalidations,
                    evidence_seed="opening_range_breakout",
                )
            )

        return [
            _event_payload(
                symbol=symbol or "UNKNOWN",
                timeframe=timeframe or "1d",
                setup_name=result.setup_name,
                setup_status=result.setup_status,
                event_ts=asof_ts or "",
                feature_snapshot_id=feature_snapshot_id,
                confidence=result.confidence,
                conditions=result.conditions,
                invalidations=result.invalidations,
                evidence_seed=result.evidence_seed,
            )
            for result in results
        ]

    def persist_events(
        self,
        events: list[SetupEvent],
        engine,
        *,
        min_confidence: float = 0.0,
    ) -> list[SetupEvent]:
        persisted: list[SetupEvent] = []
        for event in events:
            if event.setup_status == "not_present":
                continue
            if event.setup_status == "blocked" and event.setup_name != "QUALITY_CHECK":
                continue
            if event.confidence is not None and event.confidence < min_confidence:
                continue
            persisted.append(create_setup_event(engine, event))
        return persisted
