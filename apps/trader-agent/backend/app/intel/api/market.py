from __future__ import annotations

from fastapi import APIRouter, Query, Request

from app.intel.db.connection import get_intel_engine
from app.intel.ingestion.market_data import (
    fetch_chart_bars,
    get_bars_from_db,
    get_mvp_market_status,
    get_symbol_market_status,
    ingest_mvp_symbols,
    ingest_symbol,
)

router = APIRouter()


@router.post("/ingest")
def ingest_market_data(request: Request) -> dict:
    settings = request.app.state.settings
    result = ingest_mvp_symbols(settings)
    return {"status": "ok", "results": {k: {"daily": v[0], "minute": v[1]} for k, v in result.items()}}


@router.post("/ingest/{symbol}")
def ingest_symbol_market(
    request: Request,
    symbol: str,
    force: bool = Query(False, description="Bypass TTL and fetch incremental bars"),
) -> dict:
    settings = request.app.state.settings
    engine = get_intel_engine(settings)
    sym = symbol.upper()
    daily, minute = ingest_symbol(engine, sym, settings=settings, force=force)
    return {
        "status": "ok",
        "symbol": sym,
        "daily": daily,
        "minute": minute,
        "force": force,
    }


@router.get("/status")
def market_status(request: Request, symbol: str | None = None) -> dict:
    engine = get_intel_engine(request.app.state.settings)
    if symbol:
        return get_symbol_market_status(engine, symbol.upper())
    return get_mvp_market_status(engine)


@router.get("/bars")
def get_market_bars(
    request: Request,
    symbol: str,
    timeframe: str = "1d",
    limit: int = 20,
    chart: str | None = Query(
        None,
        description="Dashboard interval: 1m,2m,5m,30m,1h,2h,4h,30d",
    ),
) -> dict:
    settings = request.app.state.settings
    sym = symbol.upper()
    if chart:
        bars, tf = fetch_chart_bars(
            sym,
            chart,
            limit=limit,
            settings=settings,
        )
        return {
            "symbol": sym,
            "timeframe": tf,
            "chart": chart.strip().lower(),
            "bars": bars,
        }
    engine = get_intel_engine(settings)
    bars = get_bars_from_db(engine, sym, timeframe, limit)
    return {"symbol": sym, "timeframe": timeframe, "bars": bars}
