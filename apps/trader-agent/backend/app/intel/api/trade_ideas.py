from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.intel.db.connection import get_intel_engine
from app.intel.trade.ideas import list_trade_ideas

router = APIRouter()


class TradeIdeaInput(BaseModel):
    symbol: str
    direction: str | None = None
    setup_type: str | None = None
    status: str = "watchlist"
    thesis: str | None = None
    trigger_conditions: str | None = None
    invalidation_conditions: str | None = None
    confidence: float = 0.5


@router.get("")
def get_trade_ideas(
    request: Request,
    symbol: str | None = None,
    status: str | None = None,
) -> dict:
    engine = get_intel_engine(request.app.state.settings)
    return {"trade_ideas": list_trade_ideas(engine, symbol=symbol, status=status)}


@router.post("")
def post_trade_idea(request: Request, payload: TradeIdeaInput) -> dict:
    from uuid import uuid4

    from app.core.time import utc_now_iso
    from sqlalchemy import text

    engine = get_intel_engine(request.app.state.settings)
    trade_idea_id = str(uuid4())
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO trade_ideas
                (trade_idea_id, ts, symbol, direction, setup_type, status, thesis,
                 trigger_conditions, invalidation_conditions, confidence)
                VALUES (:trade_idea_id, :ts, :symbol, :direction, :setup_type, :status,
                        :thesis, :trigger_conditions, :invalidation_conditions, :confidence)
                """
            ),
            {
                "trade_idea_id": trade_idea_id,
                "ts": utc_now_iso(),
                "symbol": payload.symbol.upper(),
                "direction": payload.direction,
                "setup_type": payload.setup_type,
                "status": payload.status,
                "thesis": payload.thesis,
                "trigger_conditions": payload.trigger_conditions,
                "invalidation_conditions": payload.invalidation_conditions,
                "confidence": payload.confidence,
            },
        )
    return {"trade_idea_id": trade_idea_id}
