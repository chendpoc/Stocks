from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.intel.db.connection import get_intel_engine
from app.intel.postmortem.lessons import list_lessons
from sqlalchemy import text

router = APIRouter()


class CreateLessonRequest(BaseModel):
    lesson_text: str
    symbol: str | None = None
    verdict: str | None = None
    when_to_apply: str | None = None
    when_not_to_apply: str | None = None


@router.get("")
def get_lessons(
    request: Request,
    symbol: str | None = None,
    limit: int = 20,
) -> dict:
    engine = get_intel_engine(request.app.state.settings)
    return {"lessons": list_lessons(engine, symbol=symbol, limit=limit)}


@router.post("")
def post_lesson(request: Request, payload: CreateLessonRequest) -> dict:
    from uuid import uuid4

    from app.core.time import utc_now_iso

    engine = get_intel_engine(request.app.state.settings)
    lesson_id = str(uuid4())
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO lessons
                (lesson_id, ts, symbol, lesson_text, when_to_apply, when_not_to_apply, verdict)
                VALUES (:lesson_id, :ts, :symbol, :lesson_text, :when_to_apply,
                        :when_not_to_apply, :verdict)
                """
            ),
            {
                "lesson_id": lesson_id,
                "ts": utc_now_iso(),
                "symbol": payload.symbol,
                "lesson_text": payload.lesson_text,
                "when_to_apply": payload.when_to_apply,
                "when_not_to_apply": payload.when_not_to_apply,
                "verdict": payload.verdict,
            },
        )
    return {"lesson_id": lesson_id}
