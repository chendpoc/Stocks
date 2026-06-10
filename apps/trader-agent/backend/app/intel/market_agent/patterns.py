from __future__ import annotations

import hashlib
from dataclasses import replace
from typing import Any

from app.intel.market_agent.repositories import (
    create_pattern_memory,
    list_failure_memories,
    list_pattern_memories,
)
from app.intel.market_agent.schemas import FailureMemory, PatternMemory
from app.modules.json_row_codec import canonical_json_text


PATTERN_STATUS_ALIASES: dict[str, str] = {
    "active": "promoted",
}


def _normalize_status(value: Any) -> str:
    return str(value).strip().lower()


def normalize_pattern_status_filter(status: str | None) -> str | None:
    if status is None:
        return None
    normalized = _normalize_status(status)
    return PATTERN_STATUS_ALIASES.get(normalized, normalized)


def _pattern_status(memory: PatternMemory) -> str:
    raw = memory.memory_json.get("status", "active")
    return _normalize_status(raw)


def _pattern_memory_event_id(memory: PatternMemory) -> str:
    payload = {
        "symbol": memory.symbol.upper(),
        "pattern_id": memory.pattern_id,
        "status": _pattern_status(memory),
        "confidence": memory.confidence,
        "memory_json": memory.memory_json,
        "evidence_refs_json": list(memory.evidence_refs_json),
    }
    digest = hashlib.sha256(canonical_json_text(payload).encode("utf-8")).hexdigest()[:16]
    return f"pm_{digest}"


def _make_pattern_transition(memory: PatternMemory, *, status: str, extra_json: dict[str, Any] | None = None) -> PatternMemory:
    next_json = dict(memory.memory_json or {})
    next_json["status"] = _normalize_status(status)
    if extra_json:
        next_json.update(extra_json)
    next_confidence = next_json.get("confidence", memory.confidence)
    next_confidence_value = float(next_confidence) if next_confidence is not None else None
    next_memory = replace(
        memory,
        memory_json=next_json,
        confidence=next_confidence_value,
        pattern_memory_id="__placeholder__",
    )
    next_memory = replace(next_memory, pattern_memory_id=_pattern_memory_event_id(next_memory))
    return next_memory


class PatternMemoryService:
    def __init__(self, engine) -> None:
        self.engine = engine

    def list(
        self,
        *,
        symbol: str | None = None,
        pattern_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
        latest_per_pattern: bool = True,
    ) -> list[PatternMemory]:
        status_value = normalize_pattern_status_filter(status)
        return list_pattern_memories(
            self.engine,
            symbol=symbol,
            pattern_id=pattern_id,
            status=status_value,
            limit=limit,
            latest_per_pattern=latest_per_pattern,
        )

    def _append_status(self, pattern: PatternMemory, status: str, *, extra_json: dict[str, Any] | None = None) -> PatternMemory:
        next_memory = _make_pattern_transition(pattern, status=status, extra_json=extra_json)
        return create_pattern_memory(self.engine, next_memory)

    def promote(self, pattern: PatternMemory, *, confirm: bool = False) -> PatternMemory:
        if not confirm:
            raise ValueError("promote requires confirm=True")
        return self._append_status(pattern, "promoted")

    def degrade(self, pattern: PatternMemory, *, reason: str | None = None) -> PatternMemory:
        extra_json = {"status_reason": reason} if reason else None
        return self._append_status(pattern, "degrading", extra_json=extra_json)

    def retire(self, pattern: PatternMemory) -> PatternMemory:
        return self._append_status(pattern, "retired")

    def promote_from_candidate(
        self,
        *,
        candidate_id: str,
        symbol: str,
        thesis: str | None,
        confidence: float | None,
        candidate_json: dict[str, Any],
        evidence_refs: list[Any],
        confirm: bool = False,
    ) -> PatternMemory:
        if not confirm:
            raise ValueError("promote requires confirm=True")
        seed = PatternMemory(
            pattern_memory_id="__placeholder__",
            symbol=symbol.upper(),
            pattern_id=str(candidate_id),
            confidence=confidence,
            memory_json={
                "status": "promoted",
                "candidate_id": candidate_id,
                "thesis": thesis,
                "candidate_json": candidate_json,
            },
            evidence_refs_json=list(evidence_refs or []),
            created_at=None,
        )
        next_memory = replace(seed, pattern_memory_id=_pattern_memory_event_id(seed))
        return create_pattern_memory(self.engine, next_memory)


class FailureMemoryService:
    def __init__(self, engine) -> None:
        self.engine = engine

    def list_active_warnings(
        self,
        *,
        symbol: str | None = None,
        failure_type: str | None = None,
        setup_name: str | None = None,
        limit: int = 50,
    ) -> list[FailureMemory]:
        status_values = ("active", "open", "warning", "pending", "new", "open_warning")
        return list_failure_memories(
            self.engine,
            symbol=symbol,
            failure_type=failure_type,
            status_values=status_values,
            setup_name=_normalize_status(setup_name) if setup_name else None,
            limit=limit,
        )
