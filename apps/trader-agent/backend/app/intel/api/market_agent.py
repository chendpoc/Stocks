from __future__ import annotations

import json
from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.intel.db.connection import get_intel_engine
from app.intel.db.schema import init_intel_db
from app.intel.ingestion.market_data import (
    get_mvp_market_status,
    get_symbol_market_status,
)
from app.intel.market_agent.context import SessionContextBootstrap
from app.intel.market_agent.features import compute_regime_from_bars
from app.intel.market_agent.market_data import (
    MarketDataService,
    evaluate_data_quality,
)
from app.intel.market_agent.monitor import MarketMonitorService
from app.intel.market_agent.patterns import FailureMemoryService, PatternMemoryService
from app.intel.market_agent.repositories import list_failure_memories
from app.intel.market_agent.schemas import PatternMemory


router = APIRouter()

_MARKET_AGENT_TABLES: tuple[str, ...] = (
    "feature_snapshots",
    "setup_events",
    "pattern_memories",
    "failure_memories",
    "session_context_packs",
)


class _MarketAgentContextBootstrapRequest(BaseModel):
    session_id: str | None = None
    profile: str | None = None
    symbol: str | None = None
    max_chars: int = 2400


class _MarketMonitorRunRequest(BaseModel):
    symbols: list[str]
    timeframes: list[str]
    limit: int = 20
    min_required: int | None = None
    allow_live_fallback: bool = False


class _PatternMemoryPromoteRequest(BaseModel):
    confirm: bool = False
    pattern_memory_id: str | None = Field(default=None, alias="pattern_memory_id")
    candidate_id: str | None = Field(default=None, alias="candidate_id")


class _PatternMemoryDegradeRequest(BaseModel):
    pattern_memory_id: str | None = Field(default=None, alias="pattern_memory_id")
    pattern_id: str | None = Field(default=None, alias="pattern_id")
    reason: str | None = None


def _resolve_session_id(
    *, session_id: str | None = None, profile: str | None = None
) -> str:
    if session_id is not None:
        return session_id
    if profile is not None:
        return profile
    return "default"


def _to_upper(value: str | None) -> str | None:
    return value.upper() if value else None


def _safe_json(raw: Any, default: Any) -> Any:
    if raw is None:
        return default
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return default
    return raw


def _pattern_memory_to_dict(memory: PatternMemory) -> dict[str, Any]:
    return {
        "pattern_memory_id": memory.pattern_memory_id,
        "symbol": memory.symbol,
        "pattern_id": memory.pattern_id,
        "confidence": memory.confidence,
        "memory_json": memory.memory_json,
        "evidence_refs_json": memory.evidence_refs_json,
        "created_at": memory.created_at,
    }


def _failure_to_dict(failure) -> dict[str, Any]:
    return {
        "failure_memory_id": failure.failure_memory_id,
        "symbol": failure.symbol,
        "failure_type": failure.failure_type,
        "failed_ts": failure.failed_ts,
        "failure_json": failure.failure_json,
        "context_json": failure.context_json,
        "created_at": failure.created_at,
    }


@router.post("/memory/init")
def init_market_agent_memory(request: Request) -> dict[str, Any]:
    settings = request.app.state.settings
    with init_intel_db(settings).connect() as conn:
        table_names = [
            row[0]
            for row in conn.execute(
                text("SELECT name FROM sqlite_master WHERE type = 'table'")
            ).fetchall()
        ]
    known_tables = [name for name in _MARKET_AGENT_TABLES if name in set(table_names)]
    return {
        "status": "ok",
        "table_names": known_tables,
    }


@router.post("/context/bootstrap")
def bootstrap_context(
    request: Request, payload: _MarketAgentContextBootstrapRequest
) -> dict[str, Any]:
    settings = request.app.state.settings
    engine = get_intel_engine(settings)
    session_id = _resolve_session_id(
        session_id=payload.session_id,
        profile=payload.profile,
    )
    bootstrap = SessionContextBootstrap(engine)
    result = bootstrap.bootstrap(
        session_id=session_id,
        symbol=_to_upper(payload.symbol),
        max_chars=payload.max_chars,
    )
    return asdict(result)


@router.get("/context/latest")
def latest_context_pack(
    request: Request,
    session_id: str | None = None,
    profile: str | None = None,
    symbol: str | None = None,
) -> dict[str, Any]:
    settings = request.app.state.settings
    engine = get_intel_engine(settings)
    resolved_session = _resolve_session_id(session_id=session_id, profile=profile)
    bootstrap = SessionContextBootstrap(engine)
    result = bootstrap.latest(session_id=resolved_session, symbol=_to_upper(symbol))
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"no context pack found for session_id={resolved_session}",
        )
    return asdict(result)


