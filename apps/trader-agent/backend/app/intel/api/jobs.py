from __future__ import annotations

from fastapi import APIRouter, Request

from app.intel.db.connection import get_intel_engine
from app.intel.jobs.premarket import run_close_postmortem, run_premarket_brief

router = APIRouter()


@router.post("/premarket")
def post_premarket(request: Request) -> dict:
    settings = request.app.state.settings
    engine = get_intel_engine(settings)
    return run_premarket_brief(settings, engine)


@router.post("/close")
def post_close(request: Request) -> dict:
    settings = request.app.state.settings
    engine = get_intel_engine(settings)
    return run_close_postmortem(settings, engine)
