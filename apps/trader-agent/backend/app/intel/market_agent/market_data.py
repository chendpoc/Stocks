from __future__ import annotations

from typing import Any

from app.core.config import Settings
from app.intel.ingestion.market_data import get_bars_from_db, ingest_symbol
from app.intel.market_agent.schemas import MarketDataQuality, MarketDataResponse


def _normalize_symbol(symbol: str) -> str:
    return symbol.strip().upper()


def _normalize_timeframe(timeframe: str) -> str:
    return timeframe.strip().lower()


class DataQualityGate:
    def __call__(
        self,
        bars: list[dict[str, Any]],
        *,
        timeframe: str,
        min_required: int | None = None,
    ) -> MarketDataQuality:
        return evaluate_data_quality(bars, timeframe=timeframe, min_required=min_required)


def evaluate_data_quality(
    bars: list[dict[str, Any]],
    *,
    timeframe: str,
    min_required: int | None = None,
) -> MarketDataQuality:
    normalized_tf = _normalize_timeframe(timeframe)
    if not normalized_tf:
        return MarketDataQuality(
            status="blocked",
            reason="timeframe is required",
            bar_count=0,
            min_required=min_required if isinstance(min_required, int) else 1,
        )

    required = min_required if isinstance(min_required, int) else max(1, _default_min_required(normalized_tf))
    if required <= 0:
        return MarketDataQuality(
            status="blocked",
            reason="min_required must be greater than 0",
            bar_count=len(bars),
            min_required=required,
        )

    bar_count = len(bars)
    if bar_count >= required:
        return MarketDataQuality(
            status="pass",
            reason=f"{bar_count} bars >= required {required} for {normalized_tf}",
            bar_count=bar_count,
            min_required=required,
        )

    if bar_count == 0:
        return MarketDataQuality(
            status="failed",
            reason=f"no bars for {normalized_tf}; required {required}",
            bar_count=0,
            min_required=required,
        )

    return MarketDataQuality(
        status="warning",
        reason=f"insufficient bars for {normalized_tf}: {bar_count} < required {required}",
        bar_count=bar_count,
        min_required=required,
    )


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


class MarketDataService:
    def __init__(
        self,
        engine,
        settings: Settings | None = None,
    ) -> None:
        self.engine = engine
        self.settings = settings
        self._quality_gate = DataQualityGate()

    def get_market_data(
        self,
        symbol: str,
        timeframe: str,
        *,
        limit: int = 20,
        min_required: int | None = None,
        allow_live_fallback: bool = False,
        force_live: bool = False,
    ) -> MarketDataResponse:
        timeframe_norm = _normalize_timeframe(timeframe)
        symbol_norm = _normalize_symbol(symbol)

        db_bars: list[dict[str, Any]] = []
        try:
            db_bars = get_bars_from_db(self.engine, symbol_norm, timeframe_norm, limit)
        except Exception as exc:
            return MarketDataResponse(
                symbol=symbol_norm,
                timeframe=timeframe_norm,
                bars=[],
                quality_status="blocked",
                quality_reason=f"market_bars read failed: {exc}",
                source="db",
                bar_count=0,
            )

        quality = self._quality_gate(
            db_bars,
            timeframe=timeframe_norm,
            min_required=min_required,
        )
        if quality.status == "pass" or not allow_live_fallback:
            return MarketDataResponse(
                symbol=symbol_norm,
                timeframe=timeframe_norm,
                bars=db_bars,
                quality_status=quality.status,
                quality_reason=quality.reason,
                source="db",
                bar_count=quality.bar_count,
            )

        if timeframe_norm not in {"1d", "5m"}:
            return MarketDataResponse(
                symbol=symbol_norm,
                timeframe=timeframe_norm,
                bars=db_bars,
                quality_status=quality.status,
                quality_reason=(
                    f"{quality.reason}; live fallback is unsupported for timeframe {timeframe_norm}"
                ),
                source="db",
                bar_count=quality.bar_count,
            )

        try:
            ingest_symbol(
                self.engine,
                symbol_norm,
                settings=self.settings,
                force=force_live,
            )
            refreshed_bars = get_bars_from_db(self.engine, symbol_norm, timeframe_norm, limit)
            refreshed_quality = self._quality_gate(
                refreshed_bars,
                timeframe=timeframe_norm,
                min_required=min_required,
            )
            return MarketDataResponse(
                symbol=symbol_norm,
                timeframe=timeframe_norm,
                bars=refreshed_bars,
                quality_status=refreshed_quality.status,
                quality_reason=refreshed_quality.reason,
                source="db+live",
                bar_count=refreshed_quality.bar_count,
            )
        except Exception as exc:
            existing_count = len(db_bars)
            return MarketDataResponse(
                symbol=symbol_norm,
                timeframe=timeframe_norm,
                bars=db_bars,
                quality_status="blocked",
                quality_reason=f"live fallback failed: {exc}",
                source="db",
                bar_count=existing_count,
            )
