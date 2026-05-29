from __future__ import annotations

from dataclasses import asdict
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.events import record_agent_event
from app.db.migrations import bootstrap_database
from app.db.models import signals
from app.db.session import create_sqlite_engine
from app.modules import _json
from app.modules.artifact_catalog import build_artifact_catalog
from app.modules.candidate_extractor import (
    draft_candidates_with_llm,
    extract_candidates_from_sections,
    fetch_sections_for_llm,
)
from app.modules.candidate_service import (
    create_candidates as persist_candidates,
)
from app.modules.candidate_service import (
    get_candidate as fetch_candidate,
)
from app.modules.candidate_service import (
    list_candidates as fetch_candidates,
)
from app.modules.conflict_detector import mark_conflict
from app.modules.corpus_search import MAX_SEARCH_LIMIT, search_corpus
from app.modules.document_indexer import index_local_knowledge
from app.modules.evidence_ref import EvidenceRef
from app.modules.explanation import build_signal_explanation
from app.modules.extract_preview import extract_preview
from app.modules.memory_service import (
    activate_candidate,
    batch_process,
    create_memory_item,
    deprecate_memory_item,
    get_memory_item,
    list_memory_items,
    merge_candidate,
    reject_candidate,
    update_memory_item,
)
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


def _raise_candidate_http_error(exc: ValueError) -> None:
    detail = str(exc)
    if detail == "candidate already processed":
        raise HTTPException(status_code=409, detail=detail) from exc
    raise HTTPException(status_code=404, detail=detail) from exc


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


class CreateCandidatesRequest(BaseModel):
    section_ids: list[str] | None = None
    extraction_mode: str = "rule_based"
    source_date_from: str | None = None
    source_date_to: str | None = None


@knowledge_router.post("/candidates")
def create_candidates_endpoint(request: Request, payload: CreateCandidatesRequest) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)

    raw_candidates: list[dict[str, Any]] = []
    if payload.extraction_mode in ("rule_based", "both"):
        raw_candidates.extend(
            extract_candidates_from_sections(
                settings,
                section_ids=payload.section_ids,
                source_date_from=payload.source_date_from,
                source_date_to=payload.source_date_to,
            )
        )
    if payload.extraction_mode in ("llm_draft", "both"):
        section_texts, section_metadata = fetch_sections_for_llm(
            settings,
            section_ids=payload.section_ids,
            source_date_from=payload.source_date_from,
            source_date_to=payload.source_date_to,
        )
        raw_candidates.extend(
            draft_candidates_with_llm(
                settings,
                section_texts=section_texts,
                section_metadata=section_metadata,
            )
        )

    if not raw_candidates:
        return {"created": [], "flagged": []}

    result = persist_candidates(settings, raw_candidates)

    for candidate_id in result.created:
        record_agent_event(
            settings,
            event_type="memory_candidate_created",
            status="completed",
            input_summary={
                "candidate_id": candidate_id,
                "extraction_mode": payload.extraction_mode,
            },
        )

    return {"created": result.created, "flagged": result.flagged}


@knowledge_router.get("/candidates")
def list_candidates_endpoint(
    request: Request,
    status: str | None = None,
    candidate_type: str | None = None,
    symbol: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)
    rows = fetch_candidates(
        settings,
        status=status,
        candidate_type=candidate_type,
        symbol=symbol,
        limit=limit,
        offset=offset,
    )
    return {"results": rows, "limit": limit, "offset": offset}


@knowledge_router.get("/candidates/{candidate_id}")
def get_candidate_endpoint(request: Request, candidate_id: str) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)
    row = fetch_candidate(settings, candidate_id)
    if row is None:
        raise HTTPException(status_code=404, detail="candidate not found")

    engine = create_sqlite_engine(settings)
    evidence_refs = row.get("evidence_refs_json") or []
    resolved_refs = []
    for ref_dict in evidence_refs:
        ref = EvidenceRef.from_dict(ref_dict)
        resolved = ref.resolve(engine)
        resolved_refs.append(resolved.as_dict())
    row["evidence_refs"] = resolved_refs

    return row


class ExtractPreviewRequest(BaseModel):
    text: str
    context_note: str | None = None


@knowledge_router.post("/extract-preview")
def extract_preview_endpoint(request: Request, payload: ExtractPreviewRequest) -> dict:
    settings = _settings(request)
    result = extract_preview(settings, payload.text, context_note=payload.context_note)
    if result is None:
        raise HTTPException(status_code=422, detail="Could not extract memory from text")
    return asdict(result)


class CreateMemoryItemRequest(BaseModel):
    memory_type: str
    title: str
    summary: str | None = None
    rule_text: str | None = None
    applicability: str | None = None
    invalidation: str | None = None
    symbols_json: list[str] | None = None
    related_symbols_json: list[str] | None = None
    asset_classes_json: list[str] | None = None
    tags_json: list[str] | None = None
    market_scope: str | None = None
    confidence: float | None = None
    evidence_refs_json: list[dict] | None = None


