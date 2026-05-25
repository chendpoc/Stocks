from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select

from app.db.migrations import bootstrap_database
from app.db.models import agent_events, signals
from app.db.session import create_sqlite_engine
from app.modules.explanation import build_signal_explanation

FORBIDDEN_EXECUTION_LANGUAGE = (
    "automatic buy",
    "automatic sell",
    "place order",
    "execute trade",
    "ticket_ready",
)


def _insert_signal(
    temp_settings,
    *,
    signal_id: str,
    status: str,
    evidence: dict[str, Any] | None,
    risk_flags: list[dict[str, Any]] | None = None,
    entry_trigger: str | None = "wait until TSLA reclaims VWAP with relative volume above 1.5",
    invalidation: str | None = "invalid if TSLA loses prior low",
) -> None:
    bootstrap_database(temp_settings)
    engine = create_sqlite_engine(temp_settings)
    with engine.begin() as conn:
        conn.execute(
            signals.insert().values(
                id=signal_id,
                created_at="2026-05-25T09:30:00+00:00",
                updated_at="2026-05-25T09:31:00+00:00",
                symbol="TSLA",
                timeframe="2026-05-20..2026-05-22",
                setup_type="sharp_drop_reclaim",
                score=72,
                status=status,
                market_gate="supportive",
                trader_playbook_match=0.8,
                entry_trigger=entry_trigger,
                invalidation=invalidation,
                preferred_instrument="common_stock",
                evidence=json.dumps(evidence, ensure_ascii=False) if evidence is not None else None,
                risk_flags=json.dumps(risk_flags or [], ensure_ascii=False),
                tool_outputs=json.dumps(
                    {
                        "score_components": {
                            "trader_playbook_match": {"passed": True, "score": 0.8},
                            "market_gate": {"passed": True, "score": 0.6},
                        },
                        "score_after_risk": 72,
                    },
                    ensure_ascii=False,
                ),
                rule_version="0.1.0",
                agent_version="phase-1c-2",
            )
        )
        conn.execute(
            agent_events.insert().values(
                id=f"{signal_id}-event-1",
                timestamp="2026-05-25T09:30:10+00:00",
                run_id="run-1",
                task_id=None,
                signal_id=signal_id,
                symbol="TSLA",
                event_type="signal_manager.signal_persisted",
                status=status,
                title="Signal persisted",
                summary="Persisted from deterministic signal manager",
                input_summary=json.dumps({"module": "signal_manager"}, ensure_ascii=False),
                output_summary=json.dumps({"status": status}, ensure_ascii=False),
                tool_name=None,
                duration_ms=None,
                error=None,
            )
        )


def test_waiting_trigger_explanation_names_required_trigger_and_persisted_evidence(
    temp_settings,
) -> None:
    evidence = {
        "candidate": {
            "trigger_condition": "wait until TSLA reclaims VWAP with relative volume above 1.5",
            "invalidation": "invalid if TSLA loses prior low",
            "thesis": "Sharp drop reclaim setup",
        },
        "rule": {
            "passed": True,
            "reason": "Market gate supportive; trigger still pending",
            "rule_name": "sharp_drop_reclaim",
            "evidence": {
                "conditions": [
                    {"name": "market_gate", "passed": True, "detail": "supportive"},
                    {"name": "trigger", "passed": False, "detail": "VWAP reclaim absent"},
                ]
            },
        },
        "snapshot": {
            "symbol": "TSLA",
            "start": "2026-05-20",
            "end": "2026-05-22",
            "evidence_refs": ["market_bars:TSLA:2026-05-20"],
        },
    }
    risk_flags = [
        {"type": "high_beta_symbol", "severity": "downgrade"},
        {
            "type": "failed_required_conditions",
            "severity": "block",
            "reason": "required condition failed",
        },
    ]
    _insert_signal(
        temp_settings,
        signal_id="signal-waiting",
        status="waiting_trigger",
        evidence=evidence,
        risk_flags=risk_flags,
    )

    explanation = build_signal_explanation(temp_settings, "signal-waiting")

    assert explanation is not None
    assert explanation["current_status"] == "waiting_trigger"
    assert "wait until TSLA reclaims VWAP" in explanation["trigger"]
    assert "before action consideration" in explanation["next_human_decision_point"]
    assert explanation["evidence_timeline"][0]["event_type"] == "signal_manager.signal_persisted"
    assert explanation["rule_hits"][0]["name"] == "market_gate"
    assert explanation["rule_hits"][1]["passed"] is False
    assert explanation["risk_flags"] == risk_flags
    assert explanation["risk_blocks"] == [risk_flags[1]]


