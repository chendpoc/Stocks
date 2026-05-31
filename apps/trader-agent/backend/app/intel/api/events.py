from __future__ import annotations

import json

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.intel.db.connection import get_intel_engine
from app.intel.ingestion.events_ingest import create_event, ingest_ark_trades, list_events

router = APIRouter()


class CreateEventRequest(BaseModel):
    ts: str
    event_type: str
    title: str
    raw_text: str
    actor: str | None = None
    affected_symbols: list[str] | None = None
    source: str = "manual"


@router.post("")
def post_event(request: Request, payload: CreateEventRequest) -> dict:
    engine = get_intel_engine(request.app.state.settings)
    return create_event(
        engine,
        ts=payload.ts,
        event_type=payload.event_type,
        title=payload.title,
        raw_text=payload.raw_text,
        actor=payload.actor,
        affected_symbols=payload.affected_symbols,
        source=payload.source,
    )


@router.get("")
def get_events(
    request: Request,
    symbol: str | None = None,
    days: int = 7,
    limit: int = 20,
) -> dict:
    engine = get_intel_engine(request.app.state.settings)
    return {"events": list_events(engine, symbol=symbol, days=days, limit=limit)}


@router.post("/ark/ingest")
def post_ark_ingest(request: Request, symbol: str | None = None) -> dict:
    engine = get_intel_engine(request.app.state.settings)
    count = ingest_ark_trades(engine, symbol)
    return {"ingested": count}
