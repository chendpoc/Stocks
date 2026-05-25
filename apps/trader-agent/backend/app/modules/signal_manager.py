from __future__ import annotations

from dataclasses import asdict
from typing import Any
from uuid import uuid4

from app.core.config import Settings
from app.core.time import utc_now_iso
from app.db.models import agent_events, signals
from app.db.session import create_sqlite_engine
from app.modules import _json
from app.modules.market_snapshot import MarketSnapshot
from app.modules.risk_engine import LEGAL_SIGNAL_STATES, RiskAssessment
from app.modules.rule_engine import RuleEvaluation
from app.modules.scoring import ScoreResult
from app.modules.setup_detection import SetupCandidate

AGENT_VERSION = "phase-1c-2"
SIGNAL_PERSISTED = "signal_manager.signal_persisted"


def persist_signal(
    *,
    settings: Settings,
    candidate: SetupCandidate,
    rule_result: RuleEvaluation,
    score_result: ScoreResult,
    risk_result: RiskAssessment,
    snapshot: MarketSnapshot | None = None,
    run_id: str | None = None,
) -> dict[str, Any] | None:
    if not risk_result.accepted:
        return None

    status = (
        risk_result.final_status
        if risk_result.final_status in LEGAL_SIGNAL_STATES
        else "invalidated"
    )
    signal_id = str(uuid4())
    timestamp = utc_now_iso()
    payload = {
        "id": signal_id,
        "created_at": timestamp,
        "updated_at": timestamp,
        "symbol": candidate.symbol,
        "timeframe": _timeframe(snapshot),
        "setup_type": candidate.setup_type,
        "score": risk_result.final_score,
        "status": status,
        "market_gate": rule_result.market_gate,
        "trader_playbook_match": _trader_playbook_match(score_result),
        "entry_trigger": candidate.trigger_condition,
        "invalidation": candidate.invalidation,
        "preferred_instrument": rule_result.preferred_instrument,
        "evidence": _json.dumps(_evidence(candidate, rule_result, snapshot)),
        "risk_flags": _json.dumps(risk_result.risk_flags),
        "tool_outputs": _json.dumps(_tool_outputs(score_result, risk_result)),
        "rule_version": rule_result.rule_version,
        "agent_version": AGENT_VERSION,
    }

    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        conn.execute(signals.insert().values(**payload))
        conn.execute(
            agent_events.insert().values(
                **_event_payload(
                    signal_id=signal_id,
                    timestamp=timestamp,
                    status=status,
                    candidate=candidate,
                    rule_result=rule_result,
                    serialized_signal=_serialize_signal(payload),
                    run_id=run_id,
                )
            )
        )

    serialized = _serialize_signal(payload)
    return serialized


def _timeframe(snapshot: MarketSnapshot | None) -> str:
    if snapshot is None:
        return "intraday"
    return f"{snapshot.start}..{snapshot.end}"


def _evidence(
    candidate: SetupCandidate,
    rule_result: RuleEvaluation,
    snapshot: MarketSnapshot | None,
) -> dict[str, Any]:
    return {
        "candidate": asdict(candidate),
        "rule": {
            "passed": rule_result.passed,
            "reason": rule_result.reason,
            "rule_name": rule_result.rule_name,
            "rule_version": rule_result.rule_version,
            "market_gate": rule_result.market_gate,
            "preferred_instrument": rule_result.preferred_instrument,
            "evidence": rule_result.evidence,
        },
        "snapshot": None
        if snapshot is None
        else {
            "symbol": snapshot.symbol,
            "start": snapshot.start,
            "end": snapshot.end,
            "evidence_refs": list(snapshot.evidence_refs),
        },
    }


def _tool_outputs(
    score_result: ScoreResult,
    risk_result: RiskAssessment,
) -> dict[str, Any]:
    return {
        "score_components": score_result.components,
        "score_before_risk": score_result.total_score,
        "score_after_risk": risk_result.final_score,
        "risk_multiplier": risk_result.risk_multiplier,
    }


def _trader_playbook_match(score_result: ScoreResult) -> float:
    component = score_result.components.get("trader_playbook_match", {})
    return float(component.get("score", 0))


def _serialize_signal(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        **payload,
        "evidence": _json.loads(payload["evidence"], {}),
        "risk_flags": _json.loads(payload["risk_flags"], []),
        "tool_outputs": _json.loads(payload["tool_outputs"], {}),
    }


def _event_payload(
    *,
    signal_id: str,
    timestamp: str,
    status: str,
    candidate: SetupCandidate,
    rule_result: RuleEvaluation,
    serialized_signal: dict[str, Any],
    run_id: str | None,
) -> dict[str, Any]:
    return {
        "id": str(uuid4()),
        "timestamp": timestamp,
        "run_id": run_id,
        "task_id": None,
        "signal_id": signal_id,
        "symbol": candidate.symbol,
        "event_type": SIGNAL_PERSISTED,
        "status": status,
        "title": "Signal persisted",
        "summary": None,
        "input_summary": _json.dumps(
            {
                "module": "signal_manager",
                "symbol": candidate.symbol,
                "setup_type": candidate.setup_type,
                "rule_name": rule_result.rule_name,
            }
        ),
        "output_summary": _json.dumps(serialized_signal),
        "tool_name": None,
        "duration_ms": None,
        "error": None,
    }
