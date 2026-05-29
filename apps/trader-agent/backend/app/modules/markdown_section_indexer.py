from __future__ import annotations

import hashlib
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import delete, insert, select, text, update

from app.core.config import Settings
from app.core.events import record_agent_event
from app.core.time import utc_now_iso
from app.db.models import document_sections, source_artifacts
from app.db.session import create_sqlite_engine
from app.modules._json import dumps, loads

ATX_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$")
TABLE_ROW_RE = re.compile(r"^\|.+\|$")
DATE_PATTERN = re.compile(r"(20\d{2})[-_](\d{2})[-_](\d{2})")
DATE_PREFIX_PATTERN = re.compile(r"^(20\d{2}-\d{2}-\d{2})(?:[-_\s]|$)")
SYMBOL_RE = re.compile(r"\$?[A-Z]{1,5}(?:\.[A-Z])?")
TAG_RE = re.compile(r"(?<!\A)(?<!\n)#([\w\u4e00-\u9fff-]+)")
CJK_RE = re.compile(r"[\u4e00-\u9fff]")

SPEAKERS = {"赵哥", "群友", "用户", "agent", "system", "管理员", "xiaozhaolucky"}
SYMBOL_STOPWORDS = {
    "A",
    "AN",
    "AND",
    "API",
    "CEO",
    "CFO",
    "COO",
    "CTO",
    "ETF",
    "FAQ",
    "FOR",
    "IPO",
    "LLC",
    "LTD",
    "NYSE",
    "OTC",
    "PRD",
    "SEC",
    "THE",
    "USD",
    "USA",
    "UTC",
    "VIX",
    "AI",
    "IT",
    "OR",
    "TO",
    "IN",
    "ON",
    "AT",
    "BY",
    "IS",
    "IF",
    "OF",
    "AS",
    "BE",
    "DO",
    "GO",
    "NO",
    "SO",
    "UP",
    "US",
    "PM",
    "AM",
}

ELIGIBLE_SOURCE_TYPES = ("markdown", "generated_summary", "prd", "engineering_doc")
MAX_SECTION_CHARS = 5000
TARGET_MIN_CHARS = 3000
TARGET_MAX_CHARS = 5000

FTS_DDL = """
CREATE VIRTUAL TABLE IF NOT EXISTS document_sections_fts
USING fts5(
  section_id UNINDEXED,
  title,
  heading_path,
  text,
  symbols,
  tags,
  speaker_refs
)
"""


@dataclass(frozen=True)
class MarkdownSectionIndexResult:
    indexed_artifacts: int
    indexed_sections: int
    skipped: int
    failed: int


@dataclass(frozen=True)
class SectionSearchResult:
    section_id: str
    artifact_id: str
    path: str
    heading_path: str
    snippet: str
    source_date: str | None
    start_line: int | None
    end_line: int | None


@dataclass(frozen=True)
class _ParsedSection:
    section_index: int
    heading_path: str
    section_type: str
    text: str
    start_line: int
    end_line: int
    split_index: int


@dataclass(frozen=True)
class _PendingEvent:
    event_type: str
    status: str
    input_summary: dict[str, Any]
    error: str | None = None


