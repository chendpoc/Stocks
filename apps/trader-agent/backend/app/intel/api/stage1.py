from __future__ import annotations

from typing import Any
from uuid import uuid4
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.core.time import utc_now_iso
from app.intel.db.connection import get_intel_engine
from app.intel.schemas.stage1_records import (
    ContextSnapshotListOut,
    ContextSnapshotOut,
    DecisionOutcomeListOut,
    DecisionOutcomeOut,
    EvaluationReportListOut,
    EvaluationReportOut,
    InsightCandidateListOut,
    InsightCandidateOut,
    ModelDecisionListOut,
    ModelDecisionOut,
    InsightCandidateOutcomeListOut,
    InsightCandidateOutcomeOut,
    WeightingPolicyStatsListOut,
    WeightingPolicyStatsOut,
)
from app.modules.json_row_codec import (
    canonical_json_text,
    deserialize_json_fields_in_row,
    serialize_json_field,
    serialize_json_field_optional,
)

router = APIRouter()

_FINAL_OUTCOME_STATUSES = frozenset({"labeled", "skipped", "failed"})
_VALID_RECOMMENDATIONS = frozenset({"hold", "needs_more_data"})
_VALID_INSIGHT_HORIZONS = frozenset({"1m", "2m", "5m", "30m", "1h", "2h", "4h"})


def _compute_due_at(scheduled_at: str, horizon: str) -> str:
    """Compute due_at from scheduled_at + horizon. Raises ValueError if horizon is unknown."""
    dt = datetime.fromisoformat(scheduled_at.replace("Z", "+00:00"))
    mapping: dict[str, timedelta] = {
        "1m": timedelta(minutes=1),
        "2m": timedelta(minutes=2),
        "5m": timedelta(minutes=5),
        "30m": timedelta(minutes=30),
        "1h": timedelta(hours=1),
        "2h": timedelta(hours=2),
        "4h": timedelta(hours=4),
    }
    if horizon not in mapping:
        raise ValueError(f"unsupported horizon: {horizon}")
    due = dt + mapping[horizon]
    return due.isoformat()


def _canonical_json(value: Any) -> str:
    return canonical_json_text(value)


def _conflict_if_different(existing: str | None, incoming: str, field: str) -> None:
    if existing is None:
        return
    if _canonical_json(existing) != _canonical_json(incoming):
        raise HTTPException(
            status_code=409,
            detail=f"immutable {field} conflict for existing record",
        )


def _conflict_scalar(existing: Any, incoming: Any, field: str) -> None:
    if existing is None and incoming is None:
        return
    if str(existing) != str(incoming):
        raise HTTPException(
            status_code=409,
            detail=f"immutable {field} conflict for existing record",
        )


class ContextSnapshotInput(BaseModel):
    snapshot_id: str
    symbol: str
    asof_ts: str
    context_version: str | None = None
    items_json: Any
    evidence_refs_json: Any = Field(default_factory=list)
    weighting_policy_version: str | None = None
    context_hash: str


class ModelDecisionInput(BaseModel):
    decision_id: str
    run_id: str | None = None
    snapshot_id: str
    symbol: str
    model_provider: str | None = None
    model_name: str | None = None
    model_version: str | None = None
    action: str
    confidence: float | None = None
    uncertainty: float | None = None
    decision_json: Any
    status: str = "active"


class HumanOverrideInput(BaseModel):
    override: dict[str, Any]
    reason: str | None = None
    actor: str = "human"


class OutcomeScheduleItem(BaseModel):
    outcome_id: str | None = None
    decision_id: str
    symbol: str
    horizon: str
    path: str = "model_path"
    due_at: str | None = None


class OutcomeScheduleInput(BaseModel):
    outcomes: list[OutcomeScheduleItem]


class OutcomeLabelInput(BaseModel):
    status: str
    reference_price: float | None = None
    future_price: float | None = None
    absolute_return_pct: float | None = None
    benchmark_symbol: str | None = None
    benchmark_return_pct: float | None = None
    relative_return_pct: float | None = None
    hit_invalidation_proxy: bool | None = None
    hit_target_proxy: bool | None = None
    label: str | None = None
    outcome_json: Any = None


class InsightCandidateInput(BaseModel):
    insight_id: str
    run_id: str | None = None
    symbols_json: list[str]
    window_start: str | None = None
    window_end: str | None = None
    thesis: str | None = None
    evidence_refs_json: Any = Field(default_factory=list)
    verification_status: str = "pending"
    weight_cap: float | None = None
    candidate_json: Any


class EvaluationReportInput(BaseModel):
    report_id: str
    model_version: str
    window_start: str | None = None
    window_end: str | None = None
    metrics_json: Any = None
    recommendation: str
    report_json: Any


class InsightCandidateOutcomeScheduleItem(BaseModel):
    outcome_id: str | None = None
    insight_id: str
    symbol: str
    horizon: str
    evidence_refs_json: Any = Field(default_factory=list)
    reason_codes_json: Any = Field(default_factory=list)
    outcome_json: Any = None


