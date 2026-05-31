from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.modules.market_snapshot import MarketSnapshot
from app.modules.setup_detection import SetupCandidate
from app.rulepack.loader import RulePack, RulePackRule

PHASE_1C_SETUP_RULE_MAP = {
    "sharp_drop_volume_contraction": "vwap_reclaim",
    "btc_move_alert": "gap_hold",
    "post_reduction_wait_window": "daily_breakout_retest",
    "friday_options_risk_pattern": "opening_range_breakout",
}


@dataclass(frozen=True)
class RuleEvaluation:
    passed: bool
    reason: str
    rule_name: str | None
    rule_version: str
    market_gate: str
    preferred_instrument: str | None
    condition_results: list[dict[str, Any]]
    all_required_conditions_met: bool
    evidence: dict[str, Any]


def evaluate_candidate_rule(
    *,
    candidate: SetupCandidate,
    rulepack: RulePack,
    snapshot: MarketSnapshot | None = None,
) -> RuleEvaluation:
    active_rules = {rule.name: rule for rule in rulepack.active_rules}
    rule_name = _rule_name_for_candidate(candidate, active_rules)
    if rule_name is None:
        return _blocked(
            candidate=candidate,
            rulepack=rulepack,
            rule_name=None,
            reason=(
                f"{candidate.setup_type} is not an enabled RulePack setup and has no "
                "supported Phase 1C setup mapping."
            ),
        )

    rule = active_rules.get(rule_name)
    if rule is None:
        return _blocked(
            candidate=candidate,
            rulepack=rulepack,
            rule_name=rule_name,
            reason=(
                f"{candidate.setup_type} maps to {rule_name}, but that RulePack rule "
                "is disabled or unavailable."
            ),
        )

    if candidate.symbol not in rulepack.universe_symbols:
        return _blocked(
            candidate=candidate,
            rulepack=rulepack,
            rule_name=rule.name,
            reason=f"{candidate.symbol} is outside the RulePack fixed universe.",
            rule=rule,
        )

    allowed_symbols = rule.config.get("allowed_symbols")
    if isinstance(allowed_symbols, list) and candidate.symbol not in allowed_symbols:
        return _blocked(
            candidate=candidate,
            rulepack=rulepack,
            rule_name=rule.name,
            reason=(
                f"{candidate.symbol} is not present in {rule.name}.allowed_symbols."
            ),
            rule=rule,
        )

    condition_results = _condition_results(candidate=candidate, rule=rule, snapshot=snapshot)
    return RuleEvaluation(
        passed=True,
        reason=(
            f"{candidate.setup_type} accepted for Phase 1C tracking through enabled "
            f"RulePack rule {rule.name}."
        ),
        rule_name=rule.name,
        rule_version=rulepack.version,
        market_gate=_market_gate_label(rule),
        preferred_instrument=_preferred_instrument(rule, candidate.symbol),
        condition_results=condition_results,
        all_required_conditions_met=_all_required_conditions_met(condition_results),
        evidence=_rule_evidence(
            candidate=candidate,
            rule=rule,
            rulepack=rulepack,
            condition_results=condition_results,
        ),
    )


def _rule_name_for_candidate(
    candidate: SetupCandidate,
    active_rules: dict[str, RulePackRule],
) -> str | None:
    if candidate.setup_type in active_rules:
        return candidate.setup_type
    return PHASE_1C_SETUP_RULE_MAP.get(candidate.setup_type)


def _blocked(
    *,
    candidate: SetupCandidate,
    rulepack: RulePack,
    rule_name: str | None,
    reason: str,
    rule: RulePackRule | None = None,
) -> RuleEvaluation:
    return RuleEvaluation(
        passed=False,
        reason=reason,
        rule_name=rule_name,
        rule_version=rulepack.version,
        market_gate=_market_gate_label(rule) if rule is not None else "rule_unavailable",
        preferred_instrument=(
            _preferred_instrument(rule, candidate.symbol) if rule is not None else None
        ),
        condition_results=_condition_results(candidate=candidate, rule=rule, snapshot=None),
        all_required_conditions_met=False,
        evidence=_rule_evidence(
            candidate=candidate,
            rule=rule,
            rulepack=rulepack,
            condition_results=_condition_results(candidate=candidate, rule=rule, snapshot=None),
        ),
    )


def _rule_evidence(
    *,
    candidate: SetupCandidate,
    rule: RulePackRule | None,
    rulepack: RulePack,
    condition_results: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "setup_type": candidate.setup_type,
        "candidate_status": candidate.status,
        "candidate_reason": candidate.reason,
        "candidate_evidence_refs": [ref.as_dict() for ref in candidate.evidence_refs],
        "mapped_rule": None if rule is None else rule.name,
        "required_conditions": [] if rule is None else list(rule.config.get("required", [])),
        "condition_results": condition_results,
        "rule_thresholds": {} if rule is None else dict(rule.config.get("thresholds", {})),
        "rule_invalidation": [] if rule is None else list(rule.config.get("invalidation", [])),
        "allowed_symbols": [] if rule is None else list(rule.config.get("allowed_symbols", [])),
        "scoring_weights": dict(rulepack.raw.get("scoring", {}).get("weights", {})),
    }


def _condition_results(
    *,
    candidate: SetupCandidate,
    rule: RulePackRule | None,
    snapshot: MarketSnapshot | None,
) -> list[dict[str, Any]]:
    if rule is None:
        return []

    required = _required_conditions(candidate=candidate, rule=rule)
    if not isinstance(required, list):
        return []

    thresholds = rule.config.get("thresholds", {})
    min_relative_volume = None
    if isinstance(thresholds, dict):
        raw_threshold = thresholds.get("min_relative_volume")
        if isinstance(raw_threshold, int | float):
            min_relative_volume = float(raw_threshold)

    results = []
    for condition in required:
        if not isinstance(condition, str):
            continue
        results.append(
            _evaluate_required_condition(
                candidate=candidate,
                condition=condition,
                min_relative_volume=min_relative_volume,
                snapshot=snapshot,
            )
        )
    return results


