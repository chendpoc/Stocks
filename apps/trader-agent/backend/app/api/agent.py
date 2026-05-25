from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from app.modules.runtime_orchestrator import (
    EmptyScanUniverseError,
    RuntimeOrchestrator,
    get_agent_run,
    get_runtime_status,
    list_agent_events,
    list_agent_runs,
)

router = APIRouter(prefix="/api/agent", tags=["agent-runtime"])


class ScanRequest(BaseModel):
    start: str
    end: str
    symbols: list[str] | None = None


class SymbolRunRequest(BaseModel):
    start: str
    end: str


def _settings(request: Request):
    return request.app.state.settings


@router.get("/status")
def status(request: Request) -> dict:
    return get_runtime_status(_settings(request))


@router.post("/run-scan")
def run_scan(payload: ScanRequest, request: Request) -> dict:
    try:
        return RuntimeOrchestrator(_settings(request)).run_scan(
            start=payload.start,
            end=payload.end,
            symbols=payload.symbols,
        )
    except EmptyScanUniverseError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/run-symbol/{symbol}")
def run_symbol(symbol: str, payload: SymbolRunRequest, request: Request) -> dict:
    return RuntimeOrchestrator(_settings(request)).run_symbol(
        symbol=symbol,
        start=payload.start,
        end=payload.end,
    )


@router.get("/runs")
def runs(
    request: Request,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict:
    return list_agent_runs(_settings(request), limit=limit)


@router.get("/runs/{run_id}")
def run_detail(run_id: str, request: Request) -> dict:
    payload = get_agent_run(_settings(request), run_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return payload


@router.get("/events")
def events(
    request: Request,
    module: str | None = None,
    event_type: str | None = None,
    status: str | None = None,
    symbol: str | None = None,
    run_id: str | None = None,
    start: str | None = None,
    end: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict:
    return list_agent_events(
        _settings(request),
        module=module,
        event_type=event_type,
        status=status,
        symbol=symbol,
        run_id=run_id,
        start=start,
        end=end,
        limit=limit,
    )
