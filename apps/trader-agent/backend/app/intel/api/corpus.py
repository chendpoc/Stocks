from __future__ import annotations

from fastapi import APIRouter, Request

from app.modules.corpus_search import search_corpus

router = APIRouter()


@router.get("/search")
def corpus_search(
    request: Request,
    query: str,
    symbol: str | None = None,
    limit: int = 5,
) -> dict:
    settings = request.app.state.settings
    results = search_corpus(settings, query=query, symbol=symbol or None, limit=limit)
    return {
        "results": [
            {
                "section_id": r.section_id,
                "heading_path": r.heading_path,
                "snippet": r.snippet,
                "source_path": r.source_path,
                "symbols": r.symbols,
                "source_date": r.source_date,
            }
            for r in results
        ]
    }
