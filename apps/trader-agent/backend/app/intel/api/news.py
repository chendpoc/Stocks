from __future__ import annotations

from fastapi import APIRouter, Request

from app.intel.db.connection import get_intel_engine
from app.intel.ingestion.news_crawler import ingest_news

router = APIRouter()


@router.post("/ingest")
def ingest_news_endpoint(request: Request) -> dict:
    engine = get_intel_engine(request.app.state.settings)
    inserted = ingest_news(request.app.state.settings, engine)
    return {"inserted": inserted}
