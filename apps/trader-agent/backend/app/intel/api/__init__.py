from __future__ import annotations

from fastapi import APIRouter

from app.intel.api import (
    context,
    corpus,
    events,
    hypotheses,
    jobs,
    lessons,
    market,
    news,
    report_cache,
    signals,
    stage1,
    trade_ideas,
)

intel_router = APIRouter()

intel_router.include_router(context.router, prefix="/context", tags=["intel-context"])
intel_router.include_router(market.router, prefix="/market", tags=["intel-market"])
intel_router.include_router(signals.router, prefix="/signals", tags=["intel-signals"])
intel_router.include_router(events.router, prefix="/events", tags=["intel-events"])
intel_router.include_router(hypotheses.router, prefix="/hypotheses", tags=["intel-hypotheses"])
intel_router.include_router(lessons.router, prefix="/lessons", tags=["intel-lessons"])
intel_router.include_router(trade_ideas.router, prefix="/trade-ideas", tags=["intel-trade-ideas"])
intel_router.include_router(jobs.router, prefix="/jobs", tags=["intel-jobs"])
intel_router.include_router(corpus.router, prefix="/corpus", tags=["intel-corpus"])
intel_router.include_router(report_cache.router, prefix="/report", tags=["intel-report"])
intel_router.include_router(news.router, prefix="/news", tags=["intel-news"])
intel_router.include_router(stage1.router, prefix="/stage1", tags=["intel-stage1"])

__all__ = ["intel_router"]