def index_markdown_sections(settings: Settings) -> MarkdownSectionIndexResult:
    engine = create_sqlite_engine(settings)
    indexed_artifacts = 0
    indexed_sections = 0
    skipped = 0
    failed = 0
    pending_events: list[_PendingEvent] = []

    with engine.begin() as conn:
        ensure_sections_fts(conn)
        rows = conn.execute(
            select(source_artifacts).where(
                source_artifacts.c.source_type.in_(ELIGIBLE_SOURCE_TYPES),
                source_artifacts.c.index_status.in_(("pending", "stale")),
            )
        ).mappings().all()

        for row in rows:
            artifact_id = row["id"]
            rel_path = row["path"]
            try:
                file_path = _resolve_artifact_path(settings, rel_path)
                if file_path is None:
                    raise ValueError(f"artifact path resolves outside repo_root: {rel_path}")
                if not file_path.is_file():
                    raise FileNotFoundError(f"artifact file not found: {rel_path}")

                content = file_path.read_text(encoding="utf-8", errors="replace")
                title = _artifact_title(rel_path)
                source_date = row["source_date"] or _source_date_from_path(rel_path)
                parsed_sections = _parse_markdown_sections(content)
                split_section_keys = {
                    key
                    for key, count in Counter(
                        (parsed.section_index, parsed.heading_path)
                        for parsed in parsed_sections
                    ).items()
                    if count > 1
                }
                artifact_path_key = rel_path.replace("\\", "/")

                old_section_ids = [
                    section_id
                    for section_id, in conn.execute(
                        select(document_sections.c.id).where(
                            document_sections.c.artifact_id == artifact_id
                        )
                    ).all()
                ]
                for section_id in old_section_ids:
                    conn.execute(
                        text("DELETE FROM document_sections_fts WHERE rowid = :rowid"),
                        {"rowid": _fts_rowid(section_id)},
                    )
                conn.execute(
                    delete(document_sections).where(
                        document_sections.c.artifact_id == artifact_id
                    )
                )

                now = utc_now_iso()
                section_count = 0
                for parsed in parsed_sections:
                    section_key = _section_key(
                        artifact_path_key,
                        parsed.heading_path,
                        parsed.section_index,
                        parsed.split_index,
                    )
                    text_digest = _text_digest(parsed.text)
                    symbols = _extract_symbols(parsed.text)
                    tags = _extract_tags(parsed.text)
                    speaker_refs = _extract_speaker_refs(parsed.text)
                    section_id = str(uuid4())
                    metadata = (
                        {"split_index": parsed.split_index}
                        if (parsed.section_index, parsed.heading_path) in split_section_keys
                        else None
                    )

                    conn.execute(
                        insert(document_sections).values(
                            id=section_id,
                            artifact_id=artifact_id,
                            section_key=section_key,
                            text_digest=text_digest,
                            section_index=parsed.section_index,
                            heading_path=parsed.heading_path,
                            section_type=parsed.section_type,
                            text=parsed.text,
                            start_line=parsed.start_line,
                            end_line=parsed.end_line,
                            source_date=source_date,
                            symbols_json=dumps(symbols),
                            tags_json=dumps(tags),
                            speaker_refs_json=dumps(speaker_refs),
                            metadata_json=dumps(metadata),
                            created_at=now,
                            updated_at=now,
                        )
                    )
                    conn.execute(
                        text(
                            "INSERT INTO document_sections_fts("
                            "rowid, section_id, title, heading_path, text, "
                            "symbols, tags, speaker_refs"
                            ") VALUES ("
                            ":rowid, :section_id, :title, :heading_path, :text, "
                            ":symbols, :tags, :speaker_refs"
                            ")"
                        ),
                        {
                            "rowid": _fts_rowid(section_id),
                            "section_id": section_id,
                            "title": title,
                            "heading_path": parsed.heading_path,
                            "text": parsed.text,
                            "symbols": " ".join(symbols),
                            "tags": " ".join(tags),
                            "speaker_refs": " ".join(speaker_refs),
                        },
                    )
                    section_count += 1

                conn.execute(
                    update(source_artifacts)
                    .where(source_artifacts.c.id == artifact_id)
                    .values(index_status="indexed", indexed_at=now, updated_at=now)
                )
                indexed_artifacts += 1
                indexed_sections += section_count
                pending_events.append(
                    _PendingEvent(
                        event_type="markdown_sections_indexed",
                        status="completed",
                        input_summary={
                            "artifact_id": artifact_id,
                            "path": rel_path,
                            "section_count": section_count,
                        },
                    )
                )
            except Exception as exc:
                failed += 1
                now = utc_now_iso()
                metadata = loads(row.get("metadata_json"), default={}) or {}
                if not isinstance(metadata, dict):
                    metadata = {}
                metadata["index_error"] = str(exc)
                conn.execute(
                    update(source_artifacts)
                    .where(source_artifacts.c.id == artifact_id)
                    .values(
                        index_status="failed",
                        metadata_json=dumps(metadata),
                        updated_at=now,
                    )
                )
                pending_events.append(
                    _PendingEvent(
                        event_type="artifact_index_failed",
                        status="failed",
                        input_summary={"artifact_id": artifact_id, "path": rel_path},
                        error=str(exc),
                    )
                )

    for event in pending_events:
        record_agent_event(
            settings,
            event_type=event.event_type,
            status=event.status,
            input_summary=event.input_summary,
            error=event.error,
        )

    return MarkdownSectionIndexResult(
        indexed_artifacts=indexed_artifacts,
        indexed_sections=indexed_sections,
        skipped=skipped,
        failed=failed,
    )


