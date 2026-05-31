from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.config import Settings
from app.db.migrations import bootstrap_database
from app.db.models import agent_events, signals
from app.db.session import create_sqlite_engine
from app.modules import signal_manager as signal_manager_module
from app.db.models import memory_candidates
from app.modules.evidence_ref import EvidenceRef, RefType
from app.modules.market_snapshot import EvidenceGapError, build_market_snapshot
from app.modules.memory_service import create_memory_item
from app.modules.risk_engine import assess_signal_risk
from app.modules.rule_engine import evaluate_candidate_rule
from app.modules.scoring import score_candidate
from app.modules.setup_detection import SetupCandidate, detect_setups
from app.modules.signal_manager import persist_signal
from app.rulepack.loader import load_rulepack
from app.tools.local_adapter import (
    FILING_EVENTS_FIXTURE,
    MARKET_BARS_FIXTURE,
    MARKET_CALENDAR_FIXTURE,
    NEWS_EVENTS_FIXTURE,
    LocalToolAdapter,
)

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"
ALL_CAPABILITIES = {
    MARKET_BARS_FIXTURE,
    MARKET_CALENDAR_FIXTURE,
    NEWS_EVENTS_FIXTURE,
    FILING_EVENTS_FIXTURE,
}


def _settings(tmp_path: Path, capabilities: set[str] = ALL_CAPABILITIES) -> Settings:
    repo_root = Path(__file__).resolve().parents[4]
    return Settings(
        repo_root=repo_root,
        data_dir=tmp_path / "trader-agent-data",
        fixture_data_dir=FIXTURE_DIR,
        rulepack_path=repo_root / "apps" / "trader-agent" / "shared" / "rulepacks" / "v0_1_0.yaml",
        enabled_tool_capabilities=capabilities,
    )


def _snapshot(tmp_path: Path, symbol: str):
    adapter = LocalToolAdapter(_settings(tmp_path))
    return build_market_snapshot(
        adapter=adapter,
        symbol=symbol,
        start="2026-05-20",
        end="2026-05-22",
    )


def _tsla_sharp_drop_candidate(tmp_path: Path):
    result = detect_setups(_snapshot(tmp_path, "TSLA"))
    return next(
        item for item in result.candidates if item.setup_type == "sharp_drop_volume_contraction"
    )


def test_market_snapshot_raises_explicit_gap_when_required_capability_is_missing(
    tmp_path: Path,
) -> None:
    adapter = LocalToolAdapter(_settings(tmp_path, ALL_CAPABILITIES - {NEWS_EVENTS_FIXTURE}))

    with pytest.raises(EvidenceGapError) as excinfo:
        build_market_snapshot(
            adapter=adapter,
            symbol="SPY",
            start="2026-05-22",
            end="2026-05-22",
        )

    gap = excinfo.value.gap
    assert gap.gap_type == "missing_capability"
    assert gap.capability == NEWS_EVENTS_FIXTURE
    assert "news" in gap.reason.lower()


def test_market_snapshot_rejects_symbol_outside_fixed_universe(tmp_path: Path) -> None:
    adapter = LocalToolAdapter(_settings(tmp_path))

    with pytest.raises(EvidenceGapError) as excinfo:
        build_market_snapshot(
            adapter=adapter,
            symbol="XYZ",
            start="2026-05-22",
            end="2026-05-22",
        )

    gap = excinfo.value.gap
    assert gap.gap_type == "outside_fixed_universe"
    assert gap.source == "rulepack"
    assert "fixed universe" in gap.reason.lower()


def test_sharp_drop_volume_contraction_produces_waiting_trigger_without_trade_action(
    tmp_path: Path,
) -> None:
    result = detect_setups(_snapshot(tmp_path, "TSLA"))

    candidate = next(
        item for item in result.candidates if item.setup_type == "sharp_drop_volume_contraction"
    )
    payload = asdict(candidate)

    assert payload["status"] == "waiting_trigger"
    assert payload["evidence_refs"]
    assert payload["evidence_refs"][0]["ref_type"] == RefType.RAW_CHAT_MESSAGE.value
    assert payload["reason"]
    assert payload["trigger_condition"]
    assert payload["invalidation"]
    assert "buy" not in str(payload).lower()
    assert "order" not in str(payload).lower()
    assert "trade ticket" not in str(payload).lower()


def test_candidate_contract_includes_required_decision_fields(tmp_path: Path) -> None:
    result = detect_setups(_snapshot(tmp_path, "TSLA"))

    for candidate in result.candidates:
        payload = asdict(candidate)
        assert set(payload) >= {
            "evidence_refs",
            "setup_type",
            "reason",
            "trigger_condition",
            "invalidation",
            "status",
        }


def test_btc_news_context_produces_observe_candidate(tmp_path: Path) -> None:
    result = detect_setups(_snapshot(tmp_path, "COIN"))

    candidate = next(item for item in result.candidates if item.setup_type == "btc_move_alert")
    assert candidate.status == "observe"
    assert "bitcoin" in candidate.reason.lower() or "btc" in candidate.reason.lower()
    assert candidate.evidence_refs


def test_filing_reduction_wait_window_produces_waiting_candidate(tmp_path: Path) -> None:
    result = detect_setups(_snapshot(tmp_path, "NVDA"))

    candidate = next(
        item for item in result.candidates if item.setup_type == "post_reduction_wait_window"
    )
    assert candidate.status in {"waiting_trigger", "observe"}
    assert "wait" in candidate.reason.lower() or "窗口" in candidate.reason
    assert candidate.trigger_condition
    assert candidate.invalidation
    assert candidate.evidence_refs


def test_friday_options_risk_news_produces_observe_candidate(tmp_path: Path) -> None:
    result = detect_setups(_snapshot(tmp_path, "SPY"))

    candidate = next(
        item for item in result.candidates if item.setup_type == "friday_options_risk_pattern"
    )
    assert candidate.status == "observe"
    assert "option" in candidate.reason.lower()
    assert candidate.evidence_refs


def test_setup_detection_returns_gap_when_required_evidence_is_absent(tmp_path: Path) -> None:
    result = detect_setups(_snapshot(tmp_path, "SPY"))

    gap = next(item for item in result.gaps if item.setup_type == "post_reduction_wait_window")
    assert gap.gap_type == "insufficient_evidence"
    assert "filing" in gap.reason.lower()


def test_gap_fill_setup_returns_explicit_gap_until_fixture_support_exists(tmp_path: Path) -> None:
    result = detect_setups(_snapshot(tmp_path, "SPY"))

    gap = next(item for item in result.gaps if item.setup_type == "gap_fill")
    assert gap.gap_type == "insufficient_evidence"
    assert "previous session" in gap.reason.lower()


def test_rule_engine_maps_supported_candidate_to_enabled_rule_and_blocks_disallowed_symbol(
    tmp_path: Path,
) -> None:
    snapshot = _snapshot(tmp_path, "TSLA")
    candidate = _tsla_sharp_drop_candidate(tmp_path)
    rulepack = load_rulepack(_settings(tmp_path).rulepack_path)
    accepted = evaluate_candidate_rule(
        candidate=candidate,
        rulepack=rulepack,
        snapshot=snapshot,
    )

    assert accepted.passed is True
    assert accepted.rule_name == "vwap_reclaim"
    assert accepted.rule_version == "0.1.0"
    assert accepted.market_gate
    assert accepted.all_required_conditions_met is False
    assert any(
        item["condition"] == "relative_volume_gt_threshold"
        and item["status"] == "confirmed"
        for item in accepted.condition_results
    )
    assert accepted.evidence["condition_results"] == accepted.condition_results
    without_snapshot = evaluate_candidate_rule(candidate=candidate, rulepack=rulepack)
    assert any(
        item["condition"] == "relative_volume_gt_threshold" and item["status"] == "pending"
        for item in without_snapshot.condition_results
    )
    assert any(
        item["condition"] == "symbol_reclaims_vwap" and item["status"] == "pending"
        for item in accepted.condition_results
    )
    assert accepted.evidence["setup_type"] == "sharp_drop_volume_contraction"

    disallowed = SetupCandidate(
        symbol="AAPL",
        setup_type="sharp_drop_volume_contraction",
        status="waiting_trigger",
        reason="Fixture candidate used to verify RulePack symbol bounds.",
        trigger_condition="Wait for local confirmation.",
        invalidation="Invalidate on failed confirmation.",
        evidence_refs=[
            EvidenceRef(
                ref_type=RefType.RAW_CHAT_MESSAGE,
                ref_id="fixture:AAPL:2026-05-22",
                artifact_id="",
                artifact_path="fixture:AAPL",
                source_date="2026-05-22",
            )
        ],
    )

    blocked = evaluate_candidate_rule(candidate=disallowed, rulepack=rulepack)

    assert blocked.passed is False
    assert blocked.rule_name == "vwap_reclaim"
    assert "allowed_symbols" in blocked.reason


