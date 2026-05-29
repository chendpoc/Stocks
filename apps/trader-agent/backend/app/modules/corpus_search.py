from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.core.config import Settings
from app.db.session import create_sqlite_engine
from app.modules._json import loads
from app.modules.markdown_section_indexer import ensure_sections_fts

MAX_SEARCH_LIMIT = 50
FETCH_MULTIPLIER = 5
CJK_RE = re.compile(r"[\u4e00-\u9fff]")
ASCII_TERM_PATTERN = re.compile(r"[A-Za-z0-9_.-]+")

_SELECT_COLUMNS = """
    ds.id AS section_id,
    ds.artifact_id AS artifact_id,
    sa.path AS path,
    sa.source_type AS source_type,
    ds.heading_path AS heading_path,
    ds.text AS text,
    ds.source_date AS source_date,
    ds.start_line AS start_line,
    ds.end_line AS end_line,
    ds.symbols_json AS symbols_json
"""


@dataclass
class CorpusSearchResult:
    evidence_id: str
    section_id: str
    source_path: str
    source_type: str
    heading_path: str
    snippet: str
    source_date: str | None
    start_line: int | None
    end_line: int | None
    symbols: list[str]
    timestamp: str | None
    confidence: float = 0.8

    def as_dict(self) -> dict[str, Any]:
        return {
            "evidence_id": self.evidence_id,
            "section_id": self.section_id,
            "source_path": self.source_path,
            "source_type": self.source_type,
            "heading_path": self.heading_path,
            "snippet": self.snippet,
            "source_date": self.source_date,
            "start_line": self.start_line,
            "end_line": self.end_line,
            "symbols": self.symbols,
            "timestamp": self.timestamp,
            "confidence": self.confidence,
        }


def search_corpus(
    settings: Settings,
    *,
    query: str,
    symbol: str | None = None,
    source_type: str | None = None,
    start: str | None = None,
    end: str | None = None,
    limit: int = 10,
) -> list[CorpusSearchResult]:
    normalized_query = query.strip()
    if not normalized_query:
        raise ValueError("query must not be empty")
    if limit < 1 or limit > MAX_SEARCH_LIMIT:
        raise ValueError(f"limit must be between 1 and {MAX_SEARCH_LIMIT}")

    engine = create_sqlite_engine(settings)
    fetch_limit = min(MAX_SEARCH_LIMIT * FETCH_MULTIPLIER, limit * FETCH_MULTIPLIER)

    with engine.begin() as conn:
        ensure_sections_fts(conn)
        if CJK_RE.search(normalized_query):
            rows = _search_like(
                conn,
                query=normalized_query,
                symbol=symbol,
                source_type=source_type,
                start=start,
                end=end,
                limit=fetch_limit,
            )
        else:
            rows = _search_fts(
                conn,
                query=normalized_query,
                symbol=symbol,
                source_type=source_type,
                start=start,
                end=end,
                limit=fetch_limit,
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
                    limit=fetch_limit,
                )

    if symbol:
        target = symbol.strip().upper()
        rows = [
            row
            for row in rows
            if target in loads(row.get("symbols_json"), [])
        ]

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
) -> list[dict[str, Any]]:
    fts_query = _fts_query(query)
    if not fts_query:
        return []
    filter_conditions, params = _filter_conditions(
        symbol=symbol,
        source_type=source_type,
        start=start,
        end=end,
    )
    params["query"] = fts_query
    params["limit"] = limit
    where_clause = " AND ".join(["document_sections_fts MATCH :query", *filter_conditions])
    sql = text(
        f"SELECT {_SELECT_COLUMNS} "
        "FROM document_sections_fts fts "
        "JOIN document_sections ds ON ds.id = fts.section_id "
        "JOIN source_artifacts sa ON sa.id = ds.artifact_id "
        f"WHERE {where_clause} "
        "ORDER BY bm25(document_sections_fts), ds.source_date DESC, ds.id "
        "LIMIT :limit"
    )
    try:
        return [dict(row) for row in conn.execute(sql, params).mappings().all()]
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
) -> list[dict[str, Any]]:
    filter_conditions, params = _filter_conditions(
        symbol=symbol,
        source_type=source_type,
        start=start,
        end=end,
    )
    text_conditions: list[str] = []
    for index, term in enumerate(_query_terms(query)):
        key = f"term_{index}"
        text_conditions.append(f"ds.text LIKE :{key}")
        params[key] = f"%{term}%"
    params["limit"] = limit
    where_clause = " AND ".join([*text_conditions, *filter_conditions])
    sql = text(
        f"SELECT {_SELECT_COLUMNS} "
        "FROM document_sections ds "
        "JOIN source_artifacts sa ON sa.id = ds.artifact_id "
        f"WHERE {where_clause} "
        "ORDER BY ds.source_date DESC, ds.id "
        "LIMIT :limit"
    )
    return [dict(row) for row in conn.execute(sql, params).mappings().all()]


def _filter_conditions(
    *,
    symbol: str | None,
    source_type: str | None,
    start: str | None,
    end: str | None,
) -> tuple[list[str], dict[str, Any]]:
    conditions: list[str] = []
    params: dict[str, Any] = {}
    if symbol:
        conditions.append('ds.symbols_json LIKE :symbol_pattern')
        params["symbol_pattern"] = f'%"{symbol.strip().upper()}"%'
    if source_type:
        conditions.append("sa.source_type = :source_type")
        params["source_type"] = source_type
    if start:
        conditions.append("ds.source_date >= :start_date")
        params["start_date"] = _date_value(start)
    if end:
        conditions.append("ds.source_date <= :end_date")
        params["end_date"] = _date_value(end)
    return conditions, params


def _fts_query(query: str) -> str:
    terms = ASCII_TERM_PATTERN.findall(query)
    if not terms:
        return ""
    return " AND ".join(f'"{term}"' for term in terms)


def _row_to_result(row: dict[str, Any], query: str) -> CorpusSearchResult:
    section_id = row["section_id"]
    source_date = row["source_date"]
    text_value = row["text"] or ""
    return CorpusSearchResult(
        evidence_id=section_id,
        section_id=section_id,
        source_path=row["path"],
        source_type=row["source_type"],
        heading_path=row["heading_path"] or "",
        snippet=_snippet(text_value, query),
        source_date=source_date,
        start_line=row["start_line"],
        end_line=row["end_line"],
        symbols=loads(row["symbols_json"], []),
        timestamp=source_date,
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


def _query_terms(query: str) -> list[str]:
    terms = [term for term in re.split(r"\s+", query.strip()) if term]
    return terms or [query]


def _filter_rows_by_query_terms(
    rows: list[dict[str, Any]], query: str
) -> list[dict[str, Any]]:
    terms = _query_terms(query)
    filtered: list[dict[str, Any]] = []
    for row in rows:
        text_value = str(row.get("text") or "").lower()
        if all(term.lower() in text_value for term in terms):
            filtered.append(row)
    return filtered


def _date_value(value: str) -> str:
    return date.fromisoformat(value[:10]).isoformat()
