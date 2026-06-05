from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.modules.paper_trading.engine import PaperTradingError, submit_paper_order_intent

router = APIRouter(prefix="/api/paper-trading", tags=["paper-trading"])


class PaperOrderIntentRequest(BaseModel):
    symbol: str
    direction: str = "buy"
    quantity: float = Field(gt=0)
    limit_price: float | None = None
    slippage_bps: float = 5.0
    market_state_snapshot_id: str | None = None


def _settings(request: Request):
    return request.app.state.settings


@router.post("/intents")
def create_paper_intent(body: PaperOrderIntentRequest, request: Request) -> dict[str, Any]:
    try:
        return submit_paper_order_intent(
            _settings(request),
            body.model_dump(exclude_none=True),
        )
    except PaperTradingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
