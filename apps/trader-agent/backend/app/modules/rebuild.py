from __future__ import annotations

import shutil
import time
from dataclasses import dataclass

from sqlalchemy import select, text, update

from app.core.config import Settings
from app.core.events import record_agent_event
from app.core.time import utc_now_iso
from app.db.models import agent_events, memory_items, source_artifacts
from app.db.session import create_sqlite_engine
from app.modules.json_row_codec import coerce_json_value, serialize_json_field
from app.modules.artifact_catalog import CatalogResult, build_artifact_catalog
from app.modules.evidence_ref import EvidenceRef, ResolverStatus
from app.modules.markdown_section_indexer import (
    MarkdownSectionIndexResult,
    index_markdown_sections,
)

_EVIDENCE_REVIEW_FLAGS = frozenset({"evidence_stale", "evidence_unresolved"})
_EMPTY_CATALOG = CatalogResult(discovered=0, updated=0, excluded=0, failed=0)


@dataclass
class EvidenceRevalidationReport:
    total_memory_items: int
    total_evidence_refs: int
    resolved: int
    stale: int
    unresolved: int
    affected_memory_ids: list[str]


@dataclass
class IncrementalRebuildReport:
    catalog: CatalogResult
    sections: MarkdownSectionIndexResult
    evidence: EvidenceRevalidationReport
    duration_ms: int


def _backup_timestamp() -> str:
    return utc_now_iso().replace(":", "").replace("T", "-")


def _merge_evidence_review_flags(
    existing_flags: list[str],
    *,
    has_stale: bool,
    has_unresolved: bool,
) -> list[str]:
    merged = [flag for flag in existing_flags if flag not in _EVIDENCE_REVIEW_FLAGS]
    if has_stale:
        merged.append("evidence_stale")
    if has_unresolved:
        merged.append("evidence_unresolved")
    return merged


def _normalize_review_flags(raw_flags) -> list[str]:
    flags = coerce_json_value(raw_flags, [])
    if not isinstance(flags, list):
        return []
    return list(flags)


def _scan_memory_evidence(
    conn,
    engine,
    *,
    write: bool,
) -> tuple[EvidenceRevalidationReport, list[tuple[str, str]]]:
    total_memory_items = 0
    total_evidence_refs = 0
    resolved = 0
    stale = 0
    unresolved = 0
    affected_memory_ids: list[str] = []
    pending_conflict_events: list[tuple[str, str]] = []
    now = utc_now_iso()

    rows = (
        conn.execute(
            select(memory_items).where(memory_items.c.status.in_(("active", "conflicted")))
        )
        .mappings()
        .all()
    )

    for row in rows:
        total_memory_items += 1
        item_id = str(row["id"])
        refs = coerce_json_value(row.get("evidence_refs_json"), [])
        if not isinstance(refs, list):
            refs = []

        item_has_stale = False
        item_has_unresolved = False

        for ref_dict in refs:
            if not isinstance(ref_dict, dict):
                continue
            total_evidence_refs += 1
            resolved_ref = EvidenceRef.from_dict(ref_dict).resolve(engine)
            if resolved_ref.resolver_status == ResolverStatus.STALE:
                stale += 1
                item_has_stale = True
            elif resolved_ref.resolver_status == ResolverStatus.UNRESOLVED:
                unresolved += 1
                item_has_unresolved = True
            else:
                resolved += 1

        existing_flags = _normalize_review_flags(row.get("review_flags_json"))
        merged_flags = _merge_evidence_review_flags(
            existing_flags,
            has_stale=item_has_stale,
            has_unresolved=item_has_unresolved,
        )

        if write and merged_flags != existing_flags:
            conn.execute(
                text(
                    "UPDATE memory_items "
                    "SET review_flags_json = :review_flags_json, updated_at = :updated_at "
                    "WHERE id = :item_id"
                ),
                {
                    "review_flags_json": serialize_json_field(merged_flags),
                    "updated_at": now,
                    "item_id": item_id,
                },
            )

        if item_has_stale or item_has_unresolved:
            affected_memory_ids.append(item_id)
            if item_has_unresolved:
                pending_conflict_events.append((item_id, "evidence_unresolved"))

    report = EvidenceRevalidationReport(
        total_memory_items=total_memory_items,
        total_evidence_refs=total_evidence_refs,
        resolved=resolved,
        stale=stale,
        unresolved=unresolved,
        affected_memory_ids=affected_memory_ids,
    )
    return report, pending_conflict_events


def _conflict_event_already_recorded(
    settings: Settings,
    *,
    memory_item_id: str,
    reason: str,
) -> bool:
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        rows = conn.execute(
            select(agent_events.c.input_summary)
            .where(agent_events.c.event_type == "memory_conflict_marked")
            .order_by(agent_events.c.timestamp.desc())
            .limit(200)
        ).all()

    for (input_summary,) in rows:
        payload = coerce_json_value(input_summary, {})
        if not isinstance(payload, dict):
            continue
        if (
            payload.get("memory_item_id") == memory_item_id
            and payload.get("reason") == reason
        ):
            return True
    return False


