from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, ClassVar, Literal, Mapping

from app.modules.json_row_codec import deserialize_json_fields_in_row


def _decode_db_row(row: Mapping[str, Any], json_fields: tuple[str, ...], defaults: dict[str, Any]) -> dict[str, Any]:
    return deserialize_json_fields_in_row(dict(row), json_fields, defaults=defaults)


MarketDataQualityStatus = Literal["pass", "warning", "failed", "blocked"]
DataQualityBand = Literal[
    "quality_pass",
    "quality_degraded",
    "quality_critical",
    "quality_blocked",
]
MarketMonitorDecisionAction = Literal["watch", "review", "ignore", "monitor"]
MarketMonitorRiskStatus = Literal[
    "pass",
    "watch_only",
    "blocked",
    "requires_user_confirmation",
]


@dataclass(frozen=True)
class MarketDataQuality:
    status: MarketDataQualityStatus
    reason: str
    bar_count: int
    min_required: int
    quality_score: int = 0
    gap_count: int = 0
    completeness: float = 0.0
    quality_status: DataQualityBand = "quality_critical"


@dataclass
class MarketDataResponse:
    symbol: str
    timeframe: str
    bars: list[dict[str, Any]]
    quality_status: MarketDataQualityStatus
    quality_reason: str
    source: str
    bar_count: int
    quality_score: int = 0
    gap_count: int = 0
    completeness: float = 0.0


@dataclass
class FeatureSnapshot:
    feature_snapshot_id: str
    symbol: str
    asof_ts: str
    timeframe: str | None = None
    features_json: dict[str, Any] = field(default_factory=dict)
    tags_json: list[Any] = field(default_factory=list)
    created_at: str | None = None

    __json_fields__: ClassVar[tuple[str, ...]] = ("features_json", "tags_json")
    __json_defaults__: ClassVar[dict[str, Any]] = {
        "features_json": {},
        "tags_json": [],
    }

    @classmethod
    def from_db_row(cls, row: Mapping[str, Any]) -> "FeatureSnapshot":
        payload = _decode_db_row(row, cls.__json_fields__, cls.__json_defaults__)
        return cls(**payload)


@dataclass
class MarketMonitorDecisionEnvelope:
    symbol: str
    action: MarketMonitorDecisionAction
    thesis: str
    confidence: float
    uncertainty: float | None = None
    watch_condition: str | None = None
    trigger: str | None = None
    invalidation: str | None = None
    target_plan: str | None = None
    exit_rationale: str | None = None
    hold_condition: str | None = None

    quality: dict[str, Any] | None = None
    setup_event_ids: list[str] | None = None
    risk: dict[str, Any] | None = None
    feature_snapshot_id: str | None = None
    snapshot_id: str | None = None

    def to_decision_json(self) -> dict[str, Any]:
        return {
            "symbol": self.symbol,
            "action": self.action,
            "thesis": self.thesis,
            "confidence": self.confidence,
            "uncertainty": self.uncertainty,
            "watch_condition": self.watch_condition,
            "trigger": self.trigger,
            "invalidation": self.invalidation,
            "target_plan": self.target_plan,
            "exit_rationale": self.exit_rationale,
            "hold_condition": self.hold_condition,
            "quality": self.quality or {},
            "setup_event_ids": self.setup_event_ids or [],
            "risk": self.risk or {},
            "feature_snapshot_id": self.feature_snapshot_id,
            "snapshot_id": self.snapshot_id,
        }