def test_rule_engine_includes_symbol_specific_required_conditions(tmp_path: Path) -> None:
    rulepack = load_rulepack(_settings(tmp_path).rulepack_path)
    candidate = SetupCandidate(
        symbol="BMNR",
        setup_type="btc_move_alert",
        status="observe",
        reason="Fixture candidate used to verify BMNR-specific RulePack gates.",
        trigger_condition="Observe local confirmation.",
        invalidation="Invalidate if crypto context weakens.",
        evidence_refs=[
            EvidenceRef(
                ref_type=RefType.NEWS_ARCHIVE,
                ref_id="fixture.news_events:BMNR:2026-05-22",
                artifact_id="",
                artifact_path="fixture.news_events:BMNR",
                source_date="2026-05-22",
            )
        ],
    )

    result = evaluate_candidate_rule(candidate=candidate, rulepack=rulepack)
    condition_names = {item["condition"] for item in result.condition_results}

    assert result.rule_name == "gap_hold"
    assert {"first_30m_hold_above_vwap", "qqq_not_risk_off", "crypto_not_weak"}.issubset(
        condition_names
    )
    assert any(
        item["condition"] == "crypto_not_weak" and item["status"] == "pending"
        for item in result.condition_results
    )


def test_scoring_is_deterministic_bounded_and_uses_rulepack_weights(tmp_path: Path) -> None:
    snapshot = _snapshot(tmp_path, "TSLA")
    candidate = _tsla_sharp_drop_candidate(tmp_path)
    rulepack = load_rulepack(_settings(tmp_path).rulepack_path)
    rule_result = evaluate_candidate_rule(
        candidate=candidate,
        rulepack=rulepack,
        snapshot=snapshot,
    )

    first = score_candidate(candidate=candidate, rule_result=rule_result, snapshot=snapshot)
    second = score_candidate(candidate=candidate, rule_result=rule_result, snapshot=snapshot)

    assert first == second
    positive_weight_total = sum(
        value for key, value in first.weights.items() if key != "risk_penalty_max"
    )
    assert first.total_score <= positive_weight_total
    assert set(first.components) >= {
        "setup_strength",
        "evidence_quality",
        "catalyst_context",
        "volume_technical_confirmation",
        "risk_penalty",
    }
    assert first.weights["technical_structure"] == 25
    assert first.components["market_gate"]["score"] == 0
    assert "pending" in first.components["market_gate"]["reason"]
    assert first.components["volume_technical_confirmation"]["score"] == 10
    assert first.components["evidence_quality"]["max_score"] == 0
    assert "candidate_evidence_refs" in first.components["evidence_quality"]["reason"]
    assert first.components["risk_penalty"]["score"] <= 0


def test_risk_engine_downgrades_high_beta_without_creating_ticket_ready_state(
    tmp_path: Path,
) -> None:
    snapshot = _snapshot(tmp_path, "TSLA")
    candidate = _tsla_sharp_drop_candidate(tmp_path)
    rulepack = load_rulepack(_settings(tmp_path).rulepack_path)
    rule_result = evaluate_candidate_rule(
        candidate=candidate,
        rulepack=rulepack,
        snapshot=snapshot,
    )
    scoring = score_candidate(candidate=candidate, rule_result=rule_result, snapshot=snapshot)

    risk = assess_signal_risk(
        candidate=candidate,
        rule_result=rule_result,
        score_result=scoring,
        rulepack=rulepack,
    )

    assert risk.accepted is True
    assert risk.final_status in {"observe", "waiting_trigger", "invalidated"}
    assert risk.final_score <= scoring.total_score
    assert any(flag["type"] == "high_beta_symbol" for flag in risk.risk_flags)
    assert any(flag["type"] == "pending_required_conditions" for flag in risk.risk_flags)
    assert any(
        flag["type"] == "pending_condition_score_multiplier" for flag in risk.risk_flags
    )
    assert risk.veto_reason is None
    assert "ticket_ready" not in str(risk).lower()