class InsightCandidateOutcomeScheduleInput(BaseModel):
    outcomes: list[InsightCandidateOutcomeScheduleItem]


class InsightCandidateOutcomeLabelInput(BaseModel):
    status: str
    normalized_label: str | None = None
    reason_codes_json: Any = None
    outcome_json: Any = None


class WeightingPolicyStatsInput(BaseModel):
    policy_version: str
    source_key: str
    stats_json: Any


def _fetch_one(conn, sql: str, params: dict) -> dict | None:
    row = conn.execute(text(sql), params).mappings().fetchone()
    return dict(row) if row else None


def _fetch_many(conn, sql: str, params: dict) -> list[dict]:
    return [dict(r) for r in conn.execute(text(sql), params).mappings().fetchall()]


@router.post("/context-snapshots", response_model=ContextSnapshotOut)
def create_context_snapshot(
    request: Request, payload: ContextSnapshotInput
) -> ContextSnapshotOut:
    engine = get_intel_engine(request.app.state.settings)
    sym = payload.symbol.upper()
    items = serialize_json_field(payload.items_json)
    evidence = serialize_json_field(payload.evidence_refs_json)
    now = utc_now_iso()

    with engine.begin() as conn:
        existing = _fetch_one(
            conn,
            "SELECT * FROM context_snapshots WHERE snapshot_id = :id",
            {"id": payload.snapshot_id},
        )
        if existing:
            _conflict_if_different(existing["context_hash"], payload.context_hash, "context_hash")
            _conflict_if_different(existing["items_json"], items, "items_json")
            _conflict_scalar(existing["symbol"], sym, "symbol")
            _conflict_scalar(existing["asof_ts"], payload.asof_ts, "asof_ts")
            _conflict_scalar(
                existing.get("context_version"), payload.context_version, "context_version"
            )
            _conflict_if_different(
                existing["evidence_refs_json"], evidence, "evidence_refs_json"
            )
            _conflict_scalar(
                existing.get("weighting_policy_version"),
                payload.weighting_policy_version,
                "weighting_policy_version",
            )
            return ContextSnapshotOut.from_db_row(existing)

        by_hash = _fetch_one(
            conn,
            "SELECT * FROM context_snapshots WHERE context_hash = :h",
            {"h": payload.context_hash},
        )
        if by_hash:
            return ContextSnapshotOut.from_db_row(by_hash)

        conn.execute(
            text(
                """
                INSERT INTO context_snapshots
                (snapshot_id, symbol, asof_ts, context_version, items_json,
                 evidence_refs_json, weighting_policy_version, context_hash, created_at)
                VALUES (:snapshot_id, :symbol, :asof_ts, :context_version, :items_json,
                        :evidence_refs_json, :weighting_policy_version, :context_hash, :created_at)
                """
            ),
            {
                "snapshot_id": payload.snapshot_id,
                "symbol": sym,
                "asof_ts": payload.asof_ts,
                "context_version": payload.context_version,
                "items_json": items,
                "evidence_refs_json": evidence,
                "weighting_policy_version": payload.weighting_policy_version,
                "context_hash": payload.context_hash,
                "created_at": now,
            },
        )
        inserted = _fetch_one(
            conn,
            "SELECT * FROM context_snapshots WHERE snapshot_id = :id",
            {"id": payload.snapshot_id},
        )
        return ContextSnapshotOut.from_db_row(inserted)


@router.get("/context-snapshots/{snapshot_id}", response_model=ContextSnapshotOut)
def get_context_snapshot(request: Request, snapshot_id: str) -> ContextSnapshotOut:
    engine = get_intel_engine(request.app.state.settings)
    with engine.connect() as conn:
        row = _fetch_one(
            conn,
            "SELECT * FROM context_snapshots WHERE snapshot_id = :id",
            {"id": snapshot_id},
        )
    if not row:
        raise HTTPException(status_code=404, detail="context snapshot not found")
    return ContextSnapshotOut.from_db_row(row)


@router.get("/context-snapshots", response_model=ContextSnapshotListOut)
def list_context_snapshots(
    request: Request,
    symbol: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
) -> ContextSnapshotListOut:
    engine = get_intel_engine(request.app.state.settings)
    params: dict[str, Any] = {"limit": limit}
    where = ""
    if symbol:
        where = "WHERE symbol = :symbol"
        params["symbol"] = symbol.upper()
    with engine.connect() as conn:
        rows = _fetch_many(
            conn,
            f"""
            SELECT * FROM context_snapshots
            {where}
            ORDER BY created_at DESC
            LIMIT :limit
            """,
            params,
        )
    return ContextSnapshotListOut(
        items=[ContextSnapshotOut.from_db_row(row) for row in rows],
        count=len(rows),
    )


