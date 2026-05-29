from __future__ import annotations

from dataclasses import dataclass, replace
from enum import StrEnum
from typing import Any

from sqlalchemy import select
from sqlalchemy.engine import Engine

from app.db.models import document_sections, source_artifacts


class RefType(StrEnum):
    DOCUMENT_SECTION = "document_section"
    IMAGE_ARTIFACT = "image_artifact"
    RAW_CHAT_MESSAGE = "raw_chat_message"
    NEWS_ARCHIVE = "news_archive"
    FILING_ARCHIVE = "filing_archive"


class ResolverStatus(StrEnum):
    RESOLVED = "resolved"
    STALE = "stale"
    UNRESOLVED = "unresolved"


@dataclass
class EvidenceRef:
    ref_type: RefType
    ref_id: str
    artifact_id: str
    artifact_path: str
    artifact_hash: str | None = None
    source_date: str | None = None
    resolver_status: ResolverStatus = ResolverStatus.RESOLVED
    quote: str | None = None
    note: str | None = None

    section_key: str | None = None
    text_digest: str | None = None
    heading_path: str | None = None
    start_line: int | None = None
    end_line: int | None = None

    perceptual_hash: str | None = None
    related_artifact_id: str | None = None
    ocr_text_digest: str | None = None

    message_id: str | None = None
    conversation_id: str | None = None
    message_digest: str | None = None

    archive_id: str | None = None
    source_url: str | None = None
    published_at: str | None = None
    content_digest: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> EvidenceRef:
        ref_type = data.get("ref_type")
        if isinstance(ref_type, str):
            ref_type = RefType(ref_type)
        resolver_status = data.get("resolver_status", ResolverStatus.RESOLVED)
        if isinstance(resolver_status, str):
            resolver_status = ResolverStatus(resolver_status)
        return cls(
            ref_type=ref_type,
            ref_id=str(data["ref_id"]),
            artifact_id=str(data["artifact_id"]),
            artifact_path=str(data["artifact_path"]),
            artifact_hash=data.get("artifact_hash"),
            source_date=data.get("source_date"),
            resolver_status=resolver_status,
            quote=data.get("quote"),
            note=data.get("note"),
            section_key=data.get("section_key"),
            text_digest=data.get("text_digest"),
            heading_path=data.get("heading_path"),
            start_line=data.get("start_line"),
            end_line=data.get("end_line"),
            perceptual_hash=data.get("perceptual_hash"),
            related_artifact_id=data.get("related_artifact_id"),
            ocr_text_digest=data.get("ocr_text_digest"),
            message_id=data.get("message_id"),
            conversation_id=data.get("conversation_id"),
            message_digest=data.get("message_digest"),
            archive_id=data.get("archive_id"),
            source_url=data.get("source_url"),
            published_at=data.get("published_at"),
            content_digest=data.get("content_digest"),
        )

    def as_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "ref_type": self.ref_type.value,
            "ref_id": self.ref_id,
            "artifact_id": self.artifact_id,
            "artifact_path": self.artifact_path,
            "resolver_status": self.resolver_status.value,
        }
        optional_fields = (
            "artifact_hash",
            "source_date",
            "quote",
            "note",
            "section_key",
            "text_digest",
            "heading_path",
            "start_line",
            "end_line",
            "perceptual_hash",
            "related_artifact_id",
            "ocr_text_digest",
            "message_id",
            "conversation_id",
            "message_digest",
            "archive_id",
            "source_url",
            "published_at",
            "content_digest",
        )
        for field_name in optional_fields:
            value = getattr(self, field_name)
            if value is not None:
                payload[field_name] = value
        return payload

    def resolve(self, engine: Engine) -> EvidenceRef:
        with engine.connect() as conn:
            if self.ref_type == RefType.DOCUMENT_SECTION:
                row = (
                    conn.execute(
                        select(document_sections).where(
                            document_sections.c.section_key == self.section_key
                        )
                    )
                    .mappings()
                    .one_or_none()
                )
                if row is None:
                    return replace(self, resolver_status=ResolverStatus.UNRESOLVED)
                if row["text_digest"] == self.text_digest:
                    return replace(self, resolver_status=ResolverStatus.RESOLVED)
                return replace(self, resolver_status=ResolverStatus.STALE)

            if self.ref_type == RefType.IMAGE_ARTIFACT:
                row = (
                    conn.execute(
                        select(source_artifacts).where(source_artifacts.c.id == self.artifact_id)
                    )
                    .mappings()
                    .one_or_none()
                )
                if row is None:
                    return replace(self, resolver_status=ResolverStatus.UNRESOLVED)
                if self.artifact_hash and row["content_hash"] != self.artifact_hash:
                    return replace(self, resolver_status=ResolverStatus.STALE)
                return replace(self, resolver_status=ResolverStatus.RESOLVED)

            if self.ref_type in {
                RefType.RAW_CHAT_MESSAGE,
                RefType.NEWS_ARCHIVE,
                RefType.FILING_ARCHIVE,
            }:
                row = (
                    conn.execute(
                        select(source_artifacts).where(source_artifacts.c.id == self.artifact_id)
                    )
                    .mappings()
                    .one_or_none()
                )
                if row is None:
                    return replace(self, resolver_status=ResolverStatus.UNRESOLVED)
                return replace(self, resolver_status=ResolverStatus.RESOLVED)

        return replace(self, resolver_status=ResolverStatus.UNRESOLVED)
