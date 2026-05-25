from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time
from typing import Any


@dataclass(frozen=True)
class NormalizedEvidence:
    evidence_id: str
    source_type: str
    provider: str
    symbol: str
    timestamp: str
    retrieved_at: str
    payload: dict[str, Any]
    confidence: str
    limitations: list[str] = field(default_factory=list)
    freshness: str = "unknown"
    cost_category: str = "unknown"

    def as_dict(self) -> dict[str, Any]:
        return {
            "evidence_id": self.evidence_id,
            "source_type": self.source_type,
            "provider": self.provider,
            "symbol": self.symbol,
            "timestamp": self.timestamp,
            "retrieved_at": self.retrieved_at,
            "payload": self.payload,
            "confidence": self.confidence,
            "limitations": list(self.limitations),
            "freshness": self.freshness,
            "cost_category": self.cost_category,
        }


def make_evidence(
    *,
    source_type: str,
    provider: str,
    symbol: str,
    timestamp: str,
    payload: dict[str, Any],
    confidence: str,
    limitations: list[str],
    freshness: str,
    cost_category: str,
    retrieved_at: datetime | None = None,
    evidence_id: str | None = None,
) -> NormalizedEvidence:
    normalized_timestamp = to_iso_z(timestamp)
    normalized_retrieved_at = iso_now() if retrieved_at is None else to_iso_z(retrieved_at)
    stable_id = evidence_id or _stable_evidence_id(
        {
            "source_type": source_type,
            "provider": provider,
            "symbol": symbol,
            "timestamp": normalized_timestamp,
            "payload": payload,
        }
    )
    return NormalizedEvidence(
        evidence_id=stable_id,
        source_type=source_type,
        provider=provider,
        symbol=symbol,
        timestamp=normalized_timestamp,
        retrieved_at=normalized_retrieved_at,
        payload=payload,
        confidence=confidence,
        limitations=limitations,
        freshness=freshness,
        cost_category=cost_category,
    )


def iso_now() -> str:
    return to_iso_z(datetime.now(UTC))


def to_iso_z(value: str | datetime | date) -> str:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, date):
        parsed = datetime.combine(value, time.min, tzinfo=UTC)
    elif len(value) == 10:
        parsed = datetime.combine(date.fromisoformat(value), time.min, tzinfo=UTC)
    else:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).isoformat().replace("+00:00", "Z")


def within_range(timestamp: str, start: str | None, end: str | None) -> bool:
    parsed = _parse_boundary(timestamp)
    if start is not None and parsed < _parse_boundary(start):
        return False
    if end is not None and parsed > _parse_boundary(end, is_end=True):
        return False
    return True


def coerce_scalar(value: Any) -> Any:
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, str):
        try:
            parsed = float(value)
        except ValueError:
            return value
        if parsed.is_integer():
            return int(parsed)
        return parsed
    return value


def _parse_boundary(value: str, *, is_end: bool = False) -> datetime:
    if len(value) == 10:
        boundary_time = time.max if is_end else time.min
        return datetime.combine(date.fromisoformat(value), boundary_time, tzinfo=UTC)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _stable_evidence_id(value: dict[str, Any]) -> str:
    encoded = json.dumps(value, sort_keys=True, default=str, separators=(",", ":"))
    digest = hashlib.sha256(encoded.encode("utf-8")).hexdigest()[:24]
    return f"evidence:{digest}"