def test_invalidated_explanation_states_failed_condition(temp_settings) -> None:
    evidence = {
        "candidate": {
            "trigger_condition": "wait for reclaim",
            "invalidation": "invalid if TSLA loses prior low",
        },
        "rule": {
            "passed": False,
            "reason": "invalidation failed: TSLA lost prior low",
            "rule_name": "sharp_drop_reclaim",
            "evidence": {
                "conditions": [
                    {"name": "invalidation", "passed": False, "detail": "TSLA lost prior low"}
                ]
            },
        },
        "snapshot": {"evidence_refs": ["market_bars:TSLA:2026-05-22"]},
    }
    _insert_signal(
        temp_settings,
        signal_id="signal-invalidated",
        status="invalidated",
        evidence=evidence,
    )

    explanation = build_signal_explanation(temp_settings, "signal-invalidated")

    assert explanation is not None
    assert explanation["current_status"] == "invalidated"
    assert "TSLA lost prior low" in explanation["reason"]
    assert explanation["missing_conditions"] == ["invalidation"]
    assert "manual review" in explanation["next_human_decision_point"]


def test_explanation_reads_signal_manager_condition_results_shape(temp_settings) -> None:
    evidence = {
        "candidate": {
            "trigger_condition": "wait for reclaim",
            "invalidation": "invalid below prior low",
        },
        "rule": {
            "passed": True,
            "reason": "waiting for deterministic confirmations",
            "rule_name": "vwap_reclaim",
            "evidence": {
                "condition_results": [
                    {
                        "condition": "relative_volume_gt_threshold",
                        "status": "confirmed",
                        "reason": "Numeric relative volume meets RulePack minimum.",
                    },
                    {
                        "condition": "symbol_reclaims_vwap",
                        "status": "pending",
                        "reason": "The setup is waiting for price-structure confirmation.",
                    },
                ]
            },
        },
        "snapshot": {"evidence_refs": ["market_bars:TSLA:2026-05-22"]},
    }
    _insert_signal(
        temp_settings,
        signal_id="signal-condition-results",
        status="waiting_trigger",
        evidence=evidence,
    )

    explanation = build_signal_explanation(temp_settings, "signal-condition-results")

    assert explanation is not None
    assert explanation["rule_hits"][0]["name"] == "relative_volume_gt_threshold"
    assert explanation["rule_hits"][0]["source"] == "evidence.rule.evidence.condition_results"
    assert explanation["rule_hits"][0]["status"] == "confirmed"
    assert explanation["rule_hits"][0]["passed"] is True
    assert explanation["rule_hits"][1]["name"] == "symbol_reclaims_vwap"
    assert explanation["rule_hits"][1]["status"] == "pending"
    assert explanation["rule_hits"][1]["passed"] is None
    assert explanation["missing_conditions"] == ["symbol_reclaims_vwap"]


