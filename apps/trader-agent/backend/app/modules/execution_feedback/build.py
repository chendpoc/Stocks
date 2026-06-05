from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any


def _utc_now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def build_execution_feedback(
    *,
    run_id: str,
    policy: dict[str, Any],
    risk_decision: dict[str, Any],
    market_state: dict[str, Any],
    paper_result: dict[str, Any] | None = None,
) -> dict[str, Any]:
    status = "completed" if risk_decision.get("decision") == "allow" and paper_result else "rejected"
    fill = None
    position = None
    if paper_result:
        events = paper_result.get("order_events") or []
        if events:
            fill = events[0]
        position = paper_result.get("position_snapshot")

    return {
        "schema_version": "execution_feedback.v0",
        "execution_feedback_id": f"efb-{uuid.uuid4().hex[:12]}",
        "run_id": run_id,
        "status": status,
        "created_at": _utc_now_iso(),
        "execution_policy_id": policy["execution_policy_id"],
        "risk_decision_id": risk_decision.get("risk_decision_id"),
        "market_state_snapshot_id": market_state.get("market_state_snapshot_id"),
        "consumer_readiness": market_state.get("consumer_readiness"),
        "risk_decision": risk_decision,
        "paper_result_summary": {
            "order_intent_id": (paper_result or {}).get("order_intent", {}).get("order_intent_id"),
            "fill_price": (fill or {}).get("fill_price"),
            "fill_quantity": (fill or {}).get("fill_quantity"),
            "position_quantity": (position or {}).get("quantity"),
            "realized_pnl": (position or {}).get("realized_pnl"),
        },
        "feasibility_verdict": (
            "execution_feasible_under_policy"
            if status == "completed"
            else "blocked_before_execution"
        ),
        "audit_refs": {
            "source_run_id": policy.get("source_run_id"),
            "opportunity_map_id": policy.get("opportunity_map_id"),
            "risk_envelope_id": policy.get("risk_envelope_id"),
            "exploration_plan_id": policy.get("exploration_plan_id"),
            "execution_policy_id": policy.get("execution_policy_id"),
            "risk_decision_id": risk_decision.get("risk_decision_id"),
        },
    }
