from __future__ import annotations

from typing import Any, Literal, TypedDict


class DataQualityFlag(TypedDict):
    flag_code: str
    severity: Literal["info", "warning", "error"]
    message: str


class ConsumerReadiness(TypedDict):
    analysis_monitoring: Literal["ready", "warning", "blocked"]
    paper_simulation: Literal["ready", "blocked"]
    source_mode: Literal["live", "replay", "degraded"]


class ProviderTrace(TypedDict, total=False):
    provider_trace_id: str
    provider: str
    source_channel: str
    source_endpoint: str
    provider_symbol: str
    normalized_symbol: str
    market: str
    received_at: str
    normalization_version: str
    entitlement_state: str


ArtifactDict = dict[str, Any]
