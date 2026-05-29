from __future__ import annotations

import hashlib
import mimetypes
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import select, update

from app.core.config import Settings
from app.core.events import record_agent_event
from app.core.time import utc_now_iso
from app.db.models import source_artifacts
from app.db.session import create_sqlite_engine
from app.modules._json import dumps

# Data scan roots are always relative to settings.repo_root, not settings.data_dir.
DATE_PREFIX_PATTERN = re.compile(r"^(20\d{2})[-_](\d{2})[-_](\d{2})(?:[-_]|$)")
DATE_PATTERN = re.compile(r"(20\d{2})[-_](\d{2})[-_](\d{2})")
MARKET_SESSION_LABELS = ("盘前", "盘中", "盘后", "休市", "全天回顾")
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif"}

EXCLUDED_PATTERNS = (
    "**/.vitepress/cache/**",
    "**/.vitepress/dist/**",
    "**/node_modules/**",
    "**/.next/**",
    "**/__pycache__/**",
    "**/.git/**",
)

CLASSIFICATION_RULES: tuple[tuple[str, str, int, str], ...] = (
    ("docs/summaries/**/*.md", "generated_summary", 1, "primary_financial_corpus"),
    ("docs/opportunities/**/*.md", "markdown", 1, "financial_opportunity_corpus"),
    ("docs/trading-experiences/**/*.md", "markdown", 1, "trading_experience_corpus"),
    ("docs/assets/chat-images/**", "image", 0, "image_metadata_only"),
    ("data/trader-agent/raw/**/*.jsonl", "raw_chat", 1, "raw_financial_chat_corpus"),
    ("data/trader-agent/imports/**", "raw_chat", 0, "imported_chat_not_for_memory"),
    ("docs/research-agent/target-system/**/*.md", "prd", 0, "engineering_prd_not_for_memory"),
    (
        "docs/research-agent/**/*.md",
        "engineering_doc",
        0,
        "engineering_doc_not_for_memory",
    ),
    ("docs/**/*.md", "markdown", 0, "general_docs_not_for_memory"),
)


@dataclass(frozen=True)
class CatalogResult:
    discovered: int
    updated: int
    excluded: int
    failed: int


@dataclass(frozen=True)
class _PendingEvent:
    event_type: str
    status: str
    input_summary: dict[str, Any]


