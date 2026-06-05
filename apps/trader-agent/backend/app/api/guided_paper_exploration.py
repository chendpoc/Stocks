from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.modules.execution_policy.store import get_execution_policy, save_execution_policy
from app.modules.execution_policy.validate import (
    ExecutionPolicyValidationError,
    validate_execution_policy,
)
from app.modules.guided_paper_exploration.run import (
    GuidedPaperExplorationError,
    run_guided_paper_exploration,
)
from app.intel.db.schema import init_intel_db

router = APIRouter(prefix="/api/guided-paper", tags=["guided-paper"])


def _settings(request: Request):
    return request.app.state.settings


class ExecutionPolicyBody(BaseModel):
    policy: dict[str, Any]


class GuidedRunBody(BaseModel):
    execution_policy_id: str
    symbol: str
    direction: str = "buy"
    quantity: float = Field(gt=0, default=1.0)
    approval_granted: bool = False


@router.post("/execution-policies")
def register_execution_policy(body: ExecutionPolicyBody, request: Request) -> dict[str, Any]:
    try:
        validate_execution_policy(body.policy)
    except ExecutionPolicyValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    engine = init_intel_db(_settings(request))
    saved = save_execution_policy(engine, body.policy)
    return saved


@router.get("/execution-policies/{execution_policy_id}")
def fetch_execution_policy(execution_policy_id: str, request: Request) -> dict[str, Any]:
    engine = init_intel_db(_settings(request))
    policy = get_execution_policy(engine, execution_policy_id)
    if policy is None:
        raise HTTPException(status_code=404, detail="execution policy not found")
    return policy


@router.post("/runs")
def start_guided_run(body: GuidedRunBody, request: Request) -> dict[str, Any]:
    try:
        return run_guided_paper_exploration(
            _settings(request),
            execution_policy_id=body.execution_policy_id,
            symbol=body.symbol,
            direction=body.direction,
            quantity=body.quantity,
            approval_granted=body.approval_granted,
        )
    except GuidedPaperExplorationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ExecutionPolicyValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