@router.get("/pattern-memory")
def list_pattern_memory(
    request: Request,
    symbol: str | None = None,
    pattern_id: str | None = None,
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
) -> dict[str, Any]:
    engine = get_intel_engine(request.app.state.settings)
    service = PatternMemoryService(engine)
    items = service.list(symbol=_to_upper(symbol), pattern_id=pattern_id, status=status, limit=limit)
    return {
        "items": [_pattern_memory_to_dict(item) for item in items],
        "count": len(items),
    }


def _fetch_pattern_memory(engine, pattern_memory_id: str) -> PatternMemory:
    with engine.connect() as conn:
        row = (
            conn.execute(
                text(
                    """
                    SELECT * FROM pattern_memories
                    WHERE pattern_memory_id = :id
                    """
                ),
                {"id": pattern_memory_id},
            )
            .mappings()
            .fetchone()
        )
    if row is None:
        raise HTTPException(
            status_code=404,
            detail=f"pattern_memory not found: {pattern_memory_id}",
        )
    return PatternMemory.from_db_row(dict(row))


def _fetch_candidate_row(engine, candidate_id: str) -> dict[str, Any]:
    with engine.connect() as conn:
        row = (
            conn.execute(
                text(
                    """
                    SELECT * FROM insight_candidates WHERE insight_id = :id
                    """
                ),
                {"id": candidate_id},
            )
            .mappings()
            .fetchone()
        )
    if row is None:
        raise HTTPException(
            status_code=404,
            detail=f"candidate not found: {candidate_id}",
        )
    return dict(row)


@router.post("/pattern-memory/promote")
def promote_pattern_memory(
    request: Request, payload: _PatternMemoryPromoteRequest
) -> dict[str, Any]:
    if payload.pattern_memory_id is None and payload.candidate_id is None:
        raise HTTPException(status_code=400, detail="pattern_memory_id or candidate_id required")
    if payload.pattern_memory_id is not None and payload.candidate_id is not None:
        raise HTTPException(
            status_code=400,
            detail="provide only one of pattern_memory_id or candidate_id",
        )
    if not payload.confirm:
        raise HTTPException(
            status_code=400,
            detail="confirm must be true to promote pattern memory",
        )

    engine = get_intel_engine(request.app.state.settings)
    service = PatternMemoryService(engine)
    if payload.pattern_memory_id:
        base = _fetch_pattern_memory(engine, payload.pattern_memory_id)
        promoted = service.promote(base, confirm=True)
        return {"item": _pattern_memory_to_dict(promoted)}

    candidate = _fetch_candidate_row(engine, payload.candidate_id)
    symbols = _safe_json(candidate.get("symbols_json"), [])
    if not isinstance(symbols, list) or not symbols:
        raise HTTPException(
            status_code=400,
            detail="candidate requires symbols_json with at least one symbol",
        )
    symbol = str(symbols[0]).upper()
    evidence_refs = _safe_json(candidate.get("evidence_refs_json"), [])
    candidate_json = _safe_json(candidate.get("candidate_json"), {})
    if not isinstance(candidate_json, dict):
        candidate_json = {}
    promoted = service.promote_from_candidate(
        candidate_id=str(candidate["insight_id"]),
        symbol=symbol,
        thesis=candidate.get("thesis"),
        confidence=float(candidate["weight_cap"])
        if candidate.get("weight_cap") is not None
        else None,
        candidate_json=candidate_json,
        evidence_refs=evidence_refs if isinstance(evidence_refs, list) else [],
        confirm=True,
    )
    return {"item": _pattern_memory_to_dict(promoted)}


@router.post("/pattern-memory/degrade")
def degrade_pattern_memory(
    request: Request, payload: _PatternMemoryDegradeRequest
) -> dict[str, Any]:
    if payload.pattern_memory_id is None and payload.pattern_id is None:
        raise HTTPException(status_code=400, detail="pattern_memory_id or pattern_id required")
    if payload.pattern_memory_id is not None and payload.pattern_id is not None:
        raise HTTPException(
            status_code=400,
            detail="provide only one of pattern_memory_id or pattern_id",
        )

    engine = get_intel_engine(request.app.state.settings)
    service = PatternMemoryService(engine)
    if payload.pattern_memory_id is not None:
        base = _fetch_pattern_memory(engine, payload.pattern_memory_id)
    else:
        items = service.list(pattern_id=payload.pattern_id, limit=1)
        if not items:
            raise HTTPException(
                status_code=404,
                detail=f"pattern_memory not found for pattern_id={payload.pattern_id}",
            )
        base = items[0]
    degraded = service.degrade(base, reason=payload.reason)
    return {"item": _pattern_memory_to_dict(degraded)}


