from __future__ import annotations

from typing import Any

from app.core.config import Settings
from app.intel.ingestion.market_data import get_bars_from_db, ingest_symbol
from app.intel.market_agent.data_quality import DataQualityGate, evaluate_data_quality
from app.intel.market_agent.schemas import MarketDataResponse


def _normalize_symbol(symbol: str) -> str:
    return symbol.strip().upper()


def _normalize_timeframe(timeframe: str) -> str:
    return timeframe.strip().lower()


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
                quality_score=quality.quality_score,
                gap_count=quality.gap_count,
                completeness=quality.completeness,
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
                quality_score=quality.quality_score,
                gap_count=quality.gap_count,
                completeness=quality.completeness,
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
                quality_score=refreshed_quality.quality_score,
                gap_count=refreshed_quality.gap_count,
                completeness=refreshed_quality.completeness,
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