def test_missing_evidence_is_reported_without_invention(temp_settings) -> None:
    _insert_signal(
        temp_settings,
        signal_id="signal-missing",
        status="waiting_trigger",
        evidence={},
        risk_flags=[],
        entry_trigger=None,
        invalidation=None,
    )

    explanation = build_signal_explanation(temp_settings, "signal-missing")

    assert explanation is not None
    assert "entry_trigger" in explanation["missing_evidence"]
    assert "invalidation" in explanation["missing_evidence"]
    assert "evidence.rule" in explanation["missing_evidence"]
    assert explanation["trigger"] == "Missing persisted entry_trigger evidence."
    assert explanation["invalidation"] == "Missing persisted invalidation evidence."
    assert explanation["rule_hits"] == []


def test_score_components_do_not_replace_missing_rule_condition_evidence(
    temp_settings,
) -> None:
    evidence = {
        "candidate": {"trigger_condition": "wait for reclaim", "invalidation": "invalid below low"},
        "rule": {
            "passed": True,
            "reason": "rule persisted without condition-result evidence",
            "rule_name": "vwap_reclaim",
            "evidence": {},
        },
        "snapshot": {"evidence_refs": ["market_bars:TSLA:2026-05-22"]},
    }
    _insert_signal(
        temp_settings,
        signal_id="signal-missing-rule-conditions",
        status="waiting_trigger",
        evidence=evidence,
    )

    explanation = build_signal_explanation(temp_settings, "signal-missing-rule-conditions")

    assert explanation is not None
    assert "evidence.rule.evidence.condition_results" in explanation["missing_evidence"]
    assert all(
        item["source"] != "tool_outputs.score_components" for item in explanation["rule_hits"]
    )


def test_snapshot_none_is_reported_as_missing_evidence(temp_settings) -> None:
    evidence = {
        "candidate": {"trigger_condition": "wait for reclaim", "invalidation": "invalid below low"},
        "rule": {
            "passed": True,
            "reason": "waiting for trigger",
            "evidence": {
                "condition_results": [
                    {"condition": "symbol_reclaims_vwap", "status": "pending"}
                ]
            },
        },
        "snapshot": None,
    }
    _insert_signal(
        temp_settings,
        signal_id="signal-no-snapshot",
        status="waiting_trigger",
        evidence=evidence,
    )

    explanation = build_signal_explanation(temp_settings, "signal-no-snapshot")

    assert explanation is not None
    assert "evidence.snapshot" in explanation["missing_evidence"]
    assert "wait until TSLA reclaims VWAP" in explanation["conclusion"]
    assert "waiting for trigger" in explanation["reason"]
    assert "Missing persisted evidence: evidence.snapshot" in explanation["reason"]
    assert "before action consideration" in explanation["next_human_decision_point"]


def test_invalidated_failed_condition_survives_unrelated_missing_evidence(
    temp_settings,
) -> None:
    evidence = {
        "candidate": {
            "trigger_condition": "wait for reclaim",
            "invalidation": "invalid if TSLA loses prior low",
        },
        "rule": {
            "passed": False,
            "reason": "invalidation failed: TSLA lost prior low",
            "evidence": {
                "condition_results": [
                    {
                        "condition": "invalidation",
                        "status": "failed",
                        "reason": "TSLA lost prior low",
                    }
                ]
            },
        },
        "snapshot": None,
    }
    _insert_signal(
        temp_settings,
        signal_id="signal-invalidated-partial",
        status="invalidated",
        evidence=evidence,
    )

    explanation = build_signal_explanation(temp_settings, "signal-invalidated-partial")

    assert explanation is not None
    assert "evidence.snapshot" in explanation["missing_evidence"]
    assert "TSLA lost prior low" in explanation["reason"]
    assert "invalid if TSLA loses prior low" in explanation["conclusion"]
    assert "confirm the failed condition" in explanation["next_human_decision_point"]


