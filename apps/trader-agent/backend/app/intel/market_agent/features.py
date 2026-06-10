from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Final

from app.intel.db.connection import get_intel_engine
from app.intel.market_agent.repositories import create_feature_snapshot
from app.intel.market_agent.schemas import FeatureSnapshot
from app.intel.market_agent.schemas import MarketDataQualityStatus


DEFAULT_ATR_PERIOD: Final[int] = 14
DEFAULT_VOLUME_WINDOW: Final[int] = 20
OPENING_RANGE_BARS: Final[int] = 3

FeatureEngineOutput = dict[str, Any]


def _to_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _sorted_bars(bars: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        bars,
        key=lambda bar: str(bar.get("ts") or ""),
    )


def _bar_payload(bar: dict[str, Any]) -> dict[str, Any]:
    return {
        "close": _to_float(bar.get("close")),
        "open": _to_float(bar.get("open")),
        "high": _to_float(bar.get("high")),
        "low": _to_float(bar.get("low")),
        "volume": _to_float(bar.get("volume")),
        "vwap": _to_float(bar.get("vwap")),
        "ts": str(bar.get("ts") or ""),
    }


def _compute_ema(values: list[float], period: int) -> float | None:
    if len(values) < period:
        return None
    alpha = 2.0 / (period + 1)
    ema = values[0]
    for value in values[1:]:
        ema = (value * alpha) + (ema * (1.0 - alpha))
    return round(ema, 10)


def _compute_vwap(values: list[dict[str, Any]]) -> float | None:
    if not values:
        return None

    latest = values[-1]
    latest_vwap = latest.get("vwap")
    if _to_float(latest_vwap) is not None:
        return _to_float(latest_vwap)

    total_notional = 0.0
    total_volume = 0.0
    for bar in values:
        close = _to_float(bar.get("close"))
        volume = _to_float(bar.get("volume"))
        if close is None or volume is None:
            continue
        total_notional += close * volume
        total_volume += volume
    if total_volume <= 0:
        return None
    return round(total_notional / total_volume, 10)


def _compute_atr(values: list[dict[str, Any]]) -> float | None:
    if len(values) < 2:
        return None

    trs: list[float] = []
    for idx in range(1, len(values)):
        prev_close = values[idx - 1].get("close")
        current = values[idx]
        if (
            prev_close is None
            or current.get("high") is None
            or current.get("low") is None
        ):
            continue
        high = float(current["high"])
        low = float(current["low"])
        prev = float(prev_close)
        tr = max(high - low, abs(high - prev), abs(low - prev))
        trs.append(tr)

    if not trs:
        return None
    sample_count = min(DEFAULT_ATR_PERIOD, len(trs))
    if sample_count < 1:
        return None
    sample = trs[-sample_count:]
    return round(sum(sample) / len(sample), 10)


def _compute_volume_ratio(values: list[dict[str, Any]]) -> tuple[float | None, dict[str, Any]]:
    if len(values) < 2:
        return None, {
            "volume_ratio_sample_bars": 0,
            "volume_ratio_note": "need_at_least_2_bars",
        }

    current = values[-1]
    previous_window = values[-(DEFAULT_VOLUME_WINDOW + 1) : -1]
    if not previous_window:
        previous_window = values[:-1]
    previous_window = previous_window[-DEFAULT_VOLUME_WINDOW:]

    volume_sum = 0.0
    count = 0
    for bar in previous_window:
        volume = bar["volume"]
        if volume is None:
            continue
        volume_sum += volume
        count += 1

    if count == 0:
        return None, {
            "volume_ratio_sample_bars": 0,
            "volume_ratio_note": "no_valid_volume_in_window",
        }

    avg_volume = volume_sum / count
    current_volume = current["volume"]
    if current_volume is None or avg_volume <= 0:
        return None, {
            "volume_ratio_sample_bars": count,
            "volume_ratio_note": "current_or_avg_volume_invalid",
        }

    metadata = {
        "volume_ratio_sample_bars": count,
        "volume_ratio_source": "rolling_volume_20",
    }
    if count < DEFAULT_VOLUME_WINDOW:
        metadata["volume_ratio_note"] = "computed_with_insufficient_bars"
    return round(current_volume / avg_volume, 10), metadata


