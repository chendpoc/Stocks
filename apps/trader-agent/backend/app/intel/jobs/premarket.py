from __future__ import annotations

from app.core.time import utc_now_iso
from app.intel.features.scanner import list_signals
from app.intel.ingestion.events_ingest import list_events
from app.intel.postmortem.evaluator import evaluate_due_predictions
from app.intel.postmortem.lessons import list_lessons
from app.intel.trade.ideas import list_trade_ideas


def run_premarket_brief(settings, engine) -> dict:
    watchlist = list_trade_ideas(engine, status="watchlist", limit=10)
    active_lessons = list_lessons(engine, limit=5)
    recent_events = list_events(engine, days=1, limit=10)
    recent_signals = list_signals(engine, status="new", limit=10)
    return {
        "ts": utc_now_iso(),
        "watchlist": watchlist,
        "active_lessons": active_lessons,
        "overnight_events": recent_events,
        "new_signals": recent_signals,
        "benchmark": {
            "note": "Structured premarket data pack for CLI LLM — no text generation here",
        },
    }


def run_close_postmortem(settings, engine) -> dict:
    evaluation = evaluate_due_predictions(settings, engine)
    today_signals = list_signals(engine, limit=50)
    hypotheses_rows = list_trade_ideas(engine, limit=20)
    return {
        "ts": utc_now_iso(),
        "evaluation": evaluation,
        "today_signals": today_signals,
        "trade_ideas": hypotheses_rows,
        "lessons": list_lessons(engine, limit=5),
    }
