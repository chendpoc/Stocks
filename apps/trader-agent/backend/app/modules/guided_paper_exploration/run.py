from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

from app.core.config import Settings
from app.intel.db.schema import init_intel_db
from app.modules.execution_feedback.build import build_execution_feedback
from app.modules.execution_policy.store import get_execution_policy
from app.modules.execution_policy.validate import validate_execution_policy
from app.modules.live_market_plane.service import get_latest_market_state
from app.modules.paper_trading.engine import PaperTradingError, submit_paper_order_intent
from app.modules.risk_gate.gate import evaluate_risk_gate
from app.tools.local_adapter import normalize_symbol
from sqlalchemy import text


class GuidedPaperExplorationError(ValueError):
    pass


def _utc_now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _save_run(engine, run_id: str, policy_id: str, symbol: str, payload: dict[str, Any]) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO guided_paper_runs (run_id, execution_policy_id, symbol, payload_json, created_at)
                VALUES (:id, :policy, :symbol, :payload, :created)
                """
            ),
            {
                "id": run_id,
                "policy": policy_id,
                "symbol": symbol,
                "payload": json.dumps(payload, ensure_ascii=False),
                "created": _utc_now_iso(),
            },
        )


def run_guided_paper_exploration(
    settings: Settings,
    *,
    execution_policy_id: str,
    symbol: str,
    direction: str = "buy",
    quantity: float = 1.0,
    approval_granted: bool = False,
) -> dict[str, Any]:
    """M4 path: ExecutionPolicy → RiskGate → PaperTradingEngine → ExecutionFeedback."""
    normalized = normalize_symbol(symbol)
    engine = init_intel_db(settings)
    policy = get_execution_policy(engine, execution_policy_id)
    if policy is None:
        raise GuidedPaperExplorationError(f"unknown execution_policy_id: {execution_policy_id}")

    validate_execution_policy(policy)
    market_state = get_latest_market_state(settings, normalized)
    if market_state is None:
        raise GuidedPaperExplorationError(
            f"No MarketStateSnapshot for {normalized}; start M2 ingest/stream first"
        )

    risk = evaluate_risk_gate(
        policy=policy,
        market_state=market_state,
        symbol=normalized,
        direction=direction,
        quantity=quantity,
        approval_granted=approval_granted,
    )

    run_id = f"gpr-{uuid.uuid4().hex[:12]}"
    paper_result: dict[str, Any] | None = None
    if risk["decision"] == "allow":
        try:
            paper_result = submit_paper_order_intent(
                settings,
                {
                    "symbol": normalized,
                    "direction": direction,
                    "quantity": quantity,
                    "market_state_snapshot_id": market_state["market_state_snapshot_id"],
                    "execution_policy_id": execution_policy_id,
                    "risk_decision_id": risk["risk_decision_id"],
                },
            )
        except PaperTradingError as exc:
            risk = {
                **risk,
                "decision": "reject",
                "reason": f"paper engine rejected: {exc}",
            }

    feedback = build_execution_feedback(
        run_id=run_id,
        policy=policy,
        risk_decision=risk,
        market_state=market_state,
        paper_result=paper_result if risk["decision"] == "allow" else None,
    )
    result = {
        "run_id": run_id,
        "symbol": normalized,
        "execution_policy_id": execution_policy_id,
        "risk_decision": risk,
        "paper_result": paper_result,
        "execution_feedback": feedback,
    }
    _save_run(engine, run_id, execution_policy_id, normalized, result)
    return result