def build_artifact_catalog(settings: Settings, docs_root: Path | None = None) -> CatalogResult:
    repo_root = settings.repo_root.resolve()
    resolved_docs_root = (docs_root or (repo_root / "docs")).resolve()
    scan_roots = (
        resolved_docs_root,
        repo_root / "data" / "trader-agent" / "raw",
        repo_root / "data" / "trader-agent" / "imports",
    )

    discovered = 0
    updated = 0
    excluded = 0
    failed = 0
    pending_events: list[_PendingEvent] = []
    now = utc_now_iso()

    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        existing_rows = {
            row["path"]: dict(row)
            for row in conn.execute(
                select(
                    source_artifacts.c.path,
                    source_artifacts.c.content_hash,
                    source_artifacts.c.index_status,
                    source_artifacts.c.metadata_json,
                )
            ).mappings().all()
        }

        for scan_root in scan_roots:
            if not scan_root.exists():
                continue
            for file_path in sorted(scan_root.rglob("*")):
                if not file_path.is_file():
                    continue

                physical_rel = _physical_relative_path(file_path, repo_root)
                logical_path = _logical_path(
                    file_path,
                    repo_root=repo_root,
                    docs_root=resolved_docs_root,
                )
                excluded_pattern = _match_excluded_pattern(physical_rel)
                classification = _classify_logical_path(logical_path, file_path.suffix.lower())

                if excluded_pattern is not None:
                    outcome, error_message = _upsert_excluded_artifact(
                        conn,
                        existing_rows=existing_rows,
                        file_path=file_path,
                        physical_rel=physical_rel,
                        logical_path=logical_path,
                        excluded_pattern=excluded_pattern,
                        classification=classification,
                        now=now,
                    )
                    if outcome == "excluded":
                        excluded += 1
                        pending_events.append(
                            _PendingEvent(
                                event_type="artifact_excluded",
                                status="completed",
                                input_summary={
                                    "path": physical_rel,
                                    "reason": excluded_pattern,
                                },
                            )
                        )
                    elif outcome == "failed" and error_message is not None:
                        failed += 1
                        pending_events.append(
                            _PendingEvent(
                                event_type="artifact_index_failed",
                                status="failed",
                                input_summary={
                                    "path": physical_rel,
                                    "error": error_message,
                                },
                            )
                        )
                    continue

                if classification is None:
                    continue

                source_type, memory_eligible, memory_eligible_reason = classification
                try:
                    content_hash, byte_size = _file_hash_and_size(file_path)
                except OSError as exc:
                    outcome, error_message = _upsert_failed_artifact(
                        conn,
                        existing_rows=existing_rows,
                        physical_rel=physical_rel,
                        logical_path=logical_path,
                        source_type=source_type,
                        file_path=file_path,
                        error=str(exc),
                        now=now,
                    )
                    if outcome == "failed" and error_message is not None:
                        failed += 1
                        pending_events.append(
                            _PendingEvent(
                                event_type="artifact_index_failed",
                                status="failed",
                                input_summary={"path": physical_rel, "error": error_message},
                            )
                        )
                    continue

                mime_type = _mime_type(file_path)
                title = _extract_title(file_path)
                source_date = _extract_source_date(logical_path, file_path)
                market_session = _extract_market_session(file_path)
                metadata_json = dumps(
                    {
                        "logical_path": logical_path,
                        "source_type": source_type,
                    }
                )

                existing = existing_rows.get(physical_rel)
                if existing is None:
                    artifact_id = str(uuid4())
                    conn.execute(
                        source_artifacts.insert().values(
                            id=artifact_id,
                            source_type=source_type,
                            path=physical_rel,
                            content_hash=content_hash,
                            title=title,
                            source_date=source_date,
                            market_session=market_session,
                            mime_type=mime_type,
                            byte_size=byte_size,
                            indexed_at=None,
                            index_status="pending",
                            memory_eligible=memory_eligible,
                            memory_eligible_reason=memory_eligible_reason,
                            excluded_reason=None,
                            metadata_json=metadata_json,
                            created_at=now,
                            updated_at=now,
                        )
                    )
                    existing_rows[physical_rel] = {
                        "path": physical_rel,
                        "content_hash": content_hash,
                        "index_status": "pending",
                    }
                    discovered += 1
                    pending_events.append(
                        _PendingEvent(
                            event_type="artifact_discovered",
                            status="completed",
                            input_summary={
                                "path": physical_rel,
                                "source_type": source_type,
                                "hash": content_hash,
                            },
                        )
                    )
                    continue

                unchanged = (
                    existing.get("content_hash") == content_hash
                    and existing.get("index_status") not in {"failed", "excluded"}
                )
                if unchanged:
                    continue

                old_hash = existing.get("content_hash")
                was_failed = existing.get("index_status") == "failed"
                conn.execute(
                    update(source_artifacts)
                    .where(source_artifacts.c.path == physical_rel)
                    .values(
                        source_type=source_type,
                        content_hash=content_hash,
                        title=title,
                        source_date=source_date,
                        market_session=market_session,
                        mime_type=mime_type,
                        byte_size=byte_size,
                        index_status="pending" if was_failed else "stale",
                        memory_eligible=memory_eligible,
                        memory_eligible_reason=memory_eligible_reason,
                        excluded_reason=None,
                        metadata_json=metadata_json,
                        updated_at=now,
                    )
                )
                existing_rows[physical_rel]["content_hash"] = content_hash
                existing_rows[physical_rel]["index_status"] = "pending" if was_failed else "stale"
                if was_failed:
                    discovered += 1
                    pending_events.append(
                        _PendingEvent(
                            event_type="artifact_discovered",
                            status="completed",
                            input_summary={
                                "path": physical_rel,
                                "source_type": source_type,
                                "hash": content_hash,
                            },
                        )
                    )
                else:
                    updated += 1
                    pending_events.append(
                        _PendingEvent(
                            event_type="artifact_changed",
                            status="completed",
                            input_summary={
                                "path": physical_rel,
                                "old_hash": old_hash,
                                "new_hash": content_hash,
                            },
                        )
                    )

    for event in pending_events:
        record_agent_event(
            settings,
            event_type=event.event_type,
            status=event.status,
            input_summary=event.input_summary,
        )

    return CatalogResult(
        discovered=discovered,
        updated=updated,
        excluded=excluded,
        failed=failed,
    )


