from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Request

from app.modules.live_market_plane.constants import M2_US_SYMBOLS
from app.modules.live_market_plane.service import (
    MarketPlaneError,
    get_latest_market_state,
    ingest_quote_for_symbol,
)

router = APIRouter(prefix="/api/market-plane", tags=["market-plane"])


def _settings(request: Request):
    return request.app.state.settings


@router.get("/symbols")
def list_symbols() -> dict[str, Any]:
    return {"symbols": list(M2_US_SYMBOLS)}


@router.get("/state/{symbol}")
def latest_state(symbol: str, request: Request) -> dict[str, Any]:
    state = get_latest_market_state(_settings(request), symbol)
    if state is None:
        raise HTTPException(status_code=404, detail="No MarketStateSnapshot for symbol")
    return state


@router.post("/ingest/{symbol}")
def ingest_symbol(symbol: str, request: Request) -> dict[str, Any]:
    try:
        return ingest_quote_for_symbol(_settings(request), symbol)
    except MarketPlaneError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