def search_document_sections(
    settings: Settings, query: str, *, limit: int = 10
) -> list[SectionSearchResult]:
    normalized_query = query.strip()
    if not normalized_query:
        return []

    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        ensure_sections_fts(conn)
        if CJK_RE.search(normalized_query):
            rows = _search_sections_like(conn, normalized_query, limit=limit)
        else:
            rows = _search_sections_fts(conn, normalized_query, limit=limit)
            rows = _filter_rows_by_query_terms(rows, normalized_query)
            if not rows:
                rows = _search_sections_like(conn, normalized_query, limit=limit)

    return [
        SectionSearchResult(
            section_id=row["section_id"],
            artifact_id=row["artifact_id"],
            path=row["path"],
            heading_path=row["heading_path"],
            snippet=(row["text"] or "")[:200],
            source_date=row["source_date"],
            start_line=row["start_line"],
            end_line=row["end_line"],
        )
        for row in rows
    ]


def ensure_sections_fts(conn: Any) -> None:
    conn.execute(text(FTS_DDL))


def _resolve_artifact_path(settings: Settings, rel_path: str) -> Path | None:
    repo_root = settings.repo_root.resolve()
    file_path = (repo_root / rel_path).resolve()
    try:
        file_path.relative_to(repo_root)
    except ValueError:
        return None
    return file_path


def _artifact_title(rel_path: str) -> str:
    stem = Path(rel_path).stem
    stripped = DATE_PREFIX_PATTERN.sub("", stem)
    return stripped or stem


def _source_date_from_path(rel_path: str) -> str | None:
    match = DATE_PATTERN.search(rel_path.replace("\\", "/"))
    if match is None:
        return None
    return "-".join(match.groups())


def _section_key(
    artifact_path: str, heading_path: str, section_index: int, split_index: int
) -> str:
    payload = f"{artifact_path}|{heading_path}|{section_index}|{split_index}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _text_digest(section_text: str) -> str:
    return hashlib.sha256(section_text.encode("utf-8")).hexdigest()


def _fts_rowid(section_id: str) -> int:
    return int(section_id.replace("-", "")[:15], 16)


def _parse_markdown_sections(content: str) -> list[_ParsedSection]:
    lines = content.splitlines()
    if not lines:
        return [
            _ParsedSection(
                section_index=0,
                heading_path="",
                section_type="document",
                text="",
                start_line=1,
                end_line=1,
                split_index=0,
            )
        ]

    headings: list[tuple[int, int, str]] = []
    for line_no, line in enumerate(lines, start=1):
        match = ATX_HEADING_RE.match(line)
        if match is None:
            continue
        level = len(match.group(1))
        title = match.group(2).strip()
        headings.append((line_no, level, title))

    if not headings:
        text_value = "\n".join(lines)
        return _split_oversized_section(
            section_index=0,
            heading_path="",
            section_type="document",
            text=text_value,
            start_line=1,
            end_line=len(lines),
        )

    heading_paths = _build_heading_paths(headings)
    raw_sections: list[_ParsedSection] = []
    for index, (start_line, _level, _title) in enumerate(headings):
        end_line = _section_end_line(headings, index, len(lines))
        section_lines = lines[start_line - 1 : end_line]
        section_text = "\n".join(section_lines)
        raw_sections.append(
            _ParsedSection(
                section_index=index,
                heading_path=heading_paths[index],
                section_type="heading",
                text=section_text,
                start_line=start_line,
                end_line=end_line,
                split_index=0,
            )
        )

    parsed: list[_ParsedSection] = []
    for section in raw_sections:
        parsed.extend(
            _split_oversized_section(
                section_index=section.section_index,
                heading_path=section.heading_path,
                section_type=section.section_type,
                text=section.text,
                start_line=section.start_line,
                end_line=section.end_line,
            )
        )
    return parsed


def _build_heading_paths(headings: list[tuple[int, int, str]]) -> list[str]:
    stack: list[tuple[int, str]] = []
    paths: list[str] = []
    for _line_no, level, title in headings:
        while stack and stack[-1][0] >= level:
            stack.pop()
        stack.append((level, title))
        paths.append(" > ".join(item[1] for item in stack))
    return paths


def _section_end_line(headings: list[tuple[int, int, str]], index: int, total_lines: int) -> int:
    if index + 1 < len(headings):
        return headings[index + 1][0] - 1
    return total_lines


