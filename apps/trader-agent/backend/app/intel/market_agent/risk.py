from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.intel.market_agent.schemas import MarketMonitorRiskStatus, SetupEvent


@dataclass(frozen=True)
class MarketMonitorRiskDecision:
    status: MarketMonitorRiskStatus
    reason: str
    risk_score: float
    details: dict[str, Any]


def evaluate_monitor_risk(
    *,
    quality_status: str,
    quality_reason: str,
    setup_events: list[SetupEvent] | None = None,
    feature_snapshot_id: str | None = None,
    monitor_mode: bool = True,
) -> MarketMonitorRiskDecision:
    """Deterministic RiskGate for monitor-only workflow.

    Inputs are pure values; outputs are deterministic for the same inputs.
    """
    normalized_quality = str(quality_status).lower().strip()
    events = list(setup_events or [])

    quality_payload = {
        "quality_status": normalized_quality,
        "quality_reason": quality_reason,
        "feature_snapshot_id": feature_snapshot_id,
        "monitor_mode": monitor_mode,
    }

    if not monitor_mode:
        return MarketMonitorRiskDecision(
            status="blocked",
            reason="monitor mode is disabled",
            risk_score=0.0,
            details={**quality_payload, "decision": "monitor mode disabled"},
        )

    if normalized_quality in {"failed", "blocked"}:
        return MarketMonitorRiskDecision(
            status="blocked",
            reason=f"data quality blocked: {quality_reason}",
            risk_score=0.0,
            details={**quality_payload, "setup_statuses": []},
        )

    setup_statuses = [str(event.setup_status) for event in events]
    setup_confidences = [
        float(event.confidence)
        for event in events
        if event.confidence is not None and event.setup_status != "not_present"
    ]
    max_confidence = max(setup_confidences) if setup_confidences else 0.0
    confirmed_count = sum(1 for status in setup_statuses if status == "confirmed")
    forming_count = sum(1 for status in setup_statuses if status == "forming")
    invalidated_count = sum(1 for status in setup_statuses if status == "invalidated")
    blocked_count = sum(1 for status in setup_statuses if status == "blocked")

    if invalidated_count > 0:
        return MarketMonitorRiskDecision(
            status="requires_user_confirmation",
            reason="detected invalidated setup(s)",
            risk_score=0.35,
            details={
                **quality_payload,
                "setup_statuses": setup_statuses,
                "max_setup_confidence": max_confidence,
                "confirmed_count": confirmed_count,
                "forming_count": forming_count,
                "invalidated_count": invalidated_count,
                "blocked_count": blocked_count,
                "setup_event_count": len(events),
            },
        )

    if blocked_count > 0:
        return MarketMonitorRiskDecision(
            status="blocked",
            reason="one or more setup events is blocked",
            risk_score=0.0,
            details={
                **quality_payload,
                "setup_statuses": setup_statuses,
                "max_setup_confidence": max_confidence,
                "confirmed_count": confirmed_count,
                "forming_count": forming_count,
                "invalidated_count": invalidated_count,
                "blocked_count": blocked_count,
                "setup_event_count": len(events),
            },
        )

    if confirmed_count >= 1 and max_confidence >= 0.7 and normalized_quality == "pass":
        return MarketMonitorRiskDecision(
            status="pass",
            reason="monitor criteria met with confident confirmed setup(s)",
            risk_score=round(0.8 + min(0.15, max_confidence * 0.2), 4),
            details={
                **quality_payload,
                "setup_statuses": setup_statuses,
                "max_setup_confidence": max_confidence,
                "confirmed_count": confirmed_count,
                "forming_count": forming_count,
            },
        )

    if confirmed_count >= 1 and normalized_quality in {"pass", "warning"}:
        return MarketMonitorRiskDecision(
            status="requires_user_confirmation",
            reason="confirmed setup present but confidence is below monitor threshold",
            risk_score=round(max(0.45, 0.6 - (0.7 - max_confidence)), 4),
            details={
                **quality_payload,
                "setup_statuses": setup_statuses,
                "max_setup_confidence": max_confidence,
                "confirmed_count": confirmed_count,
                "forming_count": forming_count,
            },
        )

    return MarketMonitorRiskDecision(
        status="watch_only",
        reason="no confirmed setup yet; continue monitoring",
        risk_score=0.4 if normalized_quality == "pass" else 0.3,
        details={
            **quality_payload,
            "setup_statuses": setup_statuses,
            "max_setup_confidence": max_confidence,
            "confirmed_count": confirmed_count,
            "forming_count": forming_count,
            "setup_event_count": len(events),
        },
    )
