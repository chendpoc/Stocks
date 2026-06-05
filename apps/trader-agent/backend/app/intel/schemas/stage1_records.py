from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.intel.schemas.sqlite_json_row import SqliteJsonRowModel

# --- context snapshots ---


class ContextSnapshotOut(SqliteJsonRowModel):
    __sqlite_json_fields__ = ("items_json", "evidence_refs_json")
    __sqlite_json_defaults__ = {"items_json": [], "evidence_refs_json": []}

    snapshot_id: str
    symbol: str
    asof_ts: str
    context_version: str | None = None
    items_json: list[Any]
    evidence_refs_json: list[Any] = Field(default_factory=list)
    weighting_policy_version: str | None = None
    context_hash: str
    created_at: str | None = None


class ContextSnapshotListOut(BaseModel):
    items: list[ContextSnapshotOut]
    count: int


# --- model decisions ---


class ModelDecisionOut(SqliteJsonRowModel):
    __sqlite_json_fields__ = ("decision_json", "human_overrides_json")
    __sqlite_json_defaults__ = {"decision_json": {}, "human_overrides_json": []}

    decision_id: str
    run_id: str | None = None
    snapshot_id: str
    symbol: str
    model_provider: str | None = None
    model_name: str | None = None
    model_version: str | None = None
    action: str
    confidence: float | None = None
    uncertainty: float | None = None
    decision_json: dict[str, Any]
    human_overrides_json: list[Any] = Field(default_factory=list)
    status: str | None = "active"
    created_at: str | None = None


class ModelDecisionListOut(BaseModel):
    items: list[ModelDecisionOut]
    count: int


# --- decision outcomes ---


class DecisionOutcomeOut(SqliteJsonRowModel):
    __sqlite_json_fields__ = ("outcome_json",)
    __sqlite_json_defaults__ = {"outcome_json": {}}

    outcome_id: str
    decision_id: str
    symbol: str
    horizon: str
    path: str = "model_path"
    status: str = "pending"
    due_at: str | None = None
    scheduled_at: str | None = None
    reference_price: float | None = None
    future_price: float | None = None
    absolute_return_pct: float | None = None
    benchmark_symbol: str | None = None
    benchmark_return_pct: float | None = None
    relative_return_pct: float | None = None
    hit_invalidation_proxy: int | None = None
    hit_target_proxy: int | None = None
    label: str | None = None
    outcome_json: dict[str, Any] | None = None
    created_at: str | None = None
    updated_at: str | None = None
    labeled_at: str | None = None


class DecisionOutcomeListOut(BaseModel):
    items: list[DecisionOutcomeOut]
    count: int


# --- insight candidates ---


class InsightCandidateOut(SqliteJsonRowModel):
    __sqlite_json_fields__ = ("symbols_json", "evidence_refs_json", "candidate_json")
    __sqlite_json_defaults__ = {
        "symbols_json": [],
        "evidence_refs_json": [],
        "candidate_json": {},
    }

    insight_id: str
    run_id: str | None = None
    symbols_json: list[Any]
    window_start: str | None = None
    window_end: str | None = None
    thesis: str | None = None
    evidence_refs_json: list[Any] = Field(default_factory=list)
    verification_status: str = "pending"
    weight_cap: float | None = None
    candidate_json: dict[str, Any]
    created_at: str | None = None


class InsightCandidateListOut(BaseModel):
    items: list[InsightCandidateOut]
    count: int


# --- insight candidate outcomes ---


class InsightCandidateOutcomeOut(SqliteJsonRowModel):
    __sqlite_json_fields__ = ("metrics_json", "reason_codes_json", "evidence_refs_json", "outcome_json")
    __sqlite_json_defaults__ = {
        "metrics_json": {},
        "reason_codes_json": [],
        "evidence_refs_json": [],
        "outcome_json": {},
    }

    outcome_id: str
    insight_id: str
    symbol: str
    horizon: str
    status: str = "pending"
    due_at: str | None = None
    scheduled_at: str | None = None
    normalized_label: str | None = None
    metrics_json: dict[str, Any] | None = None
    reason_codes_json: list[Any] | None = None
    evidence_refs_json: list[Any] | None = None
    outcome_json: dict[str, Any] | None = None
    created_at: str | None = None
    labeled_at: str | None = None


class InsightCandidateOutcomeListOut(BaseModel):
    items: list[InsightCandidateOutcomeOut]
    count: int


# --- evaluation reports ---


class EvaluationReportOut(SqliteJsonRowModel):
    __sqlite_json_fields__ = ("metrics_json", "report_json")
    __sqlite_json_defaults__ = {"metrics_json": {}, "report_json": {}}

    report_id: str
    model_version: str
    window_start: str | None = None
    window_end: str | None = None
    metrics_json: dict[str, Any] | None = None
    recommendation: str
    report_json: dict[str, Any]
    created_at: str | None = None


class EvaluationReportListOut(BaseModel):
    items: list[EvaluationReportOut]
    count: int


# --- weighting policy stats ---


class WeightingPolicyStatsOut(SqliteJsonRowModel):
    __sqlite_json_fields__ = ("stats_json",)
    __sqlite_json_defaults__ = {"stats_json": {}}

    policy_version: str
    source_key: str
    stats_json: dict[str, Any]
    updated_at: str | None = None


class WeightingPolicyStatsListOut(BaseModel):
    items: list[WeightingPolicyStatsOut]
    count: int