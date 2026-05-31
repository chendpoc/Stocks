from __future__ import annotations

from fastapi import APIRouter, Query, Request

from app.intel.db.connection import get_intel_engine
from app.intel.features.scanner import list_signals, scan_all_symbols, update_signal_status

router = APIRouter()


@router.post("/scan")
def scan_signals(request: Request) -> dict:
    engine = get_intel_engine(request.app.state.settings)
    return scan_all_symbols(engine)


@router.get("")
def get_signals(
    request: Request,
    symbol: str | None = None,
    status: str | None = None,
    limit: int = 50,
) -> dict:
    engine = get_intel_engine(request.app.state.settings)
    return {"signals": list_signals(engine, symbol=symbol, status=status, limit=limit)}


@router.put("/{signal_id}/status")
def put_signal_status(
    request: Request,
    signal_id: str,
    status: str = Query(...),
) -> dict:
    engine = get_intel_engine(request.app.state.settings)
    updated = update_signal_status(engine, signal_id, status)
    if not updated:
        return {"error": "not_found"}
    return {"signal": updated}
