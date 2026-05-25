from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime, time
from pathlib import Path
from typing import Any

from sqlalchemy import delete, insert, text

from app.core.config import Settings
from app.core.time import utc_now_iso
from app.db.models import document_chunks
from app.db.session import create_sqlite_engine
from app.modules._json import dumps
from app.modules.knowledge_source_registry import KnowledgeSource, list_local_knowledge_sources

SYMBOL_PATTERN = re.compile(r"\b[A-Z][A-Z0-9.-]{1,9}\b")
DATE_PATTERN = re.compile(r"(20\d{2})[-_/](\d{2})[-_/](\d{2})")


@dataclass(frozen=True)
class DocumentChunk:
    source_path: str
    source_type: str
    chunk_index: int
    symbol_hints: list[str]
    timestamp_hint: str | None
    confidence: float
    raw_text: str


@dataclass(frozen=True)
class IndexSummary:
    source_count: int
    indexed_count: int


def index_local_knowledge(
    settings: Settings,
    *,
    docs_root: str | Path | None = None,
) -> IndexSummary:
    sources = list_local_knowledge_sources(settings, docs_root=docs_root)
    chunks: list[DocumentChunk] = []
    for source in sources:
        chunks.extend(parse_source(source))

    engine = create_sqlite_engine(settings)
    indexed_at = utc_now_iso()
    with engine.begin() as conn:
        ensure_knowledge_fts(conn)
        conn.execute(delete(document_chunks))
        conn.execute(text("DELETE FROM document_chunks_fts"))
        for chunk in chunks:
            chunk_id = _chunk_id(chunk)
            evidence_id = f"knowledge:{chunk_id}"
            conn.execute(
                insert(document_chunks).values(
                    id=chunk_id,
                    evidence_id=evidence_id,
                    source_path=chunk.source_path,
                    source_type=chunk.source_type,
                    chunk_index=chunk.chunk_index,
                    symbol_hints=dumps(chunk.symbol_hints),
                    timestamp_hint=chunk.timestamp_hint,
                    confidence=chunk.confidence,
                    raw_text=chunk.raw_text,
                    content_hash=_content_hash(chunk.raw_text),
                    indexed_at=indexed_at,
                )
            )
            conn.execute(
                text(
                    "INSERT INTO document_chunks_fts(rowid, chunk_id, raw_text) "
                    "VALUES (:rowid, :chunk_id, :raw_text)"
                ),
                {"rowid": _fts_rowid(chunk_id), "chunk_id": chunk_id, "raw_text": chunk.raw_text},
            )
    return IndexSummary(source_count=len(sources), indexed_count=len(chunks))


def ensure_knowledge_fts(conn: Any) -> None:
    conn.execute(
        text(
            "CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts "
            "USING fts5(chunk_id UNINDEXED, raw_text)"
        )
    )


def parse_source(source: KnowledgeSource) -> list[DocumentChunk]:
    if source.source_type == "markdown_summary":
        return _parse_markdown(source.path, source.source_type)
    return _parse_jsonl(source.path, source.source_type)


def _parse_markdown(path: Path, source_type: str) -> list[DocumentChunk]:
    text_value = path.read_text(encoding="utf-8").strip()
    if not text_value:
        return []

    blocks = [block.strip() for block in re.split(r"\n\s*\n", text_value) if block.strip()]
    timestamp_hint = _timestamp_from_path(path)
    document_symbol_hints = _symbol_hints(text_value)
    chunks: list[DocumentChunk] = []
    for index, block in enumerate(blocks):
        normalized = _normalize_text(block)
        if not normalized:
            continue
        chunks.append(
            DocumentChunk(
                source_path=str(path),
                source_type=source_type,
                chunk_index=index,
                symbol_hints=sorted(set(_symbol_hints(normalized)) | set(document_symbol_hints)),
                timestamp_hint=timestamp_hint,
                confidence=0.82,
                raw_text=normalized,
            )
        )
    return chunks


def _parse_jsonl(path: Path, source_type: str) -> list[DocumentChunk]:
    chunks: list[DocumentChunk] = []
    with path.open("r", encoding="utf-8") as handle:
        for index, line in enumerate(handle):
            if not line.strip():
                continue
            record = json.loads(line)
            raw_text = _record_text(record)
            if not raw_text:
                continue
            timestamp_hint = _normalize_timestamp(
                record.get("timestamp")
                or record.get("published_at")
                or record.get("date")
                or record.get("created_at")
            )
            chunks.append(
                DocumentChunk(
                    source_path=str(path),
                    source_type=source_type,
                    chunk_index=index,
                    symbol_hints=_record_symbols(record, raw_text),
                    timestamp_hint=timestamp_hint,
                    confidence=_record_confidence(record),
                    raw_text=raw_text,
                )
            )
    return chunks


def _record_text(record: dict[str, Any]) -> str:
    parts = [
        record.get("raw_text"),
        record.get("text"),
        record.get("title"),
        record.get("headline"),
        record.get("summary"),
        record.get("body"),
    ]
    return _normalize_text("\n".join(str(part) for part in parts if part))


def _record_symbols(record: dict[str, Any], raw_text: str) -> list[str]:
    values: list[str] = []
    for key in ("symbol", "ticker"):
        value = record.get(key)
        if value:
            values.append(str(value))
    for key in ("symbols", "tickers"):
        value = record.get(key)
        if isinstance(value, list):
            values.extend(str(item) for item in value)
    values.extend(_symbol_hints(raw_text))
    return sorted({value.strip().upper() for value in values if value.strip()})


def _record_confidence(record: dict[str, Any]) -> float:
    value = record.get("confidence")
    if value is None:
        return 0.78
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return 0.78


def _symbol_hints(raw_text: str) -> list[str]:
    return sorted(set(SYMBOL_PATTERN.findall(raw_text)))


def _timestamp_from_path(path: Path) -> str | None:
    match = DATE_PATTERN.search(str(path))
    if match is None:
        return None
    value = "-".join(match.groups())
    return datetime.combine(datetime.fromisoformat(value).date(), time.min, tzinfo=UTC).isoformat()


def _normalize_timestamp(value: Any) -> str | None:
    if not value:
        return None
    try:
        raw = str(value)
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
            return datetime.combine(
                datetime.fromisoformat(raw).date(),
                time.min,
                tzinfo=UTC,
            ).isoformat()
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).isoformat()


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _chunk_id(chunk: DocumentChunk) -> str:
    payload = "\n".join([chunk.source_path, str(chunk.chunk_index), chunk.raw_text])
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]


def _content_hash(raw_text: str) -> str:
    return hashlib.sha256(raw_text.encode("utf-8")).hexdigest()


def _fts_rowid(chunk_id: str) -> int:
    return int(chunk_id[:15], 16)