def _required_conditions(
    *,
    candidate: SetupCandidate,
    rule: RulePackRule,
) -> list[Any]:
    required = list(rule.config.get("required", []))
    symbol_specific = rule.config.get("symbol_specific", {}).get(candidate.symbol, {})
    if isinstance(symbol_specific, dict):
        symbol_required = symbol_specific.get("required", [])
        if isinstance(symbol_required, list):
            for condition in symbol_required:
                if condition not in required:
                    required.append(condition)
    return required


def _evaluate_required_condition(
    *,
    candidate: SetupCandidate,
    condition: str,
    min_relative_volume: float | None,
    snapshot: MarketSnapshot | None,
) -> dict[str, Any]:
    if condition == "relative_volume_gt_threshold":
        relative_volume = _candidate_relative_volume(candidate=candidate, snapshot=snapshot)
        if relative_volume is None:
            return {
                "condition": condition,
                "status": "pending",
                "reason": "No numeric relative-volume evidence is available for this setup.",
            }
        if min_relative_volume is None or relative_volume >= min_relative_volume:
            return {
                "condition": condition,
                "status": "confirmed",
                "reason": (
                    f"Numeric relative volume {relative_volume:.2f} meets RulePack "
                    f"minimum {min_relative_volume}."
                ),
            }
        return {
            "condition": condition,
            "status": "failed",
            "reason": (
                f"Numeric relative volume {relative_volume:.2f} is below RulePack "
                f"minimum {min_relative_volume}."
            ),
        }
    if condition in {
        "symbol_reclaims_vwap",
        "break_above_opening_range_high",
        "price_above_vwap_after_open",
        "daily_breakout_confirmed",
        "retest_holds",
        "first_30m_hold_above_vwap",
    }:
        return {
            "condition": condition,
            "status": "pending",
            "reason": "The setup is waiting for this price-structure confirmation.",
        }
    if condition in {
        "qqq_not_risk_off",
        "qqq_confirms_direction",
        "crypto_not_weak",
        "catalyst_exists",
        "gap_up",
        "opening_range_defined",
        "symbol_outperforms_qqq",
        "pullback_not_high_volume_selloff",
    }:
        return {
            "condition": condition,
            "status": "pending",
            "reason": "Current Phase 1C local snapshot does not confirm this cross-context gate.",
        }
    return {
        "condition": condition,
        "status": "pending",
        "reason": "No deterministic Phase 1C evaluator exists for this condition yet.",
    }


def _all_required_conditions_met(condition_results: list[dict[str, Any]]) -> bool:
    return bool(condition_results) and all(
        item.get("status") == "confirmed" for item in condition_results
    )


def _candidate_relative_volume(
    *,
    candidate: SetupCandidate,
    snapshot: MarketSnapshot | None,
) -> float | None:
    if snapshot is None:
        return None

    candidate_ref_ids = {ref.ref_id for ref in candidate.evidence_refs}
    candidate_bars = [
        item for item in snapshot.bars if str(item["evidence_ref"]) in candidate_ref_ids
    ]
    if not candidate_bars:
        return None

    explicit_values = [
        _float_or_none(item["payload"].get("relative_volume")) for item in candidate_bars
    ]
    numeric_explicit_values = [value for value in explicit_values if value is not None]
    if numeric_explicit_values:
        return max(numeric_explicit_values)

    volumes = [
        _float_or_none(item["payload"].get("volume"))
        for item in snapshot.bars
        if _float_or_none(item["payload"].get("volume")) is not None
    ]
    if len(volumes) < 2:
        return None
    baseline_candidates = [
        _float_or_none(item["payload"].get("volume"))
        for item in snapshot.bars
        if str(item["evidence_ref"]) not in candidate_ref_ids
    ]
    baselines = [value for value in baseline_candidates if value is not None and value > 0]
    candidate_volumes = [
        _float_or_none(item["payload"].get("volume")) for item in candidate_bars
    ]
    valid_candidate_volumes = [value for value in candidate_volumes if value is not None]
    if not valid_candidate_volumes:
        return None
    if not baselines:
        first_volume = valid_candidate_volumes[0]
        if len(valid_candidate_volumes) < 2 or first_volume <= 0:
            return None
        return max(valid_candidate_volumes[1:]) / first_volume
    return max(valid_candidate_volumes) / (sum(baselines) / len(baselines))


def _float_or_none(value: Any) -> float | None:
    if isinstance(value, int | float):
        return float(value)
    return None


def _market_gate_label(rule: RulePackRule | None) -> str:
    if rule is None:
        return "rule_unavailable"
    required = set(rule.config.get("required", []))
    if "qqq_not_risk_off" in required or "qqq_confirms_direction" in required:
        return "risk_on_required_pending"
    if "crypto_not_weak" in required:
        return "crypto_context_required_pending"
    return "rulepack_gate_not_required"


def _preferred_instrument(rule: RulePackRule, symbol: str) -> str | None:
    symbol_config = rule.config.get("symbol_specific", {}).get(symbol, {})
    if isinstance(symbol_config, dict) and isinstance(
        symbol_config.get("preferred_instrument"), str
    ):
        return symbol_config["preferred_instrument"]
    preferred = rule.config.get("preferred_instrument")
    return preferred if isinstance(preferred, str) else None