def _physical_relative_path(file_path: Path, repo_root: Path) -> str:
    try:
        return file_path.resolve().relative_to(repo_root.resolve()).as_posix()
    except ValueError as exc:
        raise ValueError(f"Scanned file is outside repo_root: {file_path}") from exc


def _logical_path(file_path: Path, *, repo_root: Path, docs_root: Path) -> str:
    resolved = file_path.resolve()
    docs_root_resolved = docs_root.resolve()
    if resolved == docs_root_resolved or docs_root_resolved in resolved.parents:
        return "docs/" + resolved.relative_to(docs_root_resolved).as_posix()
    return _physical_relative_path(resolved, repo_root)


def _glob_match(path: str, pattern: str) -> bool:
    return re.fullmatch(_glob_to_regex(pattern), path) is not None


def _glob_to_regex(pattern: str) -> str:
    parts = ["^"]
    index = 0
    if pattern.startswith("**/"):
        parts.append("(?:.*/)?")
        index = 3

    while index < len(pattern):
        if index + 2 <= len(pattern) and pattern[index : index + 2] == "**":
            if index + 2 == len(pattern):
                parts.append(".*")
                index += 2
                continue
            if pattern[index + 2] == "/":
                parts.append("(?:.*/)?")
                index += 3
                continue
            parts.append(".*")
            index += 2
            continue
        if pattern[index] == "*":
            parts.append("[^/]*")
            index += 1
            continue

        literal_start = index
        while index < len(pattern) and pattern[index] not in "*":
            index += 1
        parts.append(re.escape(pattern[literal_start:index]))

    if parts[-1] != ".*":
        parts.append("$")
    else:
        parts.append("$")
    return "".join(parts)


def _match_excluded_pattern(relative_path: str) -> str | None:
    for pattern in EXCLUDED_PATTERNS:
        if _glob_match(relative_path, pattern):
            return pattern
    return None


def _classify_logical_path(
    logical_path: str,
    suffix: str,
) -> tuple[str, int, str] | None:
    for pattern, source_type, memory_eligible, reason in CLASSIFICATION_RULES:
        if pattern == "docs/assets/chat-images/**":
            if _glob_match(logical_path, pattern) and suffix in IMAGE_SUFFIXES:
                return source_type, memory_eligible, reason
            continue
        if _glob_match(logical_path, pattern):
            return source_type, memory_eligible, reason
    return None


def _classify_fallback_suffix(suffix: str) -> tuple[str, int, str]:
    if suffix == ".md":
        return "markdown", 0, "excluded_fallback_markdown"
    if suffix in IMAGE_SUFFIXES:
        return "image", 0, "excluded_fallback_image"
    if suffix == ".jsonl":
        return "raw_chat", 0, "excluded_fallback_raw_chat"
    return "markdown", 0, "excluded_fallback_unknown"


def _upsert_excluded_artifact(
    conn: Any,
    *,
    existing_rows: dict[str, dict[str, Any]],
    file_path: Path,
    physical_rel: str,
    logical_path: str,
    excluded_pattern: str,
    classification: tuple[str, int, str] | None,
    now: str,
) -> tuple[str | None, str | None]:
    if classification is None:
        source_type, _, _memory_eligible_reason = _classify_fallback_suffix(
            file_path.suffix.lower()
        )
        memory_eligible = 0
    else:
        source_type, _, _memory_eligible_reason = classification
        memory_eligible = 0

    try:
        content_hash, byte_size = _file_hash_and_size(file_path)
    except OSError as exc:
        outcome, error_message = _upsert_failed_artifact(
            conn,
            existing_rows=existing_rows,
            physical_rel=physical_rel,
            logical_path=logical_path,
            source_type=source_type,
            file_path=file_path,
            error=str(exc),
            now=now,
        )
        return outcome, error_message

    mime_type = _mime_type(file_path)
    title = _extract_title(file_path)
    source_date = _extract_source_date(logical_path, file_path)
    market_session = _extract_market_session(file_path)
    metadata_json = dumps(
        {
            "logical_path": logical_path,
            "source_type": source_type,
            "excluded_pattern": excluded_pattern,
        }
    )

    existing = existing_rows.get(physical_rel)
    if (
        existing is not None
        and existing.get("content_hash") == content_hash
        and existing.get("index_status") == "excluded"
    ):
        return None, None

    if existing is None:
        conn.execute(
            source_artifacts.insert().values(
                id=str(uuid4()),
                source_type=source_type,
                path=physical_rel,
                content_hash=content_hash,
                title=title,
                source_date=source_date,
                market_session=market_session,
                mime_type=mime_type,
                byte_size=byte_size,
                indexed_at=None,
                index_status="excluded",
                memory_eligible=memory_eligible,
                memory_eligible_reason="excluded_by_pattern",
                excluded_reason=excluded_pattern,
                metadata_json=metadata_json,
                created_at=now,
                updated_at=now,
            )
        )
        existing_rows[physical_rel] = {
            "path": physical_rel,
            "content_hash": content_hash,
            "index_status": "excluded",
            "metadata_json": metadata_json,
        }
        return "excluded", None

    conn.execute(
        update(source_artifacts)
        .where(source_artifacts.c.path == physical_rel)
        .values(
            source_type=source_type,
            content_hash=content_hash,
            title=title,
            source_date=source_date,
            market_session=market_session,
            mime_type=mime_type,
            byte_size=byte_size,
            index_status="excluded",
            memory_eligible=memory_eligible,
            memory_eligible_reason="excluded_by_pattern",
            excluded_reason=excluded_pattern,
            metadata_json=metadata_json,
            updated_at=now,
        )
    )
    existing_rows[physical_rel]["content_hash"] = content_hash
    existing_rows[physical_rel]["index_status"] = "excluded"
    existing_rows[physical_rel]["metadata_json"] = metadata_json
    return "excluded", None


