from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Request
from pydantic import BaseModel
from sqlalchemy import text

from app.core.time import utc_now_iso
from app.intel.db.connection import get_intel_engine

router = APIRouter()


class CheckRequest(BaseModel):
    symbol: str
    date: str


class SaveRequest(BaseModel):
    symbol: str
    date: str
    latest_signal_ts: str | None = None
    report_json: str
    content_hash: str | None = None


def _latest_signal_ts(conn, symbol: str) -> str | None:
    row = conn.execute(
        text("SELECT MAX(ts) FROM signals WHERE symbol = :symbol"),
        {"symbol": symbol},
    ).fetchone()
    return str(row[0]) if row and row[0] else None


@router.post("/check")
def check_report(request: Request, payload: CheckRequest) -> dict:
    engine = get_intel_engine(request.app.state.settings)
    sym = payload.symbol.upper()
    with engine.connect() as conn:
        latest_signal_ts = _latest_signal_ts(conn, sym)
        if latest_signal_ts is None:
            row = conn.execute(
                text(
                    """
                    SELECT report_json, created_at FROM report_cache
                    WHERE symbol = :symbol AND report_date = :date AND latest_signal_ts IS NULL
                    LIMIT 1
                    """
                ),
                {"symbol": sym, "date": payload.date},
            ).mappings().fetchone()
        else:
            row = conn.execute(
                text(
                    """
                    SELECT report_json, created_at FROM report_cache
                    WHERE symbol = :symbol AND report_date = :date AND latest_signal_ts = :lts
                    LIMIT 1
                    """
                ),
                {"symbol": sym, "date": payload.date, "lts": latest_signal_ts},
            ).mappings().fetchone()

    if row:
        return {
            "hit": True,
            "report": row["report_json"],
            "cached_at": row["created_at"],
        }
    return {"hit": False, "latest_signal_ts": latest_signal_ts}


@router.post("/save")
def save_report(request: Request, payload: SaveRequest) -> dict:
    engine = get_intel_engine(request.app.state.settings)
    sym = payload.symbol.upper()
    lts = payload.latest_signal_ts
    with engine.begin() as conn:
        if lts is None:
            conn.execute(
                text(
                    """
                    DELETE FROM report_cache
                    WHERE symbol = :symbol AND report_date = :date AND latest_signal_ts IS NULL
                    """
                ),
                {"symbol": sym, "date": payload.date},
            )
        else:
            conn.execute(
                text(
                    """
                    DELETE FROM report_cache
                    WHERE symbol = :symbol AND report_date = :date AND latest_signal_ts = :lts
                    """
                ),
                {"symbol": sym, "date": payload.date, "lts": lts},
            )
        conn.execute(
            text(
                """
                INSERT INTO report_cache
                (id, symbol, report_date, latest_signal_ts, report_json, content_hash, created_at)
                VALUES (:id, :symbol, :date, :lts, :report_json, :content_hash, :created_at)
                """
            ),
            {
                "id": str(uuid4()),
                "symbol": sym,
                "date": payload.date,
                "lts": lts,
                "report_json": payload.report_json,
                "content_hash": payload.content_hash,
                "created_at": utc_now_iso(),
            },
        )
    return {"saved": True, "symbol": sym, "date": payload.date}