@router.post("/model-decisions", response_model=ModelDecisionOut)
def create_model_decision(request: Request, payload: ModelDecisionInput) -> ModelDecisionOut:
    engine = get_intel_engine(request.app.state.settings)
    sym = payload.symbol.upper()
    decision_json = serialize_json_field(payload.decision_json)
    now = utc_now_iso()

    with engine.begin() as conn:
        existing = _fetch_one(
            conn,
            "SELECT * FROM model_decisions WHERE decision_id = :id",
            {"id": payload.decision_id},
        )
        if existing:
            _conflict_if_different(existing["decision_json"], decision_json, "decision_json")
            _conflict_scalar(existing.get("run_id"), payload.run_id, "run_id")
            _conflict_scalar(existing["snapshot_id"], payload.snapshot_id, "snapshot_id")
            _conflict_scalar(existing["symbol"], sym, "symbol")
            _conflict_scalar(
                existing.get("model_provider"), payload.model_provider, "model_provider"
            )
            _conflict_scalar(existing.get("model_name"), payload.model_name, "model_name")
            _conflict_scalar(existing.get("model_version"), payload.model_version, "model_version")
            _conflict_scalar(existing["action"], payload.action, "action")
            _conflict_scalar(existing.get("confidence"), payload.confidence, "confidence")
            _conflict_scalar(existing.get("uncertainty"), payload.uncertainty, "uncertainty")
            _conflict_scalar(existing.get("status"), payload.status, "status")
            return ModelDecisionOut.from_db_row(existing)

        conn.execute(
            text(
                """
                INSERT INTO model_decisions
                (decision_id, run_id, snapshot_id, symbol, model_provider, model_name,
                 model_version, action, confidence, uncertainty, decision_json,
                 human_overrides_json, status, created_at)
                VALUES (:decision_id, :run_id, :snapshot_id, :symbol, :model_provider,
                        :model_name, :model_version, :action, :confidence, :uncertainty,
                        :decision_json, '[]', :status, :created_at)
                """
            ),
            {
                "decision_id": payload.decision_id,
                "run_id": payload.run_id,
                "snapshot_id": payload.snapshot_id,
                "symbol": sym,
                "model_provider": payload.model_provider,
                "model_name": payload.model_name,
                "model_version": payload.model_version,
                "action": payload.action,
                "confidence": payload.confidence,
                "uncertainty": payload.uncertainty,
                "decision_json": decision_json,
                "status": payload.status,
                "created_at": now,
            },
        )
        inserted = _fetch_one(
            conn,
            "SELECT * FROM model_decisions WHERE decision_id = :id",
            {"id": payload.decision_id},
        )
        return ModelDecisionOut.from_db_row(inserted)


@router.get("/model-decisions/{decision_id}", response_model=ModelDecisionOut)
def get_model_decision(request: Request, decision_id: str) -> ModelDecisionOut:
    engine = get_intel_engine(request.app.state.settings)
    with engine.connect() as conn:
        row = _fetch_one(
            conn,
            "SELECT * FROM model_decisions WHERE decision_id = :id",
            {"id": decision_id},
        )
    if not row:
        raise HTTPException(status_code=404, detail="model decision not found")
    return ModelDecisionOut.from_db_row(row)


@router.get("/model-decisions", response_model=ModelDecisionListOut)
def list_model_decisions(
    request: Request,
    symbol: str | None = None,
    model_version: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
) -> ModelDecisionListOut:
    engine = get_intel_engine(request.app.state.settings)
    clauses: list[str] = []
    params: dict[str, Any] = {"limit": limit}
    if symbol:
        clauses.append("symbol = :symbol")
        params["symbol"] = symbol.upper()
    if model_version:
        clauses.append("model_version = :model_version")
        params["model_version"] = model_version
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with engine.connect() as conn:
        rows = _fetch_many(
            conn,
            f"""
            SELECT * FROM model_decisions
            {where}
            ORDER BY created_at DESC
            LIMIT :limit
            """,
            params,
        )
    return ModelDecisionListOut(
        items=[ModelDecisionOut.from_db_row(row) for row in rows],
        count=len(rows),
    )