def test_nested_forbidden_execution_language_is_redacted(temp_settings) -> None:
    evidence = {
        "candidate": {"trigger_condition": "wait for reclaim", "invalidation": "invalid below low"},
        "rule": {
            "passed": True,
            "reason": "waiting for trigger",
            "evidence": {"conditions": [{"name": "trigger", "passed": False}]},
        },
        "snapshot": {"evidence_refs": []},
    }
    _insert_signal(
        temp_settings,
        signal_id="signal-nested-redaction",
        status="waiting_trigger",
        evidence=evidence,
        risk_flags=[{"type": "ticket_ready", "reason": "place order"}],
    )
    engine = create_sqlite_engine(temp_settings)
    with engine.begin() as conn:
        conn.execute(
            agent_events.update()
            .where(agent_events.c.signal_id == "signal-nested-redaction")
            .values(
                input_summary=json.dumps({"instruction": "execute trade"}, ensure_ascii=False),
                output_summary=json.dumps({"status": "ticket_ready"}, ensure_ascii=False),
            )
        )

    explanation = build_signal_explanation(temp_settings, "signal-nested-redaction")

    payload_text = json.dumps(explanation, ensure_ascii=False).lower()
    assert not any(forbidden in payload_text for forbidden in FORBIDDEN_EXECUTION_LANGUAGE)


def test_invalidated_without_failed_condition_reports_missing_failed_condition_evidence(
    temp_settings,
) -> None:
    evidence = {
        "candidate": {"trigger_condition": "wait for reclaim", "invalidation": "invalid below low"},
        "rule": {
            "passed": True,
            "reason": "invalidated status was persisted without failed condition evidence",
            "evidence": {
                "condition_results": [
                    {"condition": "symbol_reclaims_vwap", "status": "pending"}
                ]
            },
        },
        "snapshot": {"evidence_refs": []},
    }
    _insert_signal(
        temp_settings,
        signal_id="signal-invalidated-missing-failure",
        status="invalidated",
        evidence=evidence,
    )

    explanation = build_signal_explanation(
        temp_settings,
        "signal-invalidated-missing-failure",
    )

    assert explanation is not None
    assert "rule.failed_condition" in explanation["missing_evidence"]


def test_invalidated_rule_level_failure_without_condition_rows_reports_missing_failed_condition(
    temp_settings,
) -> None:
    evidence = {
        "candidate": {"trigger_condition": "wait for reclaim", "invalidation": "invalid below low"},
        "rule": {
            "passed": False,
            "reason": "rule-level failure without condition rows",
            "rule_name": "vwap_reclaim",
            "evidence": {},
        },
        "snapshot": {"evidence_refs": []},
    }
    _insert_signal(
        temp_settings,
        signal_id="signal-rule-level-failure-only",
        status="invalidated",
        evidence=evidence,
    )

    explanation = build_signal_explanation(temp_settings, "signal-rule-level-failure-only")

    assert explanation is not None
    assert explanation["rule_hits"] == []
    assert "evidence.rule.evidence.condition_results" in explanation["missing_evidence"]
    assert "rule.failed_condition" in explanation["missing_evidence"]


def test_unknown_signal_returns_none(temp_settings) -> None:
    bootstrap_database(temp_settings)

    assert build_signal_explanation(temp_settings, "missing-signal") is None


def test_explanation_output_has_no_forbidden_execution_language(temp_settings) -> None:
    evidence = {
        "candidate": {"trigger_condition": "wait for reclaim", "invalidation": "invalid below low"},
        "rule": {
            "passed": True,
            "reason": "waiting for trigger",
            "evidence": {"conditions": [{"name": "trigger", "passed": False}]},
        },
        "snapshot": {"evidence_refs": []},
    }
    _insert_signal(
        temp_settings,
        signal_id="signal-safe-language",
        status="waiting_trigger",
        evidence=evidence,
    )

    explanation = build_signal_explanation(temp_settings, "signal-safe-language")

    payload_text = json.dumps(explanation, ensure_ascii=False).lower()
    assert not any(forbidden in payload_text for forbidden in FORBIDDEN_EXECUTION_LANGUAGE)
    engine = create_sqlite_engine(temp_settings)
    with engine.connect() as conn:
        assert conn.execute(select(agent_events)).mappings().all()