def test_risk_engine_applies_pending_condition_downgrade_for_full_multiplier_symbol(
    tmp_path: Path,
) -> None:
    snapshot = _snapshot(tmp_path, "SPY")
    result = detect_setups(snapshot)
    candidate = next(
        item for item in result.candidates if item.setup_type == "friday_options_risk_pattern"
    )
    rulepack = load_rulepack(_settings(tmp_path).rulepack_path)
    rule_result = evaluate_candidate_rule(
        candidate=candidate,
        rulepack=rulepack,
        snapshot=snapshot,
    )
    scoring = score_candidate(candidate=candidate, rule_result=rule_result, snapshot=snapshot)

    risk = assess_signal_risk(
        candidate=candidate,
        rule_result=rule_result,
        score_result=scoring,
        rulepack=rulepack,
    )

    assert risk.risk_multiplier == 1.0
    assert risk.final_score < scoring.total_score
    assert any(
        flag["type"] == "pending_condition_score_multiplier" for flag in risk.risk_flags
    )


def test_signal_manager_persists_auditable_signal_and_signal_event(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    recorded_events: list[dict[str, object]] = []
    original_record = signal_manager_module.record_agent_event

    def capture_record_agent_event(*args, **kwargs):
        recorded_events.append({"args": args, "kwargs": kwargs})
        return original_record(*args, **kwargs)

    monkeypatch.setattr(
        signal_manager_module,
        "record_agent_event",
        capture_record_agent_event,
    )
    snapshot = _snapshot(tmp_path, "TSLA")
    candidate = _tsla_sharp_drop_candidate(tmp_path)
    rulepack = load_rulepack(settings.rulepack_path)
    rule_result = evaluate_candidate_rule(
        candidate=candidate,
        rulepack=rulepack,
        snapshot=snapshot,
    )
    scoring = score_candidate(candidate=candidate, rule_result=rule_result, snapshot=snapshot)
    risk = assess_signal_risk(
        candidate=candidate,
        rule_result=rule_result,
        score_result=scoring,
        rulepack=rulepack,
    )

    persisted = persist_signal(
        settings=settings,
        candidate=candidate,
        rule_result=rule_result,
        score_result=scoring,
        risk_result=risk,
        snapshot=snapshot,
        run_id="test-run-id",
    )

    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        signal_row = (
            conn.execute(select(signals).where(signals.c.id == persisted["id"]))
            .mappings()
            .one()
        )
        event_row = (
            conn.execute(select(agent_events).where(agent_events.c.signal_id == persisted["id"]))
            .mappings()
            .one()
        )

    assert signal_row["symbol"] == "TSLA"
    assert signal_row["status"] in {"observe", "waiting_trigger", "invalidated"}
    assert signal_row["rule_version"] == "0.1.0"
    assert signal_row["market_gate"] == rule_result.market_gate
    assert signal_row["entry_trigger"] == candidate.trigger_condition
    assert signal_row["invalidation"] == candidate.invalidation
    assert signal_row["agent_version"]
    assert any(
        flag["type"] == "high_beta_symbol" for flag in json.loads(signal_row["risk_flags"])
    )
    assert event_row["event_type"] == "signal_persisted"
    assert event_row["symbol"] == "TSLA"
    assert event_row["run_id"] == "test-run-id"
    assert len(recorded_events) == 1
    assert recorded_events[0]["kwargs"]["event_type"] == "signal_persisted"
    assert recorded_events[0]["kwargs"]["signal_id"] == persisted["id"]
    forbidden = ("buy", "sell", "order", "execution")
    assert not any(word in str(dict(signal_row)).lower() for word in forbidden)


def test_signal_manager_rolls_back_signal_when_audit_event_cannot_be_created(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    snapshot = _snapshot(tmp_path, "TSLA")
    candidate = _tsla_sharp_drop_candidate(tmp_path)
    rulepack = load_rulepack(settings.rulepack_path)
    rule_result = evaluate_candidate_rule(
        candidate=candidate,
        rulepack=rulepack,
        snapshot=snapshot,
    )
    scoring = score_candidate(candidate=candidate, rule_result=rule_result, snapshot=snapshot)
    risk = assess_signal_risk(
        candidate=candidate,
        rule_result=rule_result,
        score_result=scoring,
        rulepack=rulepack,
    )

    def fail_event_record(*_args, **_kwargs):
        raise RuntimeError("audit insert failed")

    monkeypatch.setattr(signal_manager_module, "record_agent_event", fail_event_record)

    with pytest.raises(RuntimeError, match="audit insert failed"):
        persist_signal(
            settings=settings,
            candidate=candidate,
            rule_result=rule_result,
            score_result=scoring,
            risk_result=risk,
            snapshot=snapshot,
            run_id="test-run-id",
        )

    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        assert conn.execute(select(signals)).mappings().all() == []
        assert conn.execute(select(agent_events)).mappings().all() == []
