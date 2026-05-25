from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.modules.market_snapshot import MarketSnapshot
from app.modules.rule_engine import RuleEvaluation
from app.modules.setup_detection import SetupCandidate


@dataclass(frozen=True)
class ScoreResult:
    total_score: float
    components: dict[str, dict[str, Any]]
    weights: dict[str, float]
    rule_version: str


def score_candidate(
    *,
    candidate: SetupCandidate,
    rule_result: RuleEvaluation,
    snapshot: MarketSnapshot | None = None,
) -> ScoreResult:
    weights = _weights(rule_result)
    if not rule_result.passed:
        components = {
            "setup_strength": _component(0, weights["technical_structure"], "rule_blocked"),
            "evidence_quality": _component(0, 0, "rule_blocked"),
            "trader_playbook_match": _component(
                0, weights["trader_playbook_match"], "rule_blocked"
            ),
            "market_gate": _component(0, weights["market_gate"], rule_result.market_gate),
            "relative_strength": _component(0, weights["relative_strength"], "not_available"),
            "catalyst_context": _component(0, weights["catalyst"], "rule_blocked"),
            "volume_technical_confirmation": _component(
                0, weights["volume_confirmation"], "rule_blocked"
            ),
            "options_confirmation": _component(
                0, weights["options_confirmation"], "rule_blocked"
            ),
            "risk_penalty": _component(0, weights["risk_penalty_max"], "risk_engine_applies"),
        }
        return ScoreResult(
            total_score=0,
            components=components,
            weights=weights,
            rule_version=rule_result.rule_version,
        )

    components = {
        "market_gate": _component(
            _market_gate_score(rule_result, weights["market_gate"]),
            weights["market_gate"],
            _market_gate_reason(rule_result),
        ),
        "setup_strength": _component(
            _setup_strength(candidate, weights["technical_structure"]),
            weights["technical_structure"],
            candidate.status,
        ),
        "evidence_quality": _component(
            0,
            0,
            f"candidate_evidence_refs:{len(candidate.evidence_refs)}",
        ),
        "trader_playbook_match": _component(
            _evidence_quality(candidate, weights["trader_playbook_match"]),
            weights["trader_playbook_match"],
            rule_result.rule_name or "unmapped",
        ),
        "relative_strength": _component(0, weights["relative_strength"], "not_available"),
        "catalyst_context": _component(
            _catalyst_score(candidate, snapshot, weights["catalyst"]),
            weights["catalyst"],
            "news_or_filing_context",
        ),
        "volume_technical_confirmation": _component(
            _volume_score(rule_result, snapshot, weights["volume_confirmation"]),
            weights["volume_confirmation"],
            "candidate_or_snapshot_volume_context",
        ),
        "options_confirmation": _component(
            _options_score(candidate, weights["options_confirmation"]),
            weights["options_confirmation"],
            "options_context",
        ),
        "risk_penalty": _component(0, weights["risk_penalty_max"], "risk_engine_applies"),
    }
    total = round(sum(float(item["score"]) for item in components.values()), 2)
    return ScoreResult(
        total_score=total,
        components=components,
        weights=weights,
        rule_version=rule_result.rule_version,
    )


def _weights(rule_result: RuleEvaluation) -> dict[str, float]:
    raw = rule_result.evidence.get("scoring_weights", {})
    defaults = {
        "market_gate": 0,
        "trader_playbook_match": 0,
        "technical_structure": 0,
        "relative_strength": 0,
        "volume_confirmation": 0,
        "catalyst": 0,
        "options_confirmation": 0,
        "risk_penalty_max": 0,
    }
    weights = {}
    for key, default in defaults.items():
        value = raw.get(key, default)
        weights[key] = float(value) if isinstance(value, int | float) else float(default)
    return weights


def _component(score: float, max_score: float, reason: str) -> dict[str, Any]:
    if max_score < 0:
        bounded = min(0.0, max(float(score), float(max_score)))
    else:
        bounded = min(float(max_score), max(0.0, float(score)))
    return {"score": round(bounded, 2), "max_score": max_score, "reason": reason}


def _market_gate_score(rule_result: RuleEvaluation, max_score: float) -> float:
    if rule_result.all_required_conditions_met:
        return max_score
    return 0


def _market_gate_reason(rule_result: RuleEvaluation) -> str:
    if rule_result.all_required_conditions_met:
        return rule_result.market_gate
    pending = [
        item["condition"]
        for item in rule_result.condition_results
        if item.get("status") != "confirmed"
    ]
    if pending:
        return f"{rule_result.market_gate}:pending:{','.join(pending)}"
    return f"{rule_result.market_gate}:pending"


def _setup_strength(candidate: SetupCandidate, max_score: float) -> float:
    if candidate.status == "waiting_trigger":
        return max_score * 0.88
    if candidate.status == "observe":
        return max_score * 0.56
    return 0


def _evidence_quality(candidate: SetupCandidate, max_score: float) -> float:
    return min(max_score, len(candidate.evidence_refs) * (max_score / 3))


def _catalyst_score(
    candidate: SetupCandidate,
    snapshot: MarketSnapshot | None,
    max_score: float,
) -> float:
    refs = set(candidate.evidence_refs)
    if any("news" in ref or "filing" in ref for ref in refs):
        return max_score
    if snapshot is None:
        return 0
    context_refs = {
        str(item["evidence_ref"]) for item in [*snapshot.news, *snapshot.filings]
    }
    return max_score if refs & context_refs else 0


def _volume_score(
    rule_result: RuleEvaluation,
    snapshot: MarketSnapshot | None,
    max_score: float,
) -> float:
    if any(
        item.get("condition") == "relative_volume_gt_threshold"
        and item.get("status") == "confirmed"
        for item in rule_result.condition_results
    ):
        return max_score
    return 0 if snapshot is not None else 0


def _options_score(candidate: SetupCandidate, max_score: float) -> float:
    text = f"{candidate.setup_type} {candidate.reason} {candidate.trigger_condition}".lower()
    return max_score if "option" in text else 0
