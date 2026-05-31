from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

from sqlalchemy import text

from app.intel import logger
from app.intel.context.selector import select_lessons
from app.intel.db.connection import get_intel_engine
from app.intel.features.scanner import get_signal, list_signals
from app.intel.ingestion.events_ingest import list_events
from app.intel.ingestion.market_data import get_bars_from_db
from app.modules._json import loads
from app.modules.corpus_search import search_corpus

router = APIRouter()


class BuildContextRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    symbols: list[str]
    task_type: str = Field(alias="taskType")
    query: str | None = None
    signal_id: str | None = Field(default=None, alias="signalId")


def _fetch_recent_bars(
    engine,
    symbol: str,
    limit: int = 20,
    timeframe: str = "1d",
) -> list[dict]:
    return get_bars_from_db(engine, symbol, timeframe, limit)


def _list_signals_for_symbols(engine, symbols: list[str], days: int = 3) -> list[dict]:
    if not symbols:
        return list_signals(engine, limit=50)
    all_signals: list[dict] = []
    for sym in symbols:
        all_signals.extend(list_signals(engine, symbol=sym, limit=20))
    return sorted(all_signals, key=lambda s: s.get("ts", ""), reverse=True)[:50]


def _list_events_for_symbols(engine, symbols: list[str], days: int = 7) -> list[dict]:
    events = list_events(engine, days=days, limit=50)
    if not symbols:
        return events
    sym_set = {s.upper() for s in symbols}
    filtered = []
    for event in events:
        affected = event.get("affected_symbols") or []
        if isinstance(affected, str):
            affected = loads(affected, default=[])
        if not affected or sym_set.intersection({a.upper() for a in affected}):
            filtered.append(event)
    return filtered[:20]


def _list_patterns(engine, symbols: list[str]) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT pattern_id, name, category, description, typical_sequence,
                       trigger_conditions, invalidation_conditions, affected_assets,
                       reliability_score
                FROM patterns
                """
            )
        ).mappings().all()
    result = []
    sym_set = {s.upper() for s in symbols}
    for row in rows:
        assets = loads(row["affected_assets"], default=[])
        if not symbols or sym_set.intersection({a.upper() for a in assets}):
            result.append(dict(row))
    return result


@router.post("/build")
def build_context(request: Request, payload: BuildContextRequest) -> dict:
    settings = request.app.state.settings
    engine = get_intel_engine(settings)
    symbols = [s.upper() for s in payload.symbols]
    context: dict = {}

    context["market_data"] = {}
    for sym in symbols:
        context["market_data"][sym] = {
            "daily": _fetch_recent_bars(engine, sym, limit=20, timeframe="1d"),
            "minute": _fetch_recent_bars(engine, sym, limit=50, timeframe="5m"),
        }

    context["benchmark"] = {
        "QQQ": _fetch_recent_bars(engine, "QQQ", limit=5, timeframe="1d"),
        "SPY": _fetch_recent_bars(engine, "SPY", limit=5, timeframe="1d"),
    }

    if payload.signal_id:
        signal = get_signal(engine, payload.signal_id)
        context["signals"] = [signal] if signal else []
    else:
        context["signals"] = _list_signals_for_symbols(engine, symbols, days=3)

    context["events"] = _list_events_for_symbols(engine, symbols, days=7)

    try:
        injected = select_lessons(engine, symbols=symbols)
        context["lessons"] = injected
        context["lessons_meta"] = {"selected_count": len(injected)}
    except Exception as exc:
        logger.warning("select_lessons failed: %s", exc)
        context["lessons"] = []
        context["lessons_meta"] = {"selected_count": 0}

    try:
        search_query = payload.query or " ".join(symbols)
        corpus_results = search_corpus(
            settings,
            query=search_query,
            symbol=symbols[0] if symbols else None,
            limit=3,
        )
        context["corpus"] = [
            {
                "section_id": r.section_id,
                "heading_path": r.heading_path,
                "snippet": r.snippet,
                "source_path": r.source_path,
                "symbols": r.symbols,
                "source_date": r.source_date,
            }
            for r in corpus_results
        ]
    except Exception as exc:
        logger.warning("search_corpus failed: %s", exc)
        context["corpus"] = []

    context["patterns"] = _list_patterns(engine, symbols)

    return context
