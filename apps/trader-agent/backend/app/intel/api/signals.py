from __future__ import annotations

from fastapi import APIRouter, Query, Request

from app.intel.db.connection import get_intel_engine
from app.intel.db.schema import MVP_SYMBOLS
from app.intel.features.cross_asset import calc_cross_asset_correlation
from app.intel.features.pattern_matcher import scan_patterns
from app.intel.features.scanner import (
    build_anomaly_dashboard,
    list_signals,
    scan_all_symbols,
    update_signal_status,
)

MVP_SYMBOL_LIST = [row[0] for row in MVP_SYMBOLS]

router = APIRouter()


@router.post("/scan")
def scan_signals(request: Request) -> dict:
    engine = get_intel_engine(request.app.state.settings)
    scan_result = scan_all_symbols(engine)
    return {
        **scan_result,
        "anomaly_dashboard": build_anomaly_dashboard(engine),
        "pattern_alerts": scan_patterns(engine),
        "cross_asset": calc_cross_asset_correlation(engine, MVP_SYMBOL_LIST, days=5),
    }


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
