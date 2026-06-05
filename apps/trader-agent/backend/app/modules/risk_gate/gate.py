from __future__ import annotations

import uuid
from typing import Any

from app.modules.execution_policy.validate import policy_is_active


class RiskGateError(ValueError):
    pass


def evaluate_risk_gate(
    *,
    policy: dict[str, Any],
    market_state: dict[str, Any],
    symbol: str,
    direction: str,
    quantity: float,
    approval_granted: bool = False,
) -> dict[str, Any]:
    """Deterministic allow/reject before PaperTradingEngine."""
    decision_id = f"rd-{uuid.uuid4().hex[:12]}"
    reasons: list[str] = []

    if "paper_simulation" not in (policy.get("allowed_modes") or []):
        reasons.append("policy does not allow paper_simulation")

    if not policy_is_active(policy):
        reasons.append("execution policy expired or not yet valid")

    allowed_symbols = policy.get("symbols") or []
    if allowed_symbols and symbol not in allowed_symbols:
        reasons.append(f"symbol {symbol} outside policy symbols")

    readiness = market_state.get("consumer_readiness") or {}
    if readiness.get("paper_simulation") != "ready":
        reasons.append("market_state paper_simulation not ready")

    operator_gate = policy.get("operator_gate") or {}
    if operator_gate.get("approval_required") and not approval_granted:
        reasons.append("operator approval required")

    max_qty = policy.get("max_quantity")
    if max_qty is not None and quantity > float(max_qty):
        reasons.append(f"quantity {quantity} exceeds max_quantity {max_qty}")

    if direction not in {"buy", "sell"}:
        reasons.append("direction must be buy or sell")

    decision = "allow" if not reasons else "reject"
    return {
        "risk_decision_id": decision_id,
        "decision": decision,
        "reason": "; ".join(reasons) if reasons else "within policy and market readiness",
        "execution_policy_id": policy["execution_policy_id"],
        "market_state_snapshot_id": market_state.get("market_state_snapshot_id"),
        "symbol": symbol,
        "direction": direction,
        "quantity": quantity,
    }
