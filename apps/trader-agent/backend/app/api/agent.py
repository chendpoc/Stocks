from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from app.db.migrations import bootstrap_database
from app.modules.document_indexer import index_local_knowledge
from app.modules.local_search import MAX_SEARCH_LIMIT, search_local_knowledge
from app.modules.runtime_orchestrator import (
    EmptyScanUniverseError,
    RuntimeOrchestrator,
    get_agent_run,
    get_runtime_status,
    list_agent_events,
    list_agent_runs,
)

router = APIRouter(prefix="/api/agent", tags=["agent-runtime"])
knowledge_router = APIRouter(prefix="/api/knowledge", tags=["local-knowledge"])


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


@knowledge_router.post("/reindex")
def reindex_knowledge(request: Request) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)
    summary = index_local_knowledge(settings)
    return {"source_count": summary.source_count, "indexed_count": summary.indexed_count}


@knowledge_router.get("/search")
def search_knowledge(
    request: Request,
    q: Annotated[str, Query(min_length=1)],
    symbol: str | None = None,
    source_type: str | None = None,
    start: str | None = None,
    end: str | None = None,
    limit: Annotated[int, Query(ge=1, le=MAX_SEARCH_LIMIT)] = 10,
) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)
    try:
        results = search_local_knowledge(
            settings,
            query=q,
            symbol=symbol,
            source_type=source_type,
            start=start,
            end=end,
            limit=limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"query": q, "results": [result.as_dict() for result in results]}