def _compute_relative_strength(feature_bars: list[dict[str, Any]], benchmark_bars: list[dict[str, Any]]) -> float | None:
    if len(feature_bars) < 2 or len(benchmark_bars) < 2:
        return None
    latest = feature_bars[-1]["close"]
    previous = feature_bars[-2]["close"]
    benchmark_latest = benchmark_bars[-1]["close"]
    benchmark_previous = benchmark_bars[-2]["close"]
    if (
        latest is None
        or previous is None
        or benchmark_latest is None
        or benchmark_previous is None
        or previous == 0
        or benchmark_previous == 0
    ):
        return None

    symbol_return = (latest - previous) / previous * 100
    benchmark_return = (benchmark_latest - benchmark_previous) / benchmark_previous * 100
    return round(symbol_return - benchmark_return, 10)


def _opening_range(values: list[dict[str, Any]]) -> tuple[float | None, float | None]:
    if not values:
        return None, None

    seed = values[: min(OPENING_RANGE_BARS, len(values))]
    highs = [bar["high"] for bar in seed if bar["high"] is not None]
    lows = [bar["low"] for bar in seed if bar["low"] is not None]
    if not highs or not lows:
        return None, None
    return max(highs), min(lows)


def _snapshot_id(symbol: str, timeframe: str, asof_ts: str | None, features: dict[str, Any]) -> str:
    payload = json.dumps(
        {
            "symbol": symbol.upper(),
            "timeframe": timeframe.lower(),
            "asof_ts": asof_ts or "",
            "features": features,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:20]
    return f"fs_{symbol.lower()}_{timeframe.lower()}_{digest}"


def _normalize_features(features: dict[str, Any], metadata: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(features)
    normalized.setdefault("metadata", {})
    if metadata:
        normalized["metadata"].update(metadata)
    return normalized


@dataclass(frozen=True)
class FeatureComputationInput:
    symbol: str
    timeframe: str
    bars: list[dict[str, Any]]
    quality_status: MarketDataQualityStatus
    quality_reason: str = ""
    benchmark_bars: dict[str, list[dict[str, Any]]] | None = None


class FeatureEngine:
    """Deterministic feature computation for Market Agent."""

    def __init__(self, engine=None) -> None:
        self.engine = engine

    def _compute_features(
        self,
        bars: list[dict[str, Any]],
        benchmark_bars: dict[str, list[dict[str, Any]]] | None,
    ) -> tuple[dict[str, Any], list[str], dict[str, Any], dict[str, Any]]:
        if not bars:
            return {}, ["no_bars"], {"reason": "no_bars"}, {"asof_ts": ""}

        normalized = [_bar_payload(bar) for bar in _sorted_bars(bars)]
        closes = [b["close"] for b in normalized if b["close"] is not None]
        highs = [b["high"] for b in normalized if b["high"] is not None]
        lows = [b["low"] for b in normalized if b["low"] is not None]

        latest = normalized[-1]
        previous = normalized[-2] if len(normalized) > 1 else None
        current_price = latest["close"]
        previous_close = previous["close"] if previous is not None else None

        vwap = _compute_vwap(normalized)
        opening_range_high, opening_range_low = _opening_range(normalized)

        features: dict[str, Any] = {
            "symbol": "",  # filled by caller for snapshot metadata alignment
            "timeframe": "",  # filled by caller
            "current_price": current_price,
            "previous_close": previous_close,
            "day_high": max(highs) if highs else None,
            "day_low": min(lows) if lows else None,
            "opening_range_high": opening_range_high,
            "opening_range_low": opening_range_low,
            "vwap": vwap,
            "ema_9": _compute_ema(closes, 9),
            "ema_20": _compute_ema(closes, 20),
            "ema_50": _compute_ema(closes, 50),
            "atr": _compute_atr(normalized),
            "gap_pct": None,
            "distance_to_vwap": None,
            "price_above_vwap": False,
            "volume_ratio": None,
            "relative_strength_spy": None,
            "relative_strength_qqq": None,
        }

        if current_price is not None and previous_close not in (None, 0):
            features["gap_pct"] = round((current_price - previous_close) / previous_close * 100, 10)

        if vwap is not None and current_price is not None and vwap != 0:
            features["distance_to_vwap"] = round((current_price - vwap) / vwap * 100, 10)
            features["price_above_vwap"] = bool(current_price > vwap)

        volume_ratio, ratio_meta = _compute_volume_ratio(normalized)
        features["volume_ratio"] = volume_ratio

        spy_bars = (benchmark_bars or {}).get("SPY")
        qqq_bars = (benchmark_bars or {}).get("QQQ")
        if spy_bars:
            features["relative_strength_spy"] = _compute_relative_strength(
                normalized, _sorted_bars(spy_bars)
            )
        if qqq_bars:
            features["relative_strength_qqq"] = _compute_relative_strength(
                normalized, _sorted_bars(qqq_bars)
            )

        metadata = {
            "bars_input": len(bars),
            "bars_sorted": len(normalized),
            "volume_ratio": ratio_meta,
            "open_high_low_bars": min(OPENING_RANGE_BARS, len(normalized)),
            "timestamp": latest["ts"],
        }

        tags: list[str] = []
        if len(closes) < 9:
            tags.append("insufficient_for_ema_9")
        if len(closes) < 20:
            tags.append("insufficient_for_ema_20")
        if len(closes) < 50:
            tags.append("insufficient_for_ema_50")
        if len(normalized) < 2:
            tags.append("insufficient_for_atr")
        if len(normalized) < DEFAULT_VOLUME_WINDOW and volume_ratio is not None:
            tags.append("volume_ratio_short_window")
        if qqq_bars is None and features["relative_strength_qqq"] is None:
            tags.append("missing_qqq_benchmark")
        if spy_bars is None and features["relative_strength_spy"] is None:
            tags.append("missing_spy_benchmark")

        return _normalize_features(features, metadata), tags, metadata, {"asof_ts": latest["ts"]}

    def compute(self, input_data: FeatureComputationInput) -> FeatureEngineOutput:
        symbol = input_data.symbol.upper().strip()
        timeframe = input_data.timeframe.lower().strip()

        features, tags, metadata, ts_info = self._compute_features(
            input_data.bars,
            input_data.benchmark_bars,
        )
        asof_ts = ts_info.get("asof_ts", "")
        if symbol:
            features["symbol"] = symbol
        if timeframe:
            features["timeframe"] = timeframe

        feature_snapshot_id = _snapshot_id(symbol, timeframe, asof_ts, features)
        feature_payload = dict(features)
        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "asof_ts": asof_ts,
            "quality_status": input_data.quality_status,
            "quality_reason": input_data.quality_reason,
            "features": feature_payload,
            "tags": tags,
            "metadata": metadata,
            "feature_snapshot_id": feature_snapshot_id,
            "persistable": input_data.quality_status in {"pass", "warning"} and bool(asof_ts),
        }

    def compute_and_persist(
        self,
        input_data: FeatureComputationInput,
        engine=None,
        *,
        computed: FeatureEngineOutput | None = None,
    ) -> FeatureSnapshot | None:
        payload = computed or self.compute(input_data)
        if not payload["persistable"]:
            return None

        target_engine = engine or self.engine or get_intel_engine(None)
        if target_engine is None:
            raise ValueError("engine is required for persistence")

        feature = FeatureSnapshot(
            feature_snapshot_id=str(payload["feature_snapshot_id"]),
            symbol=str(payload["symbol"]),
            asof_ts=str(payload["asof_ts"]),
            timeframe=str(payload["timeframe"]),
            features_json=dict(payload["features"]),
            tags_json=list(payload["tags"]),
        )
        return create_feature_snapshot(target_engine, feature)
