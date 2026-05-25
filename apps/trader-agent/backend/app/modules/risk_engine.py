from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.modules.rule_engine import RuleEvaluation
from app.modules.scoring import ScoreResult
from app.modules.setup_detection import SetupCandidate
from app.rulepack.loader import RulePack

LEGAL_SIGNAL_STATES = {"observe", "waiting_trigger", "invalidated"}


@dataclass(frozen=True)
class RiskAssessment:
    accepted: bool
    final_status: str
    final_score: float
    risk_flags: list[dict[str, Any]]
    veto_reason: str | None
    risk_multiplier: float


def assess_signal_risk(
    *,
    candidate: SetupCandidate,
    rule_result: RuleEvaluation,
    score_result: ScoreResult,
    rulepack: RulePack,
) -> RiskAssessment:
    risk_config = rulepack.raw.get("risk", {})
    risk_flags: list[dict[str, Any]] = [
        {
            "type": "broker_action_disabled",
            "severity": "info",
            "reason": "Phase 1C records observation states only.",
        },
        {
            "type": "phase_state_limited",
            "severity": "info",
            "allowed_states": sorted(LEGAL_SIGNAL_STATES),
        },
    ]

    if risk_config.get("block_0dte_by_default") is True:
        risk_flags.append(
            {
                "type": "zero_dte_disabled",
                "severity": "info",
                "reason": "0DTE instruments are disabled by default.",
            }
        )

    unmet_conditions = [
        item
        for item in rule_result.condition_results
        if item.get("status") != "confirmed"
    ]
    failed_conditions = [
        item for item in unmet_conditions if item.get("status") == "failed"
    ]
    pending_conditions = [
        item for item in unmet_conditions if item.get("status") != "failed"
    ]
    if failed_conditions:
        reason = "One or more RulePack required conditions failed deterministic evaluation."
        return RiskAssessment(
            accepted=False,
            final_status="invalidated",
            final_score=0,
            risk_flags=[
                *risk_flags,
                {
                    "type": "failed_required_conditions",
                    "severity": "block",
                    "conditions": [item.get("condition") for item in failed_conditions],
                    "reason": reason,
                },
            ],
            veto_reason=reason,
            risk_multiplier=1.0,
        )
    if pending_conditions:
        risk_flags.append(
            {
                "type": "pending_required_conditions",
                "severity": "downgrade",
                "conditions": [item.get("condition") for item in pending_conditions],
                "reason": "RulePack required conditions are not fully confirmed in Phase 1C.",
            }
        )

    if not rule_result.passed:
        return RiskAssessment(
            accepted=False,
            final_status="invalidated",
            final_score=0,
            risk_flags=[
                *risk_flags,
                {
                    "type": "rule_veto",
                    "severity": "block",
                    "reason": rule_result.reason,
                },
            ],
            veto_reason=rule_result.reason,
            risk_multiplier=1.0,
        )

    status = candidate.status if candidate.status in LEGAL_SIGNAL_STATES else "invalidated"
    if candidate.status not in LEGAL_SIGNAL_STATES:
        reason = f"{candidate.status} is not a legal Phase 1C signal state."
        return RiskAssessment(
            accepted=False,
            final_status=status,
            final_score=0,
            risk_flags=[
                *risk_flags,
                {"type": "illegal_signal_state", "severity": "block", "reason": reason},
            ],
            veto_reason=reason,
            risk_multiplier=1.0,
        )

    if risk_config.get("block_if_no_stop") is True and not candidate.invalidation.strip():
        reason = "Candidate lacks an explicit invalidation condition."
        return RiskAssessment(
            accepted=False,
            final_status="invalidated",
            final_score=0,
            risk_flags=[
                *risk_flags,
                {"type": "missing_invalidation", "severity": "block", "reason": reason},
            ],
            veto_reason=reason,
            risk_multiplier=1.0,
        )

    preferred = (rule_result.preferred_instrument or "").lower()
    if risk_config.get("block_0dte_by_default") is True and "0dte" in preferred:
        reason = "Preferred instrument conflicts with the default 0DTE block."
        return RiskAssessment(
            accepted=False,
            final_status="invalidated",
            final_score=0,
            risk_flags=[
                *risk_flags,
                {"type": "zero_dte_veto", "severity": "block", "reason": reason},
            ],
            veto_reason=reason,
            risk_multiplier=1.0,
        )

    multiplier = _risk_multiplier(rulepack=rulepack, symbol=candidate.symbol)
    pending_multiplier = 0.75 if pending_conditions else 1.0
    final_score = round(score_result.total_score * pending_multiplier, 2)
    if multiplier < 1:
        final_score = round(final_score * multiplier, 2)
        risk_flags.append(
            {
                "type": "high_beta_symbol",
                "severity": "downgrade",
                "symbol": candidate.symbol,
                "risk_multiplier": multiplier,
                "reason": "RulePack applies a symbol-specific risk multiplier below 1.0.",
            }
        )
    if pending_conditions:
        risk_flags.append(
            {
                "type": "pending_condition_score_multiplier",
                "severity": "downgrade",
                "multiplier": pending_multiplier,
                "reason": "Pending required conditions reduce the risk-adjusted score.",
            }
        )

    return RiskAssessment(
        accepted=True,
        final_status=status,
        final_score=min(score_result.total_score, final_score),
        risk_flags=risk_flags,
        veto_reason=None,
        risk_multiplier=multiplier,
    )


def _risk_multiplier(*, rulepack: RulePack, symbol: str) -> float:
    raw = rulepack.raw.get("risk", {}).get("symbol_risk_multiplier", {}).get(symbol, 1.0)
    return float(raw) if isinstance(raw, int | float) else 1.0
