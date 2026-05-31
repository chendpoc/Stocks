from __future__ import annotations

from fastapi import APIRouter, Request

from app.intel.db.connection import get_intel_engine
from app.intel.ingestion.market_data import get_bars_from_db, ingest_mvp_symbols

router = APIRouter()


@router.post("/ingest")
def ingest_market_data(request: Request) -> dict:
    settings = request.app.state.settings
    result = ingest_mvp_symbols(settings)
    return {"status": "ok", "results": {k: {"daily": v[0], "minute": v[1]} for k, v in result.items()}}


@router.get("/bars")
def get_market_bars(
    request: Request,
    symbol: str,
    timeframe: str = "1d",
    limit: int = 20,
) -> dict:
    engine = get_intel_engine(request.app.state.settings)
    bars = get_bars_from_db(engine, symbol.upper(), timeframe, limit)
    return {"symbol": symbol.upper(), "timeframe": timeframe, "bars": bars}
