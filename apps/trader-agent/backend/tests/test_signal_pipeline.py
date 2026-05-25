from __future__ import annotations

from dataclasses import asdict
from pathlib import Path

import pytest

from app.core.config import Settings
from app.modules.market_snapshot import EvidenceGapError, build_market_snapshot
from app.modules.setup_detection import detect_setups
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