def _upsert_failed_artifact(
    conn: Any,
    *,
    existing_rows: dict[str, dict[str, Any]],
    physical_rel: str,
    logical_path: str,
    source_type: str,
    file_path: Path,
    error: str,
    now: str,
) -> tuple[str | None, str | None]:
    title = _extract_title(file_path)
    source_date = _extract_source_date(logical_path, file_path)
    market_session = _extract_market_session(file_path)
    mime_type = _mime_type(file_path)
    metadata_json = dumps({"logical_path": logical_path, "error": error})

    existing = existing_rows.get(physical_rel)
    if existing is not None and existing.get("index_status") == "failed":
        if existing.get("metadata_json") == metadata_json:
            return None, None

    if existing is None:
        conn.execute(
            source_artifacts.insert().values(
                id=str(uuid4()),
                source_type=source_type,
                path=physical_rel,
                content_hash=None,
                title=title,
                source_date=source_date,
                market_session=market_session,
                mime_type=mime_type,
                byte_size=None,
                indexed_at=None,
                index_status="failed",
                memory_eligible=0,
                memory_eligible_reason="index_failed",
                excluded_reason=None,
                metadata_json=metadata_json,
                created_at=now,
                updated_at=now,
            )
        )
        existing_rows[physical_rel] = {
            "path": physical_rel,
            "index_status": "failed",
            "metadata_json": metadata_json,
        }
        return "failed", error

    conn.execute(
        update(source_artifacts)
        .where(source_artifacts.c.path == physical_rel)
        .values(
            source_type=source_type,
            content_hash=None,
            title=title,
            source_date=source_date,
            market_session=market_session,
            mime_type=mime_type,
            byte_size=None,
            index_status="failed",
            memory_eligible=0,
            memory_eligible_reason="index_failed",
            excluded_reason=None,
            metadata_json=metadata_json,
            updated_at=now,
        )
    )
    existing_rows[physical_rel]["index_status"] = "failed"
    existing_rows[physical_rel]["metadata_json"] = metadata_json
    return "failed", error


def _file_hash_and_size(file_path: Path) -> tuple[str, int]:
    data = file_path.read_bytes()
    return hashlib.sha256(data).hexdigest(), len(data)


def _mime_type(file_path: Path) -> str:
    guessed, _encoding = mimetypes.guess_type(file_path.name)
    return guessed or "application/octet-stream"


def _extract_title(file_path: Path) -> str:
    stem = file_path.stem
    match = DATE_PREFIX_PATTERN.match(stem)
    if match is None:
        return stem
    remainder = stem[match.end() :].lstrip("-_")
    return remainder or stem


def _extract_source_date(logical_path: str, file_path: Path) -> str | None:
    for candidate in (logical_path, file_path.name):
        match = DATE_PATTERN.search(candidate)
        if match is not None:
            return "-".join(match.groups())
    return None


def _extract_market_session(file_path: Path) -> str | None:
    for label in MARKET_SESSION_LABELS:
        if label in file_path.stem:
            return label
    return None