@router.get("/failure-memory")
def list_failure_memory(
    request: Request,
    symbol: str | None = None,
    failure_type: str | None = None,
    setup: str | None = None,
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
) -> dict[str, Any]:
    engine = get_intel_engine(request.app.state.settings)
    status_value = status.lower() if status else None
    if status is None or status_value == "active_warning":
        service = FailureMemoryService(engine)
        items = service.list_active_warnings(
            symbol=_to_upper(symbol),
            failure_type=failure_type,
            setup_name=setup,
            limit=limit,
        )
    else:
        items = list_failure_memories(
            engine,
            symbol=_to_upper(symbol),
            failure_type=failure_type,
            status_values=(status_value,),
            setup_name=setup,
            limit=limit,
        )
    return {"items": [_failure_to_dict(item) for item in items], "count": len(items)}


@router.post("/market-monitor/run")
def run_market_monitor(request: Request, payload: _MarketMonitorRunRequest) -> dict[str, Any]:
    settings = request.app.state.settings
    engine = get_intel_engine(settings)
    service = MarketMonitorService(
        engine,
        market_data_service=MarketDataService(engine, settings=settings),
    )
    results = []
    for symbol in payload.symbols:
        for timeframe in payload.timeframes:
            result = service.run_symbol(
                symbol,
                timeframe=timeframe,
                limit=payload.limit,
                min_required=payload.min_required,
                allow_live_fallback=payload.allow_live_fallback,
            )
            results.append(asdict(result))
    return {"results": results, "count": len(results)}


@router.get("/market-data/fetch")
def fetch_market_data(
    request: Request,
    symbol: str,
    timeframe: str = "1d",
    limit: int = Query(default=20, ge=1, le=500),
    min_required: int | None = None,
    allow_live_fallback: bool = False,
) -> dict[str, Any]:
    settings = request.app.state.settings
    engine = get_intel_engine(settings)
    service = MarketDataService(engine, settings=settings)
    data = service.get_market_data(
        symbol,
        timeframe,
        limit=limit,
        min_required=min_required,
        allow_live_fallback=allow_live_fallback,
    )
    return asdict(data)


@router.get("/market-data/health")
def market_data_health(
    request: Request,
    symbol: str | None = None,
) -> dict[str, Any]:
    engine = get_intel_engine(request.app.state.settings)
    if symbol:
        return get_symbol_market_status(engine, symbol)
    return get_mvp_market_status(engine)


@router.get("/market-data/quality")
def market_data_quality(
    request: Request,
    symbol: str,
    timeframe: str = "1d",
    limit: int = Query(default=20, ge=1, le=500),
    min_required: int | None = None,
) -> dict[str, Any]:
    settings = request.app.state.settings
    engine = get_intel_engine(settings)
    service = MarketDataService(engine, settings=settings)
    bars_payload = service.get_market_data(
        symbol,
        timeframe,
        limit=limit,
        min_required=min_required,
        allow_live_fallback=False,
    )
    quality = evaluate_data_quality(
        bars_payload.bars,
        timeframe=bars_payload.timeframe,
        min_required=min_required,
    )
    return {
        "status": bars_payload.quality_status,
        "reason": bars_payload.quality_reason,
        "bar_count": bars_payload.bar_count,
        "min_required": quality.min_required,
    }


@router.get("/regime")
def market_agent_regime(
    request: Request,
    benchmark: str = "SPY",
    lookback: int = Query(default=20, ge=14, le=100),
) -> dict[str, Any]:
    """获取当前市场状态（trending/ranging/volatile）。

    从 market_bars 读取 benchmark（默认 SPY）的日线数据，
    计算 ADX / MA20 / 布林带宽度等指标，输出 RegimeResult。
    Agent 通过 fetchRegime 工具调用此端点。
    """
    from dataclasses import asdict as _dataclass_asdict

    settings = request.app.state.settings
    engine = get_intel_engine(settings)
    service = MarketDataService(engine, settings=settings)

    bars_payload = service.get_market_data(
        benchmark,
        "1d",
        limit=lookback,
        min_required=14,
        allow_live_fallback=False,
    )

    if bars_payload.quality_status == "blocked":
        return {
            "state": "ranging",
            "confidence": 0.10,
            "indicators": {},
            "transition_risk": 0.80,
            "source": bars_payload.quality_reason,
        }

    # 尝试获取 VIX 作为补充指标
    vix_value: float | None = None
    try:
        vix_payload = service.get_market_data(
            "VIX",
            "1d",
            limit=1,
            min_required=1,
            allow_live_fallback=False,
        )
        if vix_payload.bars:
            vix_value = float(vix_payload.bars[-1]["close"])
    except Exception:
        pass

    result = compute_regime_from_bars(
        bars_payload.bars,
        vix_value=vix_value,
    )

    return {
        "state": result.state,
        "confidence": result.confidence,
        "indicators": result.indicators,
        "transition_risk": result.transition_risk,
    }
