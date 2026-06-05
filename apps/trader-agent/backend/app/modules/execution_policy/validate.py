from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

CONTRACT_VERSION = "analysis_to_execution_contract.v0"
FORBIDDEN_MODES = frozenset(
    {"live_trading", "broker_submit", "broker_cancel", "broker_replace"}
)
ALLOWED_MODES = frozenset({"observe_only", "paper_simulation", "shadow_tracking"})


class ExecutionPolicyValidationError(ValueError):
    def __init__(self, errors: list[str]) -> None:
        super().__init__("; ".join(errors))
        self.errors = errors


def _parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def validate_execution_policy(policy: dict[str, Any]) -> None:
    errors: list[str] = []
    if policy.get("schema_version") != CONTRACT_VERSION:
        errors.append("schema_version must be analysis_to_execution_contract.v0")
    for field in (
        "execution_policy_id",
        "opportunity_map_id",
        "risk_envelope_id",
        "exploration_plan_id",
        "created_at",
        "valid_from",
        "expires_at",
    ):
        if not policy.get(field):
            errors.append(f"missing required field: {field}")
    modes = policy.get("allowed_modes") or []
    if not modes:
        errors.append("allowed_modes must be non-empty")
    for mode in modes:
        if mode in FORBIDDEN_MODES:
            errors.append(f"forbidden allowed_mode: {mode}")
        if mode not in ALLOWED_MODES:
            errors.append(f"unknown allowed_mode: {mode}")
    if errors:
        raise ExecutionPolicyValidationError(errors)


def policy_is_active(policy: dict[str, Any], *, now: datetime | None = None) -> bool:
    moment = now or datetime.now(UTC)
    expires = _parse_ts(str(policy["expires_at"]))
    valid_from = _parse_ts(str(policy["valid_from"]))
    return valid_from <= moment <= expires