@knowledge_router.post("/memory-items")
def create_memory_item_endpoint(request: Request, payload: CreateMemoryItemRequest) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)
    item = create_memory_item(settings, payload.model_dump(exclude_none=True))
    record_agent_event(
        settings,
        event_type="memory_candidate_activated",
        status="completed",
        input_summary={"memory_item_id": item["id"]},
    )
    return item


@knowledge_router.get("/memory-items")
def list_memory_items_endpoint(
    request: Request,
    status: str | None = None,
    memory_type: str | None = None,
    symbol: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)
    rows = list_memory_items(
        settings,
        status=status,
        memory_type=memory_type,
        symbol=symbol,
        limit=limit,
        offset=offset,
    )
    return {"results": rows, "limit": limit, "offset": offset}


@knowledge_router.get("/memory-items/{item_id}")
def get_memory_item_endpoint(request: Request, item_id: str) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)
    row = get_memory_item(settings, item_id)
    if row is None:
        raise HTTPException(status_code=404, detail="memory item not found")

    engine = create_sqlite_engine(settings)
    evidence_refs = row.get("evidence_refs_json") or []
    resolved_refs = []
    for ref_dict in evidence_refs:
        ref = EvidenceRef.from_dict(ref_dict)
        resolved = ref.resolve(engine)
        resolved_refs.append(resolved.as_dict())
    row["evidence_refs"] = resolved_refs

    return row


class UpdateMemoryItemRequest(BaseModel):
    title: str | None = None
    summary: str | None = None
    rule_text: str | None = None
    applicability: str | None = None
    invalidation: str | None = None
    symbols_json: list[str] | None = None
    tags_json: list[str] | None = None
    market_scope: str | None = None
    confidence: float | None = None
    updated_by: str = "human"


@knowledge_router.patch("/memory-items/{item_id}")
def update_memory_item_endpoint(
    request: Request,
    item_id: str,
    payload: UpdateMemoryItemRequest,
) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)
    updates = payload.model_dump(exclude_none=True, exclude={"updated_by"})
    item = update_memory_item(
        settings,
        item_id,
        updates,
        updated_by=payload.updated_by,
    )
    if item is None:
        raise HTTPException(status_code=404, detail="memory item not found")
    return item


@knowledge_router.post("/candidates/{candidate_id}/activate")
def activate_candidate_endpoint(request: Request, candidate_id: str) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)
    try:
        result = activate_candidate(settings, candidate_id)
    except ValueError as exc:
        _raise_candidate_http_error(exc)
    return {
        "memory_item_id": result.memory_item_id,
        "conflicts_found": result.conflicts_found,
    }


@knowledge_router.post("/candidates/{candidate_id}/reject")
def reject_candidate_endpoint(request: Request, candidate_id: str) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)
    try:
        return reject_candidate(settings, candidate_id)
    except ValueError as exc:
        _raise_candidate_http_error(exc)


class MergeRequest(BaseModel):
    target_memory_item_id: str


@knowledge_router.post("/candidates/{candidate_id}/merge")
def merge_candidate_endpoint(
    request: Request,
    candidate_id: str,
    payload: MergeRequest,
) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)
    try:
        return merge_candidate(settings, candidate_id, payload.target_memory_item_id)
    except ValueError as exc:
        _raise_candidate_http_error(exc)


class BatchRequest(BaseModel):
    candidate_ids: list[str]
    action: str


@knowledge_router.post("/candidates/batch")
def batch_candidates_endpoint(request: Request, payload: BatchRequest) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)
    if payload.action not in {"activate", "reject"}:
        raise HTTPException(status_code=422, detail="action must be activate or reject")
    result = batch_process(settings, payload.candidate_ids, payload.action)
    return {
        "activated": result.activated,
        "rejected": result.rejected,
        "skipped": result.skipped,
    }


@knowledge_router.post("/memory-items/{item_id}/deprecate")
def deprecate_memory_item_endpoint(request: Request, item_id: str) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)
    item = deprecate_memory_item(settings, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="memory item not found")
    return item


class MarkConflictRequest(BaseModel):
    conflicting_item_id: str


@knowledge_router.post("/memory-items/{item_id}/mark-conflict")
def mark_conflict_endpoint(
    request: Request,
    item_id: str,
    payload: MarkConflictRequest,
) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)
    if get_memory_item(settings, item_id) is None:
        raise HTTPException(status_code=404, detail="memory item not found")
    if get_memory_item(settings, payload.conflicting_item_id) is None:
        raise HTTPException(status_code=404, detail="conflicting memory item not found")
    mark_conflict(settings, item_id, payload.conflicting_item_id)
    return {
        "memory_item_id": item_id,
        "conflicting_item_id": payload.conflicting_item_id,
        "status": "conflicted",
    }


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