def _emit_conflict_events(
    settings: Settings,
    pending_conflict_events: list[tuple[str, str]],
) -> None:
    seen: set[tuple[str, str]] = set()
    for memory_item_id, reason in pending_conflict_events:
        key = (memory_item_id, reason)
        if key in seen:
            continue
        seen.add(key)
        if _conflict_event_already_recorded(
            settings,
            memory_item_id=memory_item_id,
            reason=reason,
        ):
            continue
        record_agent_event(
            settings,
            event_type="memory_conflict_marked",
            status="completed",
            input_summary={
                "memory_item_id": memory_item_id,
                "reason": reason,
            },
        )


def backup_database(settings: Settings) -> dict:
    if not settings.database_path.is_file():
        raise FileNotFoundError(
            f"database file not found: {settings.database_path}"
        )

    backups_dir = settings.data_dir / "backups"
    backups_dir.mkdir(parents=True, exist_ok=True)

    timestamp = _backup_timestamp()
    sqlite_dest = backups_dir / f"trader-agent-memory-{timestamp}.sqlite"
    shutil.copy2(settings.database_path, sqlite_dest)

    jsonl_source = settings.data_dir / "audit" / "agent_events.jsonl"
    jsonl_dest = backups_dir / f"agent-events-{timestamp}.jsonl"
    jsonl_path: str | None = None
    if jsonl_source.is_file():
        shutil.copy2(jsonl_source, jsonl_dest)
        jsonl_path = str(jsonl_dest)

    return {
        "sqlite_path": str(sqlite_dest),
        "jsonl_path": jsonl_path,
        "timestamp": timestamp,
    }


def scan_evidence_health(settings: Settings) -> EvidenceRevalidationReport:
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        report, _ = _scan_memory_evidence(conn, engine, write=False)
    return report


def revalidate_evidence(settings: Settings) -> EvidenceRevalidationReport:
    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        report, pending_conflict_events = _scan_memory_evidence(
            conn, engine, write=True
        )

    _emit_conflict_events(settings, pending_conflict_events)
    return report


def _reindex_and_revalidate(
    settings: Settings,
) -> tuple[MarkdownSectionIndexResult, EvidenceRevalidationReport]:
    sections_result = index_markdown_sections(settings)
    evidence_result = revalidate_evidence(settings)
    return sections_result, evidence_result


def incremental_rebuild(settings: Settings) -> IncrementalRebuildReport:
    start = time.monotonic()
    record_agent_event(
        settings,
        event_type="index_rebuild_started",
        status="started",
    )
    try:
        catalog_result = build_artifact_catalog(settings)
        sections_result, evidence_result = _reindex_and_revalidate(settings)
        duration_ms = int((time.monotonic() - start) * 1000)

        record_agent_event(
            settings,
            event_type="index_rebuild_completed",
            status="completed",
            input_summary={
                "catalog_discovered": catalog_result.discovered,
                "catalog_updated": catalog_result.updated,
                "catalog_excluded": catalog_result.excluded,
                "catalog_failed": catalog_result.failed,
                "sections_indexed_artifacts": sections_result.indexed_artifacts,
                "sections_indexed": sections_result.indexed_sections,
                "sections_skipped": sections_result.skipped,
                "sections_failed": sections_result.failed,
                "evidence_total_items": evidence_result.total_memory_items,
                "evidence_total_refs": evidence_result.total_evidence_refs,
                "evidence_resolved": evidence_result.resolved,
                "evidence_stale": evidence_result.stale,
                "evidence_unresolved": evidence_result.unresolved,
                "evidence_affected_ids": evidence_result.affected_memory_ids,
            },
            duration_ms=duration_ms,
        )

        return IncrementalRebuildReport(
            catalog=catalog_result,
            sections=sections_result,
            evidence=evidence_result,
            duration_ms=duration_ms,
        )
    except Exception as exc:
        duration_ms = int((time.monotonic() - start) * 1000)
        record_agent_event(
            settings,
            event_type="index_rebuild_failed",
            status="failed",
            error=str(exc),
            duration_ms=duration_ms,
        )
        raise


def rebuild_artifacts(settings: Settings, artifact_ids: list[str]) -> IncrementalRebuildReport:
    start = time.monotonic()

    if not artifact_ids:
        return IncrementalRebuildReport(
            catalog=_EMPTY_CATALOG,
            sections=MarkdownSectionIndexResult(
                indexed_artifacts=0, indexed_sections=0, skipped=0, failed=0
            ),
            evidence=revalidate_evidence(settings),
            duration_ms=int((time.monotonic() - start) * 1000),
        )

    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        conn.execute(
            update(source_artifacts)
            .where(source_artifacts.c.id.in_(artifact_ids))
            .values(index_status="stale")
        )

    sections_result = index_markdown_sections(settings, artifact_ids=artifact_ids)
    evidence_result = revalidate_evidence(settings)

    duration_ms = int((time.monotonic() - start) * 1000)
    return IncrementalRebuildReport(
        catalog=_EMPTY_CATALOG,
        sections=sections_result,
        evidence=evidence_result,
        duration_ms=duration_ms,
    )


def get_last_rebuild_status(settings: Settings) -> dict:
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        row = (
            conn.execute(
                select(agent_events)
                .where(agent_events.c.event_type == "index_rebuild_completed")
                .order_by(agent_events.c.timestamp.desc())
                .limit(1)
            )
            .mappings()
            .one_or_none()
        )
    if row is None:
        return {"status": "no_rebuild_yet"}
    return {"status": "ok", "last_rebuild": dict(row)}
