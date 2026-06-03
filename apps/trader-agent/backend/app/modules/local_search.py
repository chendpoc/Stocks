from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.core.config import Settings
from app.db.session import create_sqlite_engine
from app.modules.json_row_codec import coerce_json_value
from app.modules.document_indexer import ensure_knowledge_fts

MAX_SEARCH_LIMIT = 50
FETCH_MULTIPLIER = 5
ASCII_TERM_PATTERN = re.compile(r"[A-Za-z0-9_.-]+")


@dataclass(frozen=True)
class KnowledgeSearchResult:
    evidence_id: str
    source_path: str
    snippet: str
    source_type: str
    confidence: float
    timestamp: str | None
    symbol_hints: list[str]

    def as_dict(self) -> dict[str, Any]:
        return {
            "evidence_id": self.evidence_id,
            "source_path": self.source_path,
            "snippet": self.snippet,
            "source_type": self.source_type,
            "confidence": self.confidence,
            "timestamp": self.timestamp,
            "symbol_hints": self.symbol_hints,
        }


def search_local_knowledge(
    settings: Settings,
    *,
    query: str,
    symbol: str | None = None,
    source_type: str | None = None,
    start: str | None = None,
    end: str | None = None,
    limit: int = 10,
) -> list[KnowledgeSearchResult]:
    normalized_query = query.strip()
    if not normalized_query:
        raise ValueError("query must not be empty")
    if limit < 1 or limit > MAX_SEARCH_LIMIT:
        raise ValueError(f"limit must be between 1 and {MAX_SEARCH_LIMIT}")

    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        ensure_knowledge_fts(conn)
        rows = _search_fts(
            conn,
            query=normalized_query,
            symbol=symbol,
            source_type=source_type,
            start=start,
            end=end,
            limit=limit,
        )
        rows = _filter_rows_by_query_terms(rows, normalized_query)
        if not rows:
            rows = _search_like(
                conn,
                query=normalized_query,
                symbol=symbol,
                source_type=source_type,
                start=start,
                end=end,
                limit=limit,
            )
    return [_row_to_result(row, normalized_query) for row in rows[:limit]]


def _search_fts(
    conn: Any,
    *,
    query: str,
    symbol: str | None,
    source_type: str | None,
    start: str | None,
    end: str | None,
    limit: int,
) -> list[Any]:
    fts_query = _fts_query(query)
    if not fts_query:
        return []
    conditions, params = _filter_conditions(
        table_alias="c",
        symbol=symbol,
        source_type=source_type,
        start=start,
        end=end,
    )
    params.update(
        {
            "query": fts_query,
            "limit": min(MAX_SEARCH_LIMIT * FETCH_MULTIPLIER, limit * FETCH_MULTIPLIER),
        }
    )
    where_clause = " AND ".join(["document_chunks_fts MATCH :query", *conditions])
    sql = text(
        "SELECT c.* FROM document_chunks_fts "
        "JOIN document_chunks c ON c.id = document_chunks_fts.chunk_id "
        f"WHERE {where_clause} "
        "ORDER BY bm25(document_chunks_fts), c.timestamp_hint DESC, c.evidence_id "
        "LIMIT :limit"
    )
    try:
        return conn.execute(sql, params).mappings().all()
    except OperationalError:
        return []


def _search_like(
    conn: Any,
    *,
    query: str,
    symbol: str | None,
    source_type: str | None,
    start: str | None,
    end: str | None,
    limit: int,
) -> list[Any]:
    conditions, params = _filter_conditions(
        table_alias="c",
        symbol=symbol,
        source_type=source_type,
        start=start,
        end=end,
    )
    terms = _query_terms(query)
    for index, term in enumerate(terms):
        key = f"term_{index}"
        conditions.append(f"c.raw_text LIKE :{key}")
        params[key] = f"%{term}%"
    params["limit"] = min(MAX_SEARCH_LIMIT * FETCH_MULTIPLIER, limit * FETCH_MULTIPLIER)
    sql = text(
        "SELECT c.* FROM document_chunks c "
        f"WHERE {' AND '.join(conditions)} "
        "ORDER BY c.timestamp_hint DESC, c.evidence_id "
        "LIMIT :limit"
    )
    return conn.execute(sql, params).mappings().all()


def _filter_conditions(
    *,
    table_alias: str,
    symbol: str | None,
    source_type: str | None,
    start: str | None,
    end: str | None,
) -> tuple[list[str], dict[str, Any]]:
    conditions = ["1 = 1"]
    params: dict[str, Any] = {}
    if symbol:
        params["symbol"] = f'%"{symbol.strip().upper()}"%'
        conditions.append(f"{table_alias}.symbol_hints LIKE :symbol")
    if source_type:
        params["source_type"] = source_type
        conditions.append(f"{table_alias}.source_type = :source_type")
    if start:
        params["start"] = _date_value(start)
        conditions.append(f"substr({table_alias}.timestamp_hint, 1, 10) >= :start")
    if end:
        params["end"] = _date_value(end)
        conditions.append(f"substr({table_alias}.timestamp_hint, 1, 10) <= :end")
    return conditions, params


def _fts_query(query: str) -> str:
    terms = ASCII_TERM_PATTERN.findall(query)
    if not terms:
        return ""
    return " AND ".join(f'"{term}"' for term in terms)


def _query_terms(query: str) -> list[str]:
    terms = [term for term in re.split(r"\s+", query.strip()) if term]
    return terms or [query]


def _filter_rows_by_query_terms(rows: list[Any], query: str) -> list[Any]:
    terms = _query_terms(query)
    filtered = []
    for row in rows:
        raw_text = str(row["raw_text"]).lower()
        if all(term.lower() in raw_text for term in terms):
            filtered.append(row)
    return filtered


def _row_to_result(row: Any, query: str) -> KnowledgeSearchResult:
    symbol_hints = coerce_json_value(row["symbol_hints"], [])
    return KnowledgeSearchResult(
        evidence_id=row["evidence_id"],
        source_path=row["source_path"],
        snippet=_snippet(row["raw_text"], query),
        source_type=row["source_type"],
        confidence=float(row["confidence"]),
        timestamp=row["timestamp_hint"],
        symbol_hints=symbol_hints,
    )


def _snippet(raw_text: str, query: str) -> str:
    terms = _query_terms(query)
    lower_text = raw_text.lower()
    start = 0
    for term in terms:
        index = lower_text.find(term.lower())
        if index >= 0:
            start = max(0, index - 80)
            break
    snippet = raw_text[start : start + 240].strip()
    if start > 0:
        snippet = f"...{snippet}"
    if start + 240 < len(raw_text):
        snippet = f"{snippet}..."
    return snippet


def _date_value(value: str) -> str:
    return date.fromisoformat(value[:10]).isoformat()
