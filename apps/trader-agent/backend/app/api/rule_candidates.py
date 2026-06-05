from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.modules.rule_discovery import (
    EvidenceGapError,
    InvalidCandidateTransitionError,
    advance_backtested_candidate,
    create_insight_candidate_rule_candidate,
    create_manual_rule_candidate,
    get_lite_backtest_report,
    get_rule_candidate,
    run_lite_backtest,
    validate_candidate_evidence_requirements,
)

router = APIRouter(prefix="/api/rule-candidates", tags=["rule-candidates"])


class SourceRef(BaseModel):
    insight_id: str | None = None
    run_id: str | None = None
    input: str | None = None


class CreateRuleCandidateRequest(BaseModel):
    source: Literal["manual", "insight_candidate"] = "manual"
    source_ref: SourceRef | dict[str, Any] | None = None
    hypothesis: str
    symbols: list[str] = Field(min_length=1)
    trigger_definition: str
    entry_condition: str
    exit_condition: str | None = None
    invalidation: str
    data_requirements: list[dict[str, Any]] | None = None
    risk_notes: list[str] | None = None
    confidence: float | None = None


class LiteBacktestRequest(BaseModel):
    start: str
    end: str


class AdvanceCandidateRequest(BaseModel):
    decision: str


def _settings(request: Request):
    return request.app.state.settings


def _payload_from_request(body: CreateRuleCandidateRequest) -> dict[str, Any]:
    payload = body.model_dump(exclude_none=True)
    source_ref = payload.get("source_ref")
    if isinstance(source_ref, dict):
        payload["source_ref"] = source_ref
    elif source_ref is not None:
        payload["source_ref"] = source_ref.model_dump(exclude_none=True)
    return payload


@router.post("")
def create_rule_candidate(
    request: Request,
    body: CreateRuleCandidateRequest,
) -> dict[str, Any]:
    settings = _settings(request)
    payload = _payload_from_request(body)
    try:
        if body.source == "insight_candidate":
            candidate_id = create_insight_candidate_rule_candidate(settings, payload)
        else:
            candidate_id = create_manual_rule_candidate(settings, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"candidate_id": candidate_id, "status": "draft"}


@router.get("/{candidate_id}")
def read_rule_candidate(
    request: Request,
    candidate_id: Annotated[str, "candidate_id"],
) -> dict[str, Any]:
    settings = _settings(request)
    try:
        return get_rule_candidate(settings, candidate_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{candidate_id}/evidence-requirements")
def validate_evidence_requirements(
    request: Request,
    candidate_id: Annotated[str, "candidate_id"],
) -> dict[str, Any]:
    settings = _settings(request)
    try:
        return validate_candidate_evidence_requirements(settings, candidate_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidCandidateTransitionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/{candidate_id}/lite-backtest")
def post_lite_backtest(
    request: Request,
    candidate_id: Annotated[str, "candidate_id"],
    body: LiteBacktestRequest,
) -> dict[str, Any]:
    settings = _settings(request)
    try:
        return run_lite_backtest(settings, candidate_id, body.start, body.end)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidCandidateTransitionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except EvidenceGapError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/{candidate_id}/advance")
def post_advance_candidate(
    request: Request,
    candidate_id: Annotated[str, "candidate_id"],
    body: AdvanceCandidateRequest,
) -> dict[str, Any]:
    settings = _settings(request)
    try:
        return advance_backtested_candidate(settings, candidate_id, body.decision)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidCandidateTransitionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/{candidate_id}/lite-backtest-report")
def read_lite_backtest_report(
    request: Request,
    candidate_id: Annotated[str, "candidate_id"],
) -> dict[str, Any]:
    settings = _settings(request)
    try:
        return get_lite_backtest_report(settings, candidate_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
