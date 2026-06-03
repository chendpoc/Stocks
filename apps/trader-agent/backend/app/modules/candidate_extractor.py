from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from sqlalchemy import select

from app.core.config import Settings
from app.db.models import document_sections, source_artifacts
from app.db.session import create_sqlite_engine
from app.modules.json_row_codec import coerce_json_value
from app.modules.evidence_ref import EvidenceRef, RefType

EXTRACTION_RULES: list[tuple[str, str, float]] = [
    ("核心理论", "market_mechanism", 0.6),
    ("证据链", "source_pattern_summary", 0.6),
    ("交易框架拆解", "trading_rule", 0.55),
    ("入场条件", "trading_rule", 0.65),
    ("风控规则", "trading_rule", 0.65),
    ("失效条件", "trading_rule", 0.6),
    ("市场状态判断", "market_mechanism", 0.55),
    ("核心结论", "source_pattern_summary", 0.6),
    ("仓位/操作策略", "trading_rule", 0.55),
    ("退出条件", "trading_rule", 0.6),
    ("观察信号", "trading_rule", 0.5),
]

_SORTED_EXTRACTION_RULES = sorted(EXTRACTION_RULES, key=lambda item: len(item[0]), reverse=True)


def _match_extraction_rule(heading_path: str) -> tuple[str, float] | None:
    for keyword, candidate_type, confidence in _SORTED_EXTRACTION_RULES:
        if keyword in heading_path:
            return candidate_type, confidence
    return None


def _section_rows(
    settings: Settings,
    *,
    section_ids: list[str] | None = None,
    source_date_from: str | None = None,
    source_date_to: str | None = None,
) -> list[dict[str, Any]]:
    engine = create_sqlite_engine(settings)
    stmt = (
        select(
            document_sections,
            source_artifacts.c.path.label("artifact_path"),
            source_artifacts.c.content_hash.label("artifact_hash"),
            source_artifacts.c.source_date.label("artifact_source_date"),
        )
        .select_from(
            document_sections.join(
                source_artifacts,
                document_sections.c.artifact_id == source_artifacts.c.id,
            )
        )
        .where(source_artifacts.c.memory_eligible == 1)
    )
    if section_ids:
        stmt = stmt.where(document_sections.c.id.in_(section_ids))
    if source_date_from:
        stmt = stmt.where(document_sections.c.source_date >= source_date_from)
    if source_date_to:
        stmt = stmt.where(document_sections.c.source_date <= source_date_to)

    with engine.connect() as conn:
        rows = conn.execute(stmt).mappings().all()

    return [dict(row) for row in rows]


def _build_document_section_ref(row: dict[str, Any]) -> EvidenceRef:
    return EvidenceRef(
        ref_type=RefType.DOCUMENT_SECTION,
        ref_id=row["id"],
        artifact_id=row["artifact_id"],
        artifact_path=row["artifact_path"],
        artifact_hash=row.get("artifact_hash"),
        source_date=row.get("source_date") or row.get("artifact_source_date"),
        section_key=row["section_key"],
        text_digest=row["text_digest"],
        heading_path=row["heading_path"],
        start_line=row.get("start_line"),
        end_line=row.get("end_line"),
    )


def _candidate_from_section(
    row: dict[str, Any],
    candidate_type: str,
    confidence: float,
) -> dict[str, Any]:
    section_text = row["text"]
    evidence_ref = _build_document_section_ref(row)
    return {
        "candidate_type": candidate_type,
        "title": row["heading_path"],
        "summary": section_text[:500],
        "normalized_rule": section_text,
        "symbols_json": coerce_json_value(row.get("symbols_json"), []),
        "tags_json": coerce_json_value(row.get("tags_json"), []),
        "confidence": confidence,
        "candidate_status": "candidate",
        "created_by": "rule_based",
        "evidence_refs_json": [evidence_ref.as_dict()],
    }