@router.post("/model-decisions/{decision_id}/human-overrides", response_model=ModelDecisionOut)
def append_human_override(
    request: Request, decision_id: str, payload: HumanOverrideInput
) -> ModelDecisionOut:
    engine = get_intel_engine(request.app.state.settings)
    now = utc_now_iso()
    entry = {
        "override": payload.override,
        "reason": payload.reason,
        "actor": payload.actor,
        "ts": now,
    }

    with engine.begin() as conn:
        row = _fetch_one(
            conn,
            "SELECT human_overrides_json FROM model_decisions WHERE decision_id = :id",
            {"id": decision_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="model decision not found")
        decoded = deserialize_json_fields_in_row(
            row,
            ("human_overrides_json",),
            defaults={"human_overrides_json": []},
        )
        overrides = decoded["human_overrides_json"]
        if not isinstance(overrides, list):
            overrides = []
        overrides.append(entry)
        conn.execute(
            text(
                """
                UPDATE model_decisions
                SET human_overrides_json = :overrides
                WHERE decision_id = :id
                """
            ),
            {"overrides": serialize_json_field(overrides), "id": decision_id},
        )
        updated = _fetch_one(
            conn,
            "SELECT * FROM model_decisions WHERE decision_id = :id",
            {"id": decision_id},
        )
        return ModelDecisionOut.from_db_row(updated)


@router.post("/decision-outcomes/schedule", response_model=DecisionOutcomeListOut)
def schedule_decision_outcomes(
    request: Request, payload: OutcomeScheduleInput
) -> DecisionOutcomeListOut:
    engine = get_intel_engine(request.app.state.settings)
    now = utc_now_iso()
    created: list[DecisionOutcomeOut] = []

    with engine.begin() as conn:
        for item in payload.outcomes:
            outcome_id = item.outcome_id or str(uuid4())
            sym = item.symbol.upper()
            existing = _fetch_one(
                conn,
                """
                SELECT * FROM decision_outcomes
                WHERE decision_id = :decision_id AND horizon = :horizon AND path = :path
                """,
                {
                    "decision_id": item.decision_id,
                    "horizon": item.horizon,
                    "path": item.path,
                },
            )
            if existing:
                due_mismatch = (existing.get("due_at") or None) != item.due_at
                outcome_id_mismatch = (
                    item.outcome_id is not None and existing["outcome_id"] != item.outcome_id
                )
                if existing["symbol"].upper() != sym or due_mismatch or outcome_id_mismatch:
                    raise HTTPException(
                        status_code=409,
                        detail="decision outcome schedule conflict",
                    )
                created.append(DecisionOutcomeOut.from_db_row(existing))
                continue

            conn.execute(
                text(
                    """
                    INSERT INTO decision_outcomes
                    (outcome_id, decision_id, symbol, horizon, path, status,
                     due_at, scheduled_at, created_at, updated_at)
                    VALUES (:outcome_id, :decision_id, :symbol, :horizon, :path, 'pending',
                            :due_at, :scheduled_at, :created_at, :updated_at)
                    """
                ),
                {
                    "outcome_id": outcome_id,
                    "decision_id": item.decision_id,
                    "symbol": sym,
                    "horizon": item.horizon,
                    "path": item.path,
                    "due_at": item.due_at,
                    "scheduled_at": now,
                    "created_at": now,
                    "updated_at": now,
                },
            )
            row = _fetch_one(
                conn,
                "SELECT * FROM decision_outcomes WHERE outcome_id = :id",
                {"id": outcome_id},
            )
            if row:
                created.append(DecisionOutcomeOut.from_db_row(row))
    return DecisionOutcomeListOut(items=created, count=len(created))


@router.get("/decision-outcomes/due", response_model=DecisionOutcomeListOut)
def list_due_decision_outcomes(
    request: Request,
    now: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    symbol: str | None = None,
) -> DecisionOutcomeListOut:
    engine = get_intel_engine(request.app.state.settings)
    asof = now or utc_now_iso()
    params: dict[str, Any] = {"asof": asof, "limit": limit}
    where = "status = 'pending' AND (due_at IS NULL OR due_at <= :asof)"
    if symbol:
        where += " AND symbol = :symbol"
        params["symbol"] = symbol.upper()
    with engine.connect() as conn:
        rows = _fetch_many(
            conn,
            f"""
            SELECT * FROM decision_outcomes
            WHERE {where}
            ORDER BY due_at IS NULL, due_at ASC, created_at ASC
            LIMIT :limit
            """,
            params,
        )
    return DecisionOutcomeListOut(
        items=[DecisionOutcomeOut.from_db_row(row) for row in rows],
        count=len(rows),
    )


@router.post("/decision-outcomes/{outcome_id}/label", response_model=DecisionOutcomeOut)
def label_decision_outcome(
    request: Request, outcome_id: str, payload: OutcomeLabelInput
) -> DecisionOutcomeOut:
    if payload.status not in _FINAL_OUTCOME_STATUSES:
        raise HTTPException(status_code=422, detail="status must be labeled, skipped, or failed")

    engine = get_intel_engine(request.app.state.settings)
    now = utc_now_iso()

    with engine.begin() as conn:
        row = _fetch_one(
            conn,
            "SELECT * FROM decision_outcomes WHERE outcome_id = :id",
            {"id": outcome_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="decision outcome not found")
        if row["status"] in _FINAL_OUTCOME_STATUSES:
            raise HTTPException(status_code=409, detail="outcome already finalized")
        if row["status"] != "pending":
            raise HTTPException(status_code=400, detail="only pending outcomes can be labeled")

        conn.execute(
            text(
                """
                UPDATE decision_outcomes SET
                  status = :status,
                  reference_price = :reference_price,
                  future_price = :future_price,
                  absolute_return_pct = :absolute_return_pct,
                  benchmark_symbol = :benchmark_symbol,
                  benchmark_return_pct = :benchmark_return_pct,
                  relative_return_pct = :relative_return_pct,
                  hit_invalidation_proxy = :hit_invalidation_proxy,
                  hit_target_proxy = :hit_target_proxy,
                  label = :label,
                  outcome_json = :outcome_json,
                  updated_at = :updated_at,
                  labeled_at = :labeled_at
                WHERE outcome_id = :outcome_id
                """
            ),
            {
                "status": payload.status,
                "reference_price": payload.reference_price,
                "future_price": payload.future_price,
                "absolute_return_pct": payload.absolute_return_pct,
                "benchmark_symbol": payload.benchmark_symbol,
                "benchmark_return_pct": payload.benchmark_return_pct,
                "relative_return_pct": payload.relative_return_pct,
                "hit_invalidation_proxy": (
                    1 if payload.hit_invalidation_proxy else 0
                    if payload.hit_invalidation_proxy is not None
                    else None
                ),
                "hit_target_proxy": (
                    1 if payload.hit_target_proxy else 0
                    if payload.hit_target_proxy is not None
                    else None
                ),
                "label": payload.label,
                "outcome_json": serialize_json_field_optional(payload.outcome_json),
                "updated_at": now,
                "labeled_at": now,
                "outcome_id": outcome_id,
            },
        )
        updated = _fetch_one(
            conn,
            "SELECT * FROM decision_outcomes WHERE outcome_id = :id",
            {"id": outcome_id},
        )
        return DecisionOutcomeOut.from_db_row(updated)


@router.get("/decision-outcomes", response_model=DecisionOutcomeListOut)
def list_decision_outcomes(
    request: Request,
    decision_id: str | None = None,
    symbol: str | None = None,
    status: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
) -> DecisionOutcomeListOut:
    engine = get_intel_engine(request.app.state.settings)
    clauses: list[str] = []
    params: dict[str, Any] = {"limit": limit}
    if decision_id:
        clauses.append("decision_id = :decision_id")
        params["decision_id"] = decision_id
    if symbol:
        clauses.append("symbol = :symbol")
        params["symbol"] = symbol.upper()
    if status:
        clauses.append("status = :status")
        params["status"] = status
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with engine.connect() as conn:
        rows = _fetch_many(
            conn,
            f"""
            SELECT * FROM decision_outcomes
            {where}
            ORDER BY created_at DESC
            LIMIT :limit
            """,
            params,
        )
    return DecisionOutcomeListOut(
        items=[DecisionOutcomeOut.from_db_row(row) for row in rows],
        count=len(rows),
    )


@router.post("/insight-candidates", response_model=InsightCandidateOut)
def create_insight_candidate(
    request: Request, payload: InsightCandidateInput
) -> InsightCandidateOut:
    engine = get_intel_engine(request.app.state.settings)
    symbols = serialize_json_field(payload.symbols_json)
    evidence = serialize_json_field(payload.evidence_refs_json)
    candidate = serialize_json_field(payload.candidate_json)
    now = utc_now_iso()

    with engine.begin() as conn:
        existing = _fetch_one(
            conn,
            "SELECT * FROM insight_candidates WHERE insight_id = :id",
            {"id": payload.insight_id},
        )
        if existing:
            _conflict_if_different(existing["candidate_json"], candidate, "candidate_json")
            _conflict_scalar(existing.get("run_id"), payload.run_id, "run_id")
            _conflict_if_different(existing["symbols_json"], symbols, "symbols_json")
            _conflict_scalar(existing.get("window_start"), payload.window_start, "window_start")
            _conflict_scalar(existing.get("window_end"), payload.window_end, "window_end")
            _conflict_scalar(existing.get("thesis"), payload.thesis, "thesis")
            _conflict_if_different(
                existing["evidence_refs_json"], evidence, "evidence_refs_json"
            )
            _conflict_scalar(
                existing.get("verification_status"),
                payload.verification_status,
                "verification_status",
            )
            _conflict_scalar(existing.get("weight_cap"), payload.weight_cap, "weight_cap")
            return InsightCandidateOut.from_db_row(existing)

        conn.execute(
            text(
                """
                INSERT INTO insight_candidates
                (insight_id, run_id, symbols_json, window_start, window_end, thesis,
                 evidence_refs_json, verification_status, weight_cap, candidate_json, created_at)
                VALUES (:insight_id, :run_id, :symbols_json, :window_start, :window_end,
                        :thesis, :evidence_refs_json, :verification_status, :weight_cap,
                        :candidate_json, :created_at)
                """
            ),
            {
                "insight_id": payload.insight_id,
                "run_id": payload.run_id,
                "symbols_json": symbols,
                "window_start": payload.window_start,
                "window_end": payload.window_end,
                "thesis": payload.thesis,
                "evidence_refs_json": evidence,
                "verification_status": payload.verification_status,
                "weight_cap": payload.weight_cap,
                "candidate_json": candidate,
                "created_at": now,
            },
        )
        inserted = _fetch_one(
            conn,
            "SELECT * FROM insight_candidates WHERE insight_id = :id",
            {"id": payload.insight_id},
        )
        return InsightCandidateOut.from_db_row(inserted)


@router.get("/insight-candidates/{insight_id}", response_model=InsightCandidateOut)
def get_insight_candidate(request: Request, insight_id: str) -> InsightCandidateOut:
    engine = get_intel_engine(request.app.state.settings)
    with engine.connect() as conn:
        row = _fetch_one(
            conn,
            "SELECT * FROM insight_candidates WHERE insight_id = :id",
            {"id": insight_id},
        )
    if not row:
        raise HTTPException(status_code=404, detail="insight candidate not found")
    return InsightCandidateOut.from_db_row(row)


@router.get("/insight-candidates", response_model=InsightCandidateListOut)
def list_insight_candidates(
    request: Request,
    symbol: str | None = None,
    verification_status: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
) -> InsightCandidateListOut:
    engine = get_intel_engine(request.app.state.settings)
    clauses: list[str] = []
    params: dict[str, Any] = {"limit": limit}
    if verification_status:
        clauses.append("verification_status = :verification_status")
        params["verification_status"] = verification_status
    if symbol:
        clauses.append("symbols_json LIKE :symbol_like")
        params["symbol_like"] = f'%"{symbol.upper()}"%'
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with engine.connect() as conn:
        rows = _fetch_many(
            conn,
            f"""
            SELECT * FROM insight_candidates
            {where}
            ORDER BY created_at DESC
            LIMIT :limit
            """,
            params,
        )
    return InsightCandidateListOut(
        items=[InsightCandidateOut.from_db_row(row) for row in rows],
        count=len(rows),
    )


# --- insight candidate outcomes ---


@router.post("/insight-candidate-outcomes/schedule", response_model=InsightCandidateOutcomeListOut)
def schedule_insight_candidate_outcomes(
    request: Request, payload: InsightCandidateOutcomeScheduleInput
) -> InsightCandidateOutcomeListOut:
    engine = get_intel_engine(request.app.state.settings)
    now = utc_now_iso()
    created: list[InsightCandidateOutcomeOut] = []

    with engine.begin() as conn:
        for item in payload.outcomes:
            if item.horizon not in _VALID_INSIGHT_HORIZONS:
                raise HTTPException(
                    status_code=422,
                    detail=f"horizon must be one of {sorted(_VALID_INSIGHT_HORIZONS)}",
                )

            outcome_id = item.outcome_id or str(uuid4())
            sym = item.symbol.upper()
            due_at = _compute_due_at(now, item.horizon)

            existing = _fetch_one(
                conn,
                """
                SELECT * FROM insight_candidate_outcomes
                WHERE insight_id = :insight_id AND horizon = :horizon
                """,
                {
                    "insight_id": item.insight_id,
                    "horizon": item.horizon,
                },
            )
            if existing:
                _conflict_scalar(existing["symbol"], sym, "symbol")
                outcome_id_incoming = item.outcome_id
                if outcome_id_incoming is not None and existing["outcome_id"] != outcome_id_incoming:
                    raise HTTPException(
                        status_code=409,
                        detail="insight candidate outcome schedule conflict",
                    )
                created.append(InsightCandidateOutcomeOut.from_db_row(existing))
                continue

            evidence = serialize_json_field(item.evidence_refs_json)
            reason_codes = serialize_json_field(item.reason_codes_json)
            outcome = serialize_json_field_optional(item.outcome_json)

            conn.execute(
                text(
                    """
                    INSERT INTO insight_candidate_outcomes
                    (outcome_id, insight_id, symbol, horizon, status,
                     due_at, scheduled_at, evidence_refs_json, reason_codes_json,
                     outcome_json, created_at)
                    VALUES (:outcome_id, :insight_id, :symbol, :horizon, 'pending',
                            :due_at, :scheduled_at, :evidence_refs_json, :reason_codes_json,
                            :outcome_json, :created_at)
                    """
                ),
                {
                    "outcome_id": outcome_id,
                    "insight_id": item.insight_id,
                    "symbol": sym,
                    "horizon": item.horizon,
                    "due_at": due_at,
                    "scheduled_at": now,
                    "evidence_refs_json": evidence,
                    "reason_codes_json": reason_codes,
                    "outcome_json": outcome,
                    "created_at": now,
                },
            )
            row = _fetch_one(
                conn,
                "SELECT * FROM insight_candidate_outcomes WHERE outcome_id = :id",
                {"id": outcome_id},
            )
            if row:
                created.append(InsightCandidateOutcomeOut.from_db_row(row))
    return InsightCandidateOutcomeListOut(items=created, count=len(created))


@router.get("/insight-candidate-outcomes/due", response_model=InsightCandidateOutcomeListOut)
def list_due_insight_candidate_outcomes(
    request: Request,
    now: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    symbol: str | None = None,
) -> InsightCandidateOutcomeListOut:
    engine = get_intel_engine(request.app.state.settings)
    asof = now or utc_now_iso()
    params: dict[str, Any] = {"asof": asof, "limit": limit}
    where = "status = 'pending' AND (due_at IS NULL OR due_at <= :asof)"
    if symbol:
        where += " AND symbol = :symbol"
        params["symbol"] = symbol.upper()
    with engine.connect() as conn:
        rows = _fetch_many(
            conn,
            f"""
            SELECT * FROM insight_candidate_outcomes
            WHERE {where}
            ORDER BY due_at IS NULL, due_at ASC, created_at ASC
            LIMIT :limit
            """,
            params,
        )
    return InsightCandidateOutcomeListOut(
        items=[InsightCandidateOutcomeOut.from_db_row(row) for row in rows],
        count=len(rows),
    )


@router.post(
    "/insight-candidate-outcomes/{outcome_id}/label",
    response_model=InsightCandidateOutcomeOut,
)
def label_insight_candidate_outcome(
    request: Request, outcome_id: str, payload: InsightCandidateOutcomeLabelInput
) -> InsightCandidateOutcomeOut:
    if payload.status not in _FINAL_OUTCOME_STATUSES:
        raise HTTPException(status_code=422, detail="status must be labeled, skipped, or failed")

    engine = get_intel_engine(request.app.state.settings)
    now = utc_now_iso()

    with engine.begin() as conn:
        row = _fetch_one(
            conn,
            "SELECT * FROM insight_candidate_outcomes WHERE outcome_id = :id",
            {"id": outcome_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="insight candidate outcome not found")
        if row["status"] in _FINAL_OUTCOME_STATUSES:
            raise HTTPException(status_code=409, detail="outcome already finalized")
        if row["status"] != "pending":
            raise HTTPException(status_code=400, detail="only pending outcomes can be labeled")

        conn.execute(
            text(
                """
                UPDATE insight_candidate_outcomes SET
                  status = :status,
                  normalized_label = :normalized_label,
                  reason_codes_json = :reason_codes_json,
                  outcome_json = :outcome_json,
                  labeled_at = :labeled_at
                WHERE outcome_id = :outcome_id
                """
            ),
            {
                "status": payload.status,
                "normalized_label": payload.normalized_label,
                "reason_codes_json": serialize_json_field_optional(payload.reason_codes_json),
                "outcome_json": serialize_json_field_optional(payload.outcome_json),
                "labeled_at": now,
                "outcome_id": outcome_id,
            },
        )
        updated = _fetch_one(
            conn,
            "SELECT * FROM insight_candidate_outcomes WHERE outcome_id = :id",
            {"id": outcome_id},
        )
        return InsightCandidateOutcomeOut.from_db_row(updated)


@router.get("/insight-candidate-outcomes", response_model=InsightCandidateOutcomeListOut)
def list_insight_candidate_outcomes(
    request: Request,
    insight_id: str | None = None,
    symbol: str | None = None,
    status: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
) -> InsightCandidateOutcomeListOut:
    engine = get_intel_engine(request.app.state.settings)
    clauses: list[str] = []
    params: dict[str, Any] = {"limit": limit}
    if insight_id:
        clauses.append("insight_id = :insight_id")
        params["insight_id"] = insight_id
    if symbol:
        clauses.append("symbol = :symbol")
        params["symbol"] = symbol.upper()
    if status:
        clauses.append("status = :status")
        params["status"] = status
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with engine.connect() as conn:
        rows = _fetch_many(
            conn,
            f"""
            SELECT * FROM insight_candidate_outcomes
            {where}
            ORDER BY created_at DESC
            LIMIT :limit
            """,
            params,
        )
    return InsightCandidateOutcomeListOut(
        items=[InsightCandidateOutcomeOut.from_db_row(row) for row in rows],
        count=len(rows),
    )


@router.get("/insight-candidate-outcomes/{outcome_id}", response_model=InsightCandidateOutcomeOut)
def get_insight_candidate_outcome(
    request: Request, outcome_id: str
) -> InsightCandidateOutcomeOut:
    engine = get_intel_engine(request.app.state.settings)
    with engine.connect() as conn:
        row = _fetch_one(
            conn,
            "SELECT * FROM insight_candidate_outcomes WHERE outcome_id = :id",
            {"id": outcome_id},
        )
    if not row:
        raise HTTPException(status_code=404, detail="insight candidate outcome not found")
    return InsightCandidateOutcomeOut.from_db_row(row)


@router.post("/evaluation-reports", response_model=EvaluationReportOut)
def create_evaluation_report(
    request: Request, payload: EvaluationReportInput
) -> EvaluationReportOut:
    if payload.recommendation not in _VALID_RECOMMENDATIONS:
        raise HTTPException(
            status_code=422,
            detail="recommendation must be hold or needs_more_data",
        )

    engine = get_intel_engine(request.app.state.settings)
    metrics = serialize_json_field_optional(payload.metrics_json)
    report = serialize_json_field(payload.report_json)
    now = utc_now_iso()

    with engine.begin() as conn:
        existing = _fetch_one(
            conn,
            "SELECT * FROM evaluation_reports WHERE report_id = :id",
            {"id": payload.report_id},
        )
        if existing:
            _conflict_if_different(existing["report_json"], report, "report_json")
            _conflict_if_different(
                existing["recommendation"], payload.recommendation, "recommendation"
            )
            _conflict_scalar(existing["model_version"], payload.model_version, "model_version")
            _conflict_scalar(existing.get("window_start"), payload.window_start, "window_start")
            _conflict_scalar(existing.get("window_end"), payload.window_end, "window_end")
            _conflict_if_different(existing.get("metrics_json"), metrics, "metrics_json")
            return EvaluationReportOut.from_db_row(existing)

        conn.execute(
            text(
                """
                INSERT INTO evaluation_reports
                (report_id, model_version, window_start, window_end, metrics_json,
                 recommendation, report_json, created_at)
                VALUES (:report_id, :model_version, :window_start, :window_end,
                        :metrics_json, :recommendation, :report_json, :created_at)
                """
            ),
            {
                "report_id": payload.report_id,
                "model_version": payload.model_version,
                "window_start": payload.window_start,
                "window_end": payload.window_end,
                "metrics_json": metrics,
                "recommendation": payload.recommendation,
                "report_json": report,
                "created_at": now,
            },
        )
        inserted = _fetch_one(
            conn,
            "SELECT * FROM evaluation_reports WHERE report_id = :id",
            {"id": payload.report_id},
        )
        return EvaluationReportOut.from_db_row(inserted)


@router.get("/evaluation-reports/{report_id}", response_model=EvaluationReportOut)
def get_evaluation_report(request: Request, report_id: str) -> EvaluationReportOut:
    engine = get_intel_engine(request.app.state.settings)
    with engine.connect() as conn:
        row = _fetch_one(
            conn,
            "SELECT * FROM evaluation_reports WHERE report_id = :id",
            {"id": report_id},
        )
    if not row:
        raise HTTPException(status_code=404, detail="evaluation report not found")
    return EvaluationReportOut.from_db_row(row)


@router.get("/evaluation-reports", response_model=EvaluationReportListOut)
def list_evaluation_reports(
    request: Request,
    model_version: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
) -> EvaluationReportListOut:
    engine = get_intel_engine(request.app.state.settings)
    params: dict[str, Any] = {"limit": limit}
    where = ""
    if model_version:
        where = "WHERE model_version = :model_version"
        params["model_version"] = model_version
    with engine.connect() as conn:
        rows = _fetch_many(
            conn,
            f"""
            SELECT * FROM evaluation_reports
            {where}
            ORDER BY created_at DESC
            LIMIT :limit
            """,
            params,
        )
    return EvaluationReportListOut(
        items=[EvaluationReportOut.from_db_row(row) for row in rows],
        count=len(rows),
    )


@router.get("/weighting-policy-stats", response_model=WeightingPolicyStatsListOut)
def list_weighting_policy_stats(
    request: Request,
    policy_version: str | None = None,
) -> WeightingPolicyStatsListOut:
    engine = get_intel_engine(request.app.state.settings)
    params: dict[str, Any] = {}
    where = ""
    if policy_version:
        where = "WHERE policy_version = :policy_version"
        params["policy_version"] = policy_version
    with engine.connect() as conn:
        rows = _fetch_many(
            conn,
            f"SELECT * FROM weighting_policy_stats {where} ORDER BY updated_at DESC",
            params,
        )
    return WeightingPolicyStatsListOut(
        items=[WeightingPolicyStatsOut.from_db_row(row) for row in rows],
        count=len(rows),
    )


@router.post("/weighting-policy-stats", response_model=WeightingPolicyStatsOut)
def upsert_weighting_policy_stats(
    request: Request, payload: WeightingPolicyStatsInput
) -> WeightingPolicyStatsOut:
    engine = get_intel_engine(request.app.state.settings)
    stats = serialize_json_field(payload.stats_json)
    now = utc_now_iso()

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO weighting_policy_stats
                (policy_version, source_key, stats_json, updated_at)
                VALUES (:policy_version, :source_key, :stats_json, :updated_at)
                ON CONFLICT(policy_version, source_key) DO UPDATE SET
                  stats_json = excluded.stats_json,
                  updated_at = excluded.updated_at
                """
            ),
            {
                "policy_version": payload.policy_version,
                "source_key": payload.source_key,
                "stats_json": stats,
                "updated_at": now,
            },
        )
        row = _fetch_one(
            conn,
            """
            SELECT * FROM weighting_policy_stats
            WHERE policy_version = :policy_version AND source_key = :source_key
            """,
            {
                "policy_version": payload.policy_version,
                "source_key": payload.source_key,
            },
        )
        return WeightingPolicyStatsOut.from_db_row(row)