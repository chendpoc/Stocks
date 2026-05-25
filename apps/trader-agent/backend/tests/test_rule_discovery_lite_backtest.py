from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.core.config import Settings
from app.db.migrations import bootstrap_database
from app.db.models import (
    agent_events,
    lite_backtest_reports,
    rule_candidate_evidence_requirements,
    rule_candidates,
    trader_semantic_events,
)
from app.db.session import create_sqlite_engine
from app.modules._json import loads
from app.modules.corpus import import_jsonl
from app.modules.rule_discovery import (
    InvalidCandidateTransitionError,
    advance_backtested_candidate,
    create_manual_rule_candidate,
    create_rule_candidate_from_semantic_event,
    run_lite_backtest,
    validate_candidate_evidence_requirements,
)
from app.modules.semantic_extraction import extract_semantic_events_for_all

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"
MESSAGES_FIXTURE = FIXTURE_DIR / "trader_messages.jsonl"


def _settings(tmp_path: Path, capabilities: set[str] | None = None) -> Settings:
    repo_root = Path(__file__).resolve().parents[4]
    return Settings(
        repo_root=repo_root,
        data_dir=tmp_path / "trader-agent-data",
        fixture_data_dir=FIXTURE_DIR,
        rulepack_path=repo_root / "apps" / "trader-agent" / "shared" / "rulepacks" / "v0_1_0.yaml",
        enabled_tool_capabilities=frozenset(
            capabilities
            if capabilities is not None
            else {
                "market_bars.fixture",
                "market_calendar.fixture",
                "news_events.fixture",
                "filing_events.fixture",
            }
        ),
        enable_event_jsonl_mirror=False,
    )


def _semantic_event_id(settings: Settings, setup_hint: str) -> str:
    bootstrap_database(settings)
    import_jsonl(settings, MESSAGES_FIXTURE)
    extract_semantic_events_for_all(settings)
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        return conn.execute(
            select(trader_semantic_events.c.id).where(
                trader_semantic_events.c.setup_hint == setup_hint
            )
        ).scalar_one()


def test_creates_candidate_from_semantic_event_without_rulepack_or_trade_side_effects(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path)
    event_id = _semantic_event_id(settings, "sharp_drop_volume_contraction")
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        expected_symbol = conn.execute(
            select(trader_semantic_events.c.symbol).where(trader_semantic_events.c.id == event_id)
        ).scalar_one()

    candidate_id = create_rule_candidate_from_semantic_event(settings, event_id)

    with engine.connect() as conn:
        candidate = conn.execute(
            select(rule_candidates).where(rule_candidates.c.id == candidate_id)
        ).mappings().one()
        events = conn.execute(
            select(agent_events.c.event_type, agent_events.c.status).where(
                agent_events.c.event_type == "rule_discovery.candidate_created"
            )
        ).all()

    assert candidate["source"] == "semantic_event"
    assert loads(candidate["source_ref"]) == {"event_id": event_id}
    assert loads(candidate["symbols"]) == [expected_symbol]
    assert candidate["status"] == "draft"
    assert candidate["latest_report_id"] is None
    assert candidate["approval_request_id"] is None
    assert candidate["versioned_rule_id"] is None
    assert events[-1] == ("rule_discovery.candidate_created", "completed")


def test_manual_candidate_records_market_bar_requirement_and_waits_for_validation(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)

    candidate_id = create_manual_rule_candidate(
        settings,
        {
            "hypothesis": "Sharp intraday drop can stabilize after forced selling pauses.",
            "symbols": ["TSLA"],
            "trigger_definition": "sharp_drop",
            "entry_condition": "enter_next_bar_for_measurement_only",
            "invalidation": "selling_volume_expands_again",
            "risk_notes": ["local deterministic fixture only"],
        },
    )

    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        candidate = conn.execute(
            select(rule_candidates).where(rule_candidates.c.id == candidate_id)
        ).mappings().one()

    assert candidate["status"] == "draft"
    assert loads(candidate["data_requirements"]) == [
        {
            "provider_capability": "market_bars.fixture",
            "requirement_type": "market_bars",
            "required_quality": {"min_bars": 3},
        }
    ]


def test_missing_market_bar_capability_records_gap_and_blocks_backtest(tmp_path: Path) -> None:
    settings = _settings(tmp_path, capabilities={"market_calendar.fixture"})
    bootstrap_database(settings)
    candidate_id = create_manual_rule_candidate(
        settings,
        {
            "hypothesis": "Sharp intraday drop can stabilize after forced selling pauses.",
            "symbols": ["TSLA"],
            "trigger_definition": "sharp_drop",
            "entry_condition": "enter_next_bar_for_measurement_only",
            "invalidation": "selling_volume_expands_again",
        },
    )

    validation = validate_candidate_evidence_requirements(settings, candidate_id)

    assert validation["status"] == "blocked"
    assert validation["candidate_status"] == "evidence_required"
    assert validation["status_sequence"] == ["draft", "evidence_required"]
    assert validation["gaps"] == [
        {
            "provider_capability": "market_bars.fixture",
            "reason": "missing capability: market_bars.fixture",
            "requirement_type": "market_bars",
            "symbol": "TSLA",
        }
    ]
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        requirement = conn.execute(
            select(rule_candidate_evidence_requirements).where(
                rule_candidate_evidence_requirements.c.candidate_id == candidate_id
            )
        ).mappings().one()
        candidate_status = conn.execute(
            select(rule_candidates.c.status).where(rule_candidates.c.id == candidate_id)
        ).scalar_one()

    assert requirement["status"] == "gap"
    assert requirement["gap_reason"] == "missing capability: market_bars.fixture"
    assert candidate_status == "evidence_required"
    with pytest.raises(InvalidCandidateTransitionError, match="backtest_pending"):
        run_lite_backtest(settings, candidate_id, "2026-05-22", "2026-05-22")


def test_lite_backtest_uses_fixture_bars_and_updates_candidate_after_report(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    candidate_id = create_manual_rule_candidate(
        settings,
        {
            "hypothesis": "Sharp intraday drop can stabilize after forced selling pauses.",
            "symbols": ["TSLA"],
            "trigger_definition": "sharp_drop",
            "entry_condition": "enter_next_bar_for_measurement_only",
            "invalidation": "selling_volume_expands_again",
        },
    )
    validation = validate_candidate_evidence_requirements(settings, candidate_id)

    assert validation["status"] == "satisfied"
    assert validation["candidate_status"] == "backtest_pending"
    assert validation["status_sequence"] == ["draft", "evidence_required", "backtest_pending"]

    report = run_lite_backtest(settings, candidate_id, "2026-05-22", "2026-05-22")

    assert report["sample_size"] == 1
    assert report["win_rate"] == 0.0
    assert report["avg_return"] < 0
    assert report["max_adverse_excursion"] <= 0
    assert report["max_favorable_excursion"] >= 0
    assert report["cost_model"] == {"commission": 0.0, "spread_bps": 5, "slippage_bps": 5}
    assert "small_sample" in report["quality_flags"]
    assert report["failure_cases"]
    assert report["failure_cases"][0]["reason"] == "non_positive_after_costs"
    assert report["decision"] in {"needs_more_data", "rejected", "pending_shadow_tracking"}
    assert report["latest_report_id"]

    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        candidate = conn.execute(
            select(rule_candidates).where(rule_candidates.c.id == candidate_id)
        ).mappings().one()
        stored_report = conn.execute(
            select(lite_backtest_reports).where(
                lite_backtest_reports.c.id == report["latest_report_id"]
            )
        ).mappings().one()
        completion_event = conn.execute(
            select(agent_events.c.event_type, agent_events.c.status).where(
                agent_events.c.event_type == "rule_discovery.lite_backtest_completed"
            )
        ).all()[-1]

    assert candidate["latest_report_id"] == report["latest_report_id"]
    assert candidate["status"] == "backtested"
    assert report["candidate_status"] == "backtested"
    stored_quality = loads(stored_report["quality_flags"])
    assert stored_quality["flags"] == report["quality_flags"]
    assert stored_quality["failure_cases"] == report["failure_cases"]
    assert completion_event == ("rule_discovery.lite_backtest_completed", "completed")

    advanced = advance_backtested_candidate(settings, candidate_id, report["decision"])

    with engine.connect() as conn:
        advanced_status = conn.execute(
            select(rule_candidates.c.status).where(rule_candidates.c.id == candidate_id)
        ).scalar_one()

    assert advanced == {"candidate_id": candidate_id, "status": report["decision"]}
    assert advanced_status == report["decision"]


@pytest.mark.parametrize("decision", ["pending_shadow_tracking", "pending_manual_approval"])
def test_report_required_terminal_states_verify_stored_report_exists(
    tmp_path: Path,
    decision: str,
) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    candidate_id = create_manual_rule_candidate(
        settings,
        {
            "hypothesis": "Sharp intraday drop can stabilize after forced selling pauses.",
            "symbols": ["TSLA"],
            "trigger_definition": "sharp_drop",
            "entry_condition": "enter_next_bar_for_measurement_only",
            "invalidation": "selling_volume_expands_again",
        },
    )
    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        conn.execute(
            rule_candidates.update()
            .where(rule_candidates.c.id == candidate_id)
            .values(status="backtested", latest_report_id="missing-report-id")
        )

    with pytest.raises(InvalidCandidateTransitionError, match="lite_backtest_report"):
        advance_backtested_candidate(settings, candidate_id, decision)


def test_terminal_candidate_cannot_be_advanced_again_without_report_revalidation(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    candidate_id = create_manual_rule_candidate(
        settings,
        {
            "hypothesis": "Sharp intraday drop can stabilize after forced selling pauses.",
            "symbols": ["TSLA"],
            "trigger_definition": "sharp_drop",
            "entry_condition": "enter_next_bar_for_measurement_only",
            "invalidation": "selling_volume_expands_again",
        },
    )
    validate_candidate_evidence_requirements(settings, candidate_id)
    report = run_lite_backtest(settings, candidate_id, "2026-05-22", "2026-05-22")
    advance_backtested_candidate(settings, candidate_id, "pending_shadow_tracking")
    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        conn.execute(
            rule_candidates.update()
            .where(rule_candidates.c.id == candidate_id)
            .values(latest_report_id="missing-report-id")
        )
    with engine.connect() as conn:
        event_count_before = conn.execute(
            select(func.count()).select_from(agent_events)
        ).scalar_one()

    with pytest.raises(InvalidCandidateTransitionError, match="lite_backtest_report"):
        advance_backtested_candidate(settings, candidate_id, "pending_shadow_tracking")

    with engine.connect() as conn:
        candidate = conn.execute(
            select(rule_candidates).where(rule_candidates.c.id == candidate_id)
        ).mappings().one()
        event_count_after = conn.execute(
            select(func.count()).select_from(agent_events)
        ).scalar_one()

    assert candidate["status"] == "pending_shadow_tracking"
    assert candidate["latest_report_id"] == "missing-report-id"
    assert event_count_after == event_count_before
    assert report["latest_report_id"]


def test_terminal_candidate_cannot_be_advanced_to_same_status_again(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    candidate_id = create_manual_rule_candidate(
        settings,
        {
            "hypothesis": "Sharp intraday drop can stabilize after forced selling pauses.",
            "symbols": ["TSLA"],
            "trigger_definition": "sharp_drop",
            "entry_condition": "enter_next_bar_for_measurement_only",
            "invalidation": "selling_volume_expands_again",
        },
    )
    validate_candidate_evidence_requirements(settings, candidate_id)
    run_lite_backtest(settings, candidate_id, "2026-05-22", "2026-05-22")
    advance_backtested_candidate(settings, candidate_id, "pending_shadow_tracking")
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        event_count_before = conn.execute(
            select(func.count()).select_from(agent_events)
        ).scalar_one()

    with pytest.raises(
        InvalidCandidateTransitionError,
        match="already pending_shadow_tracking",
    ):
        advance_backtested_candidate(settings, candidate_id, "pending_shadow_tracking")

    with engine.connect() as conn:
        candidate = conn.execute(
            select(rule_candidates).where(rule_candidates.c.id == candidate_id)
        ).mappings().one()
        event_count_after = conn.execute(
            select(func.count()).select_from(agent_events)
        ).scalar_one()

    assert candidate["status"] == "pending_shadow_tracking"
    assert candidate["latest_report_id"]
    assert event_count_after == event_count_before


def test_lite_backtest_cannot_replace_existing_backtested_report(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    candidate_id = create_manual_rule_candidate(
        settings,
        {
            "hypothesis": "Sharp intraday drop can stabilize after forced selling pauses.",
            "symbols": ["TSLA"],
            "trigger_definition": "sharp_drop",
            "entry_condition": "enter_next_bar_for_measurement_only",
            "invalidation": "selling_volume_expands_again",
        },
    )
    validate_candidate_evidence_requirements(settings, candidate_id)
    first_report = run_lite_backtest(settings, candidate_id, "2026-05-22", "2026-05-22")
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        event_count_before = conn.execute(
            select(func.count()).select_from(agent_events)
        ).scalar_one()
        evidence_rows_before = conn.execute(
            select(
                rule_candidate_evidence_requirements.c.id,
                rule_candidate_evidence_requirements.c.created_at,
            ).where(rule_candidate_evidence_requirements.c.candidate_id == candidate_id)
        ).all()

    with pytest.raises(InvalidCandidateTransitionError, match="backtest_pending"):
        run_lite_backtest(settings, candidate_id, "2026-05-22", "2026-05-22")

    with engine.connect() as conn:
        latest_report_id = conn.execute(
            select(rule_candidates.c.latest_report_id).where(
                rule_candidates.c.id == candidate_id
            )
        ).scalar_one()
        report_count = conn.execute(
            select(func.count()).select_from(lite_backtest_reports).where(
                lite_backtest_reports.c.candidate_id == candidate_id
            )
        ).scalar_one()
        event_count_after = conn.execute(
            select(func.count()).select_from(agent_events)
        ).scalar_one()
        evidence_rows_after = conn.execute(
            select(
                rule_candidate_evidence_requirements.c.id,
                rule_candidate_evidence_requirements.c.created_at,
            ).where(rule_candidate_evidence_requirements.c.candidate_id == candidate_id)
        ).all()

    assert latest_report_id == first_report["latest_report_id"]
    assert report_count == 1
    assert event_count_after == event_count_before
    assert evidence_rows_after == evidence_rows_before


def test_evidence_validation_cannot_rewrite_rows_after_backtest(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    candidate_id = create_manual_rule_candidate(
        settings,
        {
            "hypothesis": "Sharp intraday drop can stabilize after forced selling pauses.",
            "symbols": ["TSLA"],
            "trigger_definition": "sharp_drop",
            "entry_condition": "enter_next_bar_for_measurement_only",
            "invalidation": "selling_volume_expands_again",
        },
    )
    validate_candidate_evidence_requirements(settings, candidate_id)
    run_lite_backtest(settings, candidate_id, "2026-05-22", "2026-05-22")
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        event_count_before = conn.execute(
            select(func.count()).select_from(agent_events)
        ).scalar_one()
        evidence_rows_before = conn.execute(
            select(
                rule_candidate_evidence_requirements.c.id,
                rule_candidate_evidence_requirements.c.created_at,
            ).where(rule_candidate_evidence_requirements.c.candidate_id == candidate_id)
        ).all()

    with pytest.raises(InvalidCandidateTransitionError, match="Evidence validation requires"):
        validate_candidate_evidence_requirements(settings, candidate_id)

    with engine.connect() as conn:
        event_count_after = conn.execute(
            select(func.count()).select_from(agent_events)
        ).scalar_one()
        evidence_rows_after = conn.execute(
            select(
                rule_candidate_evidence_requirements.c.id,
                rule_candidate_evidence_requirements.c.created_at,
            ).where(rule_candidate_evidence_requirements.c.candidate_id == candidate_id)
        ).all()

    assert event_count_after == event_count_before
    assert evidence_rows_after == evidence_rows_before


def test_rule_discovery_outputs_are_research_only_not_execution_instructions(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    candidate_id = create_manual_rule_candidate(
        settings,
        {
            "hypothesis": "Sharp intraday drop can stabilize after forced selling pauses.",
            "symbols": ["TSLA"],
            "trigger_definition": "sharp_drop",
            "entry_condition": "enter_next_bar_for_measurement_only",
            "invalidation": "selling_volume_expands_again",
        },
    )
    validate_candidate_evidence_requirements(settings, candidate_id)
    report = run_lite_backtest(settings, candidate_id, "2026-05-22", "2026-05-22")

    combined = " ".join(
        [
            report["reason"],
            report["decision"],
            report["next_review_trigger"],
            str(report["trigger_logic"]),
            str(report["entry_logic"]),
        ]
    ).lower()

    forbidden_execution_terms = {
        "buy ",
        "sell ",
        "place order",
        "execute",
        "execution",
        "trade ticket",
        "broker",
        "activate rulepack",
    }
    assert not any(term in combined for term in forbidden_execution_terms)