def extract_candidates_from_sections(
    settings: Settings,
    *,
    section_ids: list[str] | None = None,
    source_date_from: str | None = None,
    source_date_to: str | None = None,
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for row in _section_rows(
        settings,
        section_ids=section_ids,
        source_date_from=source_date_from,
        source_date_to=source_date_to,
    ):
        matched = _match_extraction_rule(row["heading_path"])
        if matched is None:
            continue
        candidate_type, confidence = matched
        candidates.append(_candidate_from_section(row, candidate_type, confidence))
    return candidates


def fetch_sections_for_llm(
    settings: Settings,
    *,
    section_ids: list[str] | None = None,
    source_date_from: str | None = None,
    source_date_to: str | None = None,
) -> tuple[list[str], list[dict[str, Any]]]:
    rows = _section_rows(
        settings,
        section_ids=section_ids,
        source_date_from=source_date_from,
        source_date_to=source_date_to,
    )
    section_texts = [row["text"] for row in rows]
    section_metadata = [
        {
            "section_id": row["id"],
            "heading_path": row["heading_path"],
            "artifact_id": row["artifact_id"],
            "artifact_path": row["artifact_path"],
            "artifact_hash": row.get("artifact_hash"),
            "source_date": row.get("source_date") or row.get("artifact_source_date"),
            "section_key": row["section_key"],
            "text_digest": row["text_digest"],
            "symbols_json": coerce_json_value(row.get("symbols_json"), []),
        }
        for row in rows
    ]
    return section_texts, section_metadata


def _call_deepseek_json(settings: Settings, prompt: str) -> Any:
    if not settings.deepseek_api_key:
        return None
    payload = {
        "model": settings.deepseek_model,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "Return only JSON with a top-level 'candidates' array. "
                    "Do not include trading execution instructions."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0,
    }
    headers = {
        "Authorization": f"Bearer {settings.deepseek_api_key}",
        "Content-Type": "application/json",
    }
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        settings.deepseek_base_url,
        data=data,
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(
            request,
            timeout=settings.model_call_timeout_seconds,
        ) as response:
            body = json.loads(response.read().decode("utf-8"))
    except (
        urllib.error.URLError,
        TimeoutError,
        json.JSONDecodeError,
        KeyError,
        IndexError,
        TypeError,
    ):
        return None

    try:
        content = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return None

    if isinstance(content, str):
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            return None
    if isinstance(content, dict):
        return content
    return None


def _llm_prompt(section_texts: list[str], section_metadata: list[dict[str, Any]]) -> str:
    sections_payload = [
        {"metadata": metadata, "text": text}
        for metadata, text in zip(section_metadata, section_texts, strict=True)
    ]
    return (
        "Extract memory candidate drafts from the following document sections.\n"
        "Return JSON: {\"candidates\": [{"
        "\"candidate_type\": str, "
        "\"title\": str, "
        "\"summary\": str, "
        "\"normalized_rule\": str, "
        "\"symbols_json\": [str], "
        "\"confidence\": float, "
        "\"evidence_refs_json\": [{"
        "\"ref_type\": \"document_section\", "
        "\"ref_id\": str, "
        "\"artifact_id\": str, "
        "\"artifact_path\": str, "
        "\"section_key\": str, "
        "\"text_digest\": str, "
        "\"heading_path\": str"
        "}]"
        "}]}\n"
        f"Sections:\n{json.dumps(sections_payload, ensure_ascii=False)}"
    )


def draft_candidates_with_llm(
    settings: Settings,
    *,
    section_texts: list[str],
    section_metadata: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not section_texts or not section_metadata:
        return []

    parsed = _call_deepseek_json(settings, _llm_prompt(section_texts, section_metadata))
    if not isinstance(parsed, dict):
        return []

    raw_candidates = parsed.get("candidates")
    if not isinstance(raw_candidates, list):
        return []

    candidates: list[dict[str, Any]] = []
    for item in raw_candidates:
        if not isinstance(item, dict):
            continue
        evidence_refs = item.get("evidence_refs_json", [])
        if not isinstance(evidence_refs, list):
            evidence_refs = []
        candidates.append(
            {
                "candidate_type": item.get("candidate_type", "trading_rule"),
                "title": item.get("title") or "Untitled candidate",
                "summary": item.get("summary"),
                "normalized_rule": item.get("normalized_rule"),
                "symbols_json": item.get("symbols_json") or [],
                "tags_json": item.get("tags_json") or [],
                "confidence": item.get("confidence", 0.5),
                "candidate_status": "candidate",
                "created_by": "agent",
                "evidence_refs_json": evidence_refs,
            }
        )
    return candidates
