from __future__ import annotations

from dataclasses import replace
from pathlib import Path

from app.core.config import Settings
from app.intel.db.connection import set_intel_db_path
from app.intel.db.schema import init_intel_db
from app.intel.market_agent.repositories import create_setup_event, list_setup_events
from app.intel.market_agent.schemas import SetupEvent
from app.intel.market_agent.setups import SetupDetector


def _settings(tmp_repo: Path) -> Settings:
    return Settings(
        repo_root=tmp_repo,
        data_dir=tmp_repo / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
    )


def _init_db(tmp_path: Path):
    tmp_repo = tmp_path / "repo"
    db_path = tmp_repo / "data" / "market_intel.db"
    set_intel_db_path(db_path)
    return init_intel_db(_settings(tmp_repo))


def _setup_event(
    setup_event_id: str,
    *,
    symbol: str,
    setup_name: str,
    setup_status: str,
    event_ts: str,
    confidence: float | None = None,
    evidence_seed: str = "test",
) -> SetupEvent:
    return SetupEvent(
        setup_event_id=setup_event_id,
        symbol=symbol,
        event_type=setup_name,
        event_ts=event_ts,
        setup_json={
            "setup_name": setup_name,
            "setup_status": setup_status,
            "confidence": confidence,
            "conditions": {},
            "invalidations": {},
            "evidence_seed": evidence_seed,
        },
        context_json={"timeframe": "5m"},
    )


def test_setup_detector_detects_vwap_reclaim_confirmed() -> None:
    detector = SetupDetector()
    feature_snapshot = {
        "symbol": "TSLA",
        "timeframe": "5m",
        "asof_ts": "2026-06-10T10:02:00Z",
        "features": {
            "current_price": 101.0,
            "vwap": 100.0,
        },
    }
    recent_bars = [
        {"ts": "2026-06-10T10:01:00Z", "open": 99.0, "high": 100.5, "low": 98.5, "close": 99.5, "volume": 1200.0, "vwap": 99.8},
        {"ts": "2026-06-10T10:02:00Z", "open": 99.5, "high": 101.5, "low": 99.2, "close": 101.0, "volume": 1300.0, "vwap": 100.0},
    ]
    events = detector.detect(feature_snapshot, recent_bars)
    assert len(events) == 1
    assert events[0].setup_name == "VWAP_RECLAIM"
    assert events[0].setup_status == "confirmed"
    assert events[0].confidence is not None and events[0].confidence > 0


def test_setup_detector_detects_relative_strength_pullback_forming() -> None:
    detector = SetupDetector()
    feature_snapshot = {
        "symbol": "NVDA",
        "timeframe": "5m",
        "asof_ts": "2026-06-10T11:00:00Z",
        "features": {
            "current_price": 130.0,
            "relative_strength_qqq": 0.9,
            "vwap": 129.0,
        },
    }
    events = detector.detect(feature_snapshot, [])
    assert len(events) == 1
    assert events[0].setup_name == "RELATIVE_STRENGTH_PULLBACK"
    assert events[0].setup_status == "confirmed"


def test_setup_detector_detects_relative_strength_pullback_with_spy_metric_only() -> None:
    detector = SetupDetector()
    feature_snapshot = {
        "symbol": "NVDA",
        "timeframe": "5m",
        "asof_ts": "2026-06-10T11:05:00Z",
        "features": {
            "current_price": 130.0,
            "relative_strength_spy": 0.9,
            "vwap": 129.0,
        },
    }
    events = detector.detect(feature_snapshot, [])
    assert len(events) == 1
    assert events[0].setup_name == "RELATIVE_STRENGTH_PULLBACK"
    assert events[0].setup_status == "confirmed"


def test_setup_detector_detects_opening_range_breakout() -> None:
    detector = SetupDetector()
    feature_snapshot = {
        "symbol": "AAPL",
        "timeframe": "5m",
        "asof_ts": "2026-06-10T09:15:00Z",
        "features": {
            "opening_range_high": 99.0,
            "current_price": 102.0,
            "volume_ratio": 2.2,
        },
    }
    recent_bars = [
        {"ts": "2026-06-10T09:11:00Z", "open": 98.0, "high": 98.8, "low": 97.5, "close": 98.6, "volume": 1000.0},
        {"ts": "2026-06-10T09:12:00Z", "open": 98.6, "high": 99.2, "low": 98.0, "close": 99.0, "volume": 1000.0},
        {"ts": "2026-06-10T09:13:00Z", "open": 99.0, "high": 99.3, "low": 98.8, "close": 99.1, "volume": 1000.0},
    ]
    events = detector.detect(feature_snapshot, recent_bars)
    assert len(events) == 1
    assert events[0].setup_name == "OPENING_RANGE_BREAKOUT"
    assert events[0].setup_status == "confirmed"


def test_setup_detector_returns_no_events_for_insufficient_data() -> None:
    detector = SetupDetector()
    feature_snapshot = {
        "symbol": "TSLA",
        "timeframe": "5m",
        "asof_ts": "2026-06-10T10:02:00Z",
        "features": {},
    }
    recent_bars = [
        {"ts": "2026-06-10T10:01:00Z", "open": 99.0, "high": 100.5, "low": 98.5, "close": 99.5, "volume": 1200.0},
    ]
    events = detector.detect(feature_snapshot, recent_bars)
    assert events == []


def test_setup_detector_returns_blocked_for_failed_quality() -> None:
    detector = SetupDetector()
    feature_snapshot = {
        "symbol": "TSLA",
        "timeframe": "1d",
        "quality_status": "failed",
        "features": {},
    }
    events = detector.detect(feature_snapshot, [])
    assert len(events) == 1
    assert events[0].setup_status == "blocked"


def test_persist_events_filters_low_confidence_and_persists_blocked_events(tmp_path: Path) -> None:
    db = _init_db(tmp_path)
    detector = SetupDetector()
    events = [
        _setup_event(
            "se-test-1",
            symbol="TSLA",
            setup_name="VWAP_RECLAIM",
            setup_status="forming",
            confidence=0.3,
            event_ts="2026-06-10T10:00:00Z",
            evidence_seed="low",
        ),
        _setup_event(
            "se-test-2",
            symbol="TSLA",
            setup_name="RELATIVE_STRENGTH_PULLBACK",
            setup_status="confirmed",
            confidence=0.92,
            event_ts="2026-06-10T10:05:00Z",
            evidence_seed="high",
        ),
        _setup_event(
            "se-test-3",
            symbol="TSLA",
            setup_name="QUALITY_CHECK",
            setup_status="blocked",
            event_ts="2026-06-10T10:10:00Z",
            evidence_seed="blocked",
        ),
        _setup_event(
            "se-test-4",
            symbol="TSLA",
            setup_name="VWAP_RECLAIM",
            setup_status="not_present",
            event_ts="2026-06-10T10:15:00Z",
            evidence_seed="none",
        ),
    ]

    persisted = detector.persist_events(events, db, min_confidence=0.8)
    assert {item.setup_event_id for item in persisted} == {"se-test-2", "se-test-3"}

    created = list_setup_events(db, symbol="TSLA")
    assert len(created) == 2
    created_names = {item.setup_name for item in created}
    assert created_names == {"RELATIVE_STRENGTH_PULLBACK", "QUALITY_CHECK"}

    # idempotent write-back path is handled by repository contract
    conflict = replace(events[1], event_type="RELATIVE_STRENGTH_PULLBACK")
    create_setup_event(db, conflict)
    items = list_setup_events(db, symbol="TSLA")
    assert len(items) == 2