def _split_oversized_section(
    *,
    section_index: int,
    heading_path: str,
    section_type: str,
    text: str,
    start_line: int,
    end_line: int,
) -> list[_ParsedSection]:
    if len(text) <= MAX_SECTION_CHARS:
        return [
            _ParsedSection(
                section_index=section_index,
                heading_path=heading_path,
                section_type=section_type,
                text=text,
                start_line=start_line,
                end_line=end_line,
                split_index=0,
            )
        ]

    blocks = _content_blocks(text)
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    def flush() -> None:
        nonlocal current, current_len
        if current:
            chunks.append("\n\n".join(current))
            current = []
            current_len = 0

    for block in blocks:
        block_len = len(block)
        if block_len > MAX_SECTION_CHARS:
            flush()
            chunks.append(block)
            continue
        if current and current_len + block_len + 2 > TARGET_MAX_CHARS:
            flush()
        current.append(block)
        current_len += block_len + (2 if current_len else 0)
        if current_len >= TARGET_MIN_CHARS:
            flush()

    flush()

    if not chunks:
        chunks = [text]

    return [
        _ParsedSection(
            section_index=section_index,
            heading_path=heading_path,
            section_type=section_type,
            text=chunk,
            start_line=start_line,
            end_line=end_line,
            split_index=split_index,
        )
        for split_index, chunk in enumerate(chunks)
    ]


def _content_blocks(text: str) -> list[str]:
    lines = text.splitlines()
    blocks: list[str] = []
    index = 0
    while index < len(lines):
        line = lines[index]
        if not line.strip():
            index += 1
            continue
        if TABLE_ROW_RE.match(line):
            table_lines = [line]
            index += 1
            while index < len(lines) and TABLE_ROW_RE.match(lines[index]):
                table_lines.append(lines[index])
                index += 1
            blocks.append("\n".join(table_lines))
            continue

        paragraph_lines = [line]
        index += 1
        while index < len(lines):
            next_line = lines[index]
            if not next_line.strip():
                break
            if TABLE_ROW_RE.match(next_line):
                break
            paragraph_lines.append(next_line)
            index += 1
        blocks.append("\n".join(paragraph_lines))
        if index < len(lines) and not lines[index].strip():
            index += 1
    return blocks


def _extract_symbols(text: str) -> list[str]:
    seen: set[str] = set()
    symbols: list[str] = []
    for match in SYMBOL_RE.findall(text):
        symbol = match.lstrip("$")
        if not any(char.isalpha() for char in symbol):
            continue
        if symbol in SYMBOL_STOPWORDS:
            continue
        if symbol not in seen:
            seen.add(symbol)
            symbols.append(symbol)
        if len(symbols) >= 20:
            break
    return symbols


def _extract_tags(text: str) -> list[str]:
    seen: set[str] = set()
    tags: list[str] = []
    for match in TAG_RE.findall(text):
        if match not in seen:
            seen.add(match)
            tags.append(match)
    return tags


def _extract_speaker_refs(text: str) -> list[str]:
    return sorted(speaker for speaker in SPEAKERS if speaker in text)


def _search_sections_fts(conn: Any, query: str, *, limit: int) -> list[dict[str, Any]]:
    rows = conn.execute(
        text(
            """
            SELECT
                ds.id AS section_id,
                ds.artifact_id AS artifact_id,
                sa.path AS path,
                ds.heading_path AS heading_path,
                ds.text AS text,
                ds.source_date AS source_date,
                ds.start_line AS start_line,
                ds.end_line AS end_line
            FROM document_sections_fts fts
            JOIN document_sections ds ON ds.id = fts.section_id
            JOIN source_artifacts sa ON sa.id = ds.artifact_id
            WHERE document_sections_fts MATCH :query
            LIMIT :limit
            """
        ),
        {"query": query, "limit": limit},
    ).mappings().all()
    return [dict(row) for row in rows]


def _search_sections_like(conn: Any, query: str, *, limit: int) -> list[dict[str, Any]]:
    terms = _query_terms(query)
    text_conditions: list[str] = []
    params: dict[str, Any] = {"limit": limit}
    for index, term in enumerate(terms):
        key = f"term_{index}"
        text_conditions.append(f"ds.text LIKE :{key}")
        params[key] = f"%{term}%"
    where_clause = " AND ".join(text_conditions)
    rows = conn.execute(
        text(
            f"""
            SELECT
                ds.id AS section_id,
                ds.artifact_id AS artifact_id,
                sa.path AS path,
                ds.heading_path AS heading_path,
                ds.text AS text,
                ds.source_date AS source_date,
                ds.start_line AS start_line,
                ds.end_line AS end_line
            FROM document_sections ds
            JOIN source_artifacts sa ON sa.id = ds.artifact_id
            WHERE {where_clause}
            LIMIT :limit
            """
        ),
        params,
    ).mappings().all()
    return [dict(row) for row in rows]


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
