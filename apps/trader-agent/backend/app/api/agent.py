from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, select

from app.db.migrations import bootstrap_database
from app.db.models import signals
from app.db.session import create_sqlite_engine
from app.modules import _json
from app.modules.artifact_catalog import build_artifact_catalog
from app.modules.corpus_search import MAX_SEARCH_LIMIT, search_corpus
from app.modules.document_indexer import index_local_knowledge
from app.modules.explanation import build_signal_explanation
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


@router.get("/signals/{signal_id}/explanation")
def signal_explanation(signal_id: str, request: Request) -> dict:
    payload = build_signal_explanation(_settings(request), signal_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Signal not found")
    return payload


@knowledge_router.post("/reindex")
def reindex_knowledge(request: Request) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)
    summary = index_local_knowledge(settings)
    return {"source_count": summary.source_count, "indexed_count": summary.indexed_count}


@knowledge_router.post("/scan-artifacts")
def scan_artifacts(request: Request) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)
    result = build_artifact_catalog(settings)
    return {
        "discovered": result.discovered,
        "updated": result.updated,
        "excluded": result.excluded,
        "failed": result.failed,
    }


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
        results = search_corpus(
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


# ── Signals (read-only) ──────────────────────────────────────────

SIGNAL_LIST_MAX = 200
DEFAULT_SIGNAL_LIMIT = 50


def _serialize_signal_row(row: dict) -> dict:
    """Deserialize JSON columns so the API returns objects, not strings."""
    return {
        **row,
        "evidence": _json.loads(row.get("evidence"), {}),
        "risk_flags": _json.loads(row.get("risk_flags"), []),
        "tool_outputs": _json.loads(row.get("tool_outputs"), {}),
    }


def _signal_list_filters(
    symbol: str | None,
    status: str | None,
    q: str | None,
):
    filters = []
    if symbol:
        filters.append(signals.c.symbol == symbol.upper().strip())
    if status and status.strip().lower() != "all":
        filters.append(signals.c.status == status.strip())
    if q:
        filters.append(signals.c.symbol.like(f"%{q.upper().strip()}%"))
    return filters


@router.get("/signals")
def list_signals(
    request: Request,
    symbol: str | None = None,
    status: str | None = None,
    q: str | None = None,
    page: Annotated[int | None, Query(ge=1)] = None,
    page_size: Annotated[int | None, Query(ge=1, le=SIGNAL_LIST_MAX)] = None,
    limit: Annotated[int, Query(ge=1, le=SIGNAL_LIST_MAX)] = DEFAULT_SIGNAL_LIMIT,
) -> dict:
    settings = _settings(request)
    engine = create_sqlite_engine(settings)
    filters = _signal_list_filters(symbol, status, q)
    with engine.begin() as conn:
        if page is None:
            stmt = select(signals).order_by(signals.c.created_at.desc())
            for clause in filters:
                stmt = stmt.where(clause)
            stmt = stmt.limit(limit)
            rows = conn.execute(stmt).mappings().all()
            return {"signals": [_serialize_signal_row(dict(row)) for row in rows]}

        resolved_page_size = page_size or DEFAULT_SIGNAL_LIMIT
        offset = (page - 1) * resolved_page_size

        count_stmt = select(func.count()).select_from(signals)
        for clause in filters:
            count_stmt = count_stmt.where(clause)
        total = conn.execute(count_stmt).scalar_one()

        stmt = select(signals).order_by(signals.c.created_at.desc())
        for clause in filters:
            stmt = stmt.where(clause)
        stmt = stmt.offset(offset).limit(resolved_page_size)
        rows = conn.execute(stmt).mappings().all()

    return {
        "signals": [_serialize_signal_row(dict(row)) for row in rows],
        "total": total,
        "page": page,
        "page_size": resolved_page_size,
    }


@router.get("/signals/{signal_id}")
def get_signal(signal_id: str, request: Request) -> dict:
    settings = _settings(request)
    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        row = conn.execute(
            select(signals).where(signals.c.id == signal_id)
        ).mappings().one_or_none()

    if row is None:
        raise HTTPException(status_code=404, detail="Signal not found")
    return _serialize_signal_row(dict(row))


# ── Market Gate & Snapshot (read-only) ───────────────────────────

# Gate tie-breaking: when counts are equal, the higher GATE_ORDER value wins
# (pass=3 > caution=2 > block=1). This produces a slight opportunity bias on ties.
GATE_ORDER = {"pass": 3, "caution": 2, "block": 1}
GATE_LOOKBACK = 20


@router.get("/market/gate")
def market_gate(request: Request) -> dict:
    settings = _settings(request)
    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        rows = conn.execute(
            select(signals.c.market_gate).order_by(signals.c.created_at.desc()).limit(GATE_LOOKBACK)
        ).mappings().all()

    if not rows:
        return {"gate": "caution", "summary": "No recent signals.", "signal_count": 0}

    gates = [row["market_gate"] for row in rows if row["market_gate"] in GATE_ORDER]
    if not gates:
        return {
            "gate": "caution",
            "summary": "No gate data in recent signals.",
            "signal_count": len(rows),
        }

    gate = max(set(gates), key=lambda g: (gates.count(g), GATE_ORDER[g]))

    return {
        "gate": gate,
        "summary": f"Market gate from last {len(rows)} signals.",
        "signal_count": len(rows),
    }


@router.get("/market/snapshot")
def market_snapshot(request: Request) -> dict:
    settings = _settings(request)
    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        total = conn.execute(select(func.count(signals.c.id))).scalar_one()
        open_count = conn.execute(
            select(func.count(signals.c.id)).where(
                signals.c.status.in_(
                    [
                        "watching",
                        "waiting_trigger",
                        "near_trigger",
                        "triggered_for_attention",
                        "needs_more_evidence",
                    ]
                )
            )
        ).scalar_one()
        invalidated_count = conn.execute(
            select(func.count(signals.c.id)).where(signals.c.status == "invalidated")
        ).scalar_one()

        latest_signal_at = conn.execute(
            select(signals.c.created_at).order_by(signals.c.created_at.desc()).limit(1)
        ).scalar_one_or_none()

    return {
        "total_signals": total,
        "open_signal_count": open_count,
        "invalidated_signal_count": invalidated_count,
        "latest_signal_at": latest_signal_at,
    }