@dataclass
class SetupEvent:
    setup_event_id: str
    symbol: str
    event_type: str
    event_ts: str
    # Legacy persistence payloads
    setup_json: dict[str, Any] = field(default_factory=dict)
    context_json: dict[str, Any] = field(default_factory=dict)
    created_at: str | None = None

    __json_fields__: ClassVar[tuple[str, ...]] = ("setup_json", "context_json")
    __json_defaults__: ClassVar[dict[str, Any]] = {
        "setup_json": {},
        "context_json": {},
    }

    @property
    def setup_name(self) -> str | None:
        return self.setup_json.get("setup_name") if isinstance(self.setup_json, dict) else None

    @property
    def setup_status(self) -> str | None:
        return self.setup_json.get("setup_status") if isinstance(self.setup_json, dict) else None

    @property
    def confidence(self) -> float | None:
        value = self.setup_json.get("confidence") if isinstance(self.setup_json, dict) else None
        return float(value) if value is not None else None

    @property
    def conditions(self) -> dict[str, Any]:
        payload = self.setup_json.get("conditions")
        if isinstance(payload, dict):
            return payload
        return {}

    @property
    def invalidations(self) -> dict[str, Any]:
        payload = self.setup_json.get("invalidations")
        if isinstance(payload, dict):
            return payload
        return {}

    @property
    def evidence_seed(self) -> str | None:
        return self.setup_json.get("evidence_seed") if isinstance(self.setup_json, dict) else None

    @property
    def feature_snapshot_id(self) -> str | None:
        return self.setup_json.get("feature_snapshot_id") if isinstance(self.setup_json, dict) else None

    @property
    def timeframe(self) -> str | None:
        return self.context_json.get("timeframe") if isinstance(self.context_json, dict) else None

    @classmethod
    def from_db_row(cls, row: Mapping[str, Any]) -> "SetupEvent":
        payload = _decode_db_row(row, cls.__json_fields__, cls.__json_defaults__)
        return cls(**payload)


@dataclass
class PatternMemory:
    pattern_memory_id: str
    symbol: str
    pattern_id: str
    confidence: float | None = None
    memory_json: dict[str, Any] = field(default_factory=dict)
    evidence_refs_json: list[Any] = field(default_factory=list)
    created_at: str | None = None

    __json_fields__: ClassVar[tuple[str, ...]] = ("memory_json", "evidence_refs_json")
    __json_defaults__: ClassVar[dict[str, Any]] = {
        "memory_json": {},
        "evidence_refs_json": [],
    }

    @classmethod
    def from_db_row(cls, row: Mapping[str, Any]) -> "PatternMemory":
        payload = _decode_db_row(row, cls.__json_fields__, cls.__json_defaults__)
        return cls(**payload)


@dataclass
class FailureMemory:
    failure_memory_id: str
    symbol: str
    failure_type: str
    failed_ts: str
    failure_json: dict[str, Any] = field(default_factory=dict)
    context_json: dict[str, Any] = field(default_factory=dict)
    created_at: str | None = None

    __json_fields__: ClassVar[tuple[str, ...]] = ("failure_json", "context_json")
    __json_defaults__: ClassVar[dict[str, Any]] = {
        "failure_json": {},
        "context_json": {},
    }

    @classmethod
    def from_db_row(cls, row: Mapping[str, Any]) -> "FailureMemory":
        payload = _decode_db_row(row, cls.__json_fields__, cls.__json_defaults__)
        return cls(**payload)


@dataclass
class SessionContextPack:
    session_context_pack_id: str
    session_id: str
    symbol: str | None = None
    context_pack_json: dict[str, Any] = field(default_factory=dict)
    metadata_json: dict[str, Any] = field(default_factory=dict)
    created_at: str | None = None

    __json_fields__: ClassVar[tuple[str, ...]] = ("context_pack_json", "metadata_json")
    __json_defaults__: ClassVar[dict[str, Any]] = {
        "context_pack_json": {},
        "metadata_json": {},
    }

    @classmethod
    def from_db_row(cls, row: Mapping[str, Any]) -> "SessionContextPack":
        payload = _decode_db_row(row, cls.__json_fields__, cls.__json_defaults__)
        return cls(**payload)


@dataclass
class ModelDecisionRecord:
    decision_id: str
    snapshot_id: str
    symbol: str
    action: str
    decision_json: dict[str, Any]
    run_id: str | None = None
    model_provider: str | None = None
    model_name: str | None = None
    model_version: str | None = None
    confidence: float | None = None
    uncertainty: float | None = None
    status: str = "active"
    human_overrides_json: list[Any] = field(default_factory=list)
    created_at: str | None = None

    __json_fields__: ClassVar[tuple[str, ...]] = ("decision_json", "human_overrides_json")
    __json_defaults__: ClassVar[dict[str, Any]] = {
        "decision_json": {},
        "human_overrides_json": [],
    }

    @classmethod
    def from_db_row(cls, row: Mapping[str, Any]) -> "ModelDecisionRecord":
        payload = _decode_db_row(row, cls.__json_fields__, cls.__json_defaults__)
        return cls(**payload)
