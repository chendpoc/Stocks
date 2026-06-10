from __future__ import annotations

from pathlib import Path

from app.core.config import Settings
from app.intel.db.connection import set_intel_db_path
from app.intel.db.schema import init_intel_db
from app.intel.market_agent.context import SessionContextBootstrap
from app.intel.market_agent.repositories import (
    create_pattern_memory,
    create_setup_event,
    list_session_context_packs,
)
from app.intel.market_agent.schemas import PatternMemory, SetupEvent


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


def _setup_event(symbol: str, event_id: str, setup_name: str) -> SetupEvent:
    return SetupEvent(
        setup_event_id=event_id,
        symbol=symbol,
        event_type=setup_name,
        event_ts="2026-06-10T10:00:00Z",
        setup_json={
            "setup_name": setup_name,
            "setup_status": "confirmed",
            "confidence": 0.82,
            "conditions": {},
            "invalidations": {},
            "evidence_seed": "auto",
        },
        context_json={"timeframe": "5m"},
    )


def test_context_bootstrap_bounded_markdown(tmp_path: Path) -> None:
    engine = _init_db(tmp_path)
    create_pattern_memory(
        engine,
        PatternMemory(
            pattern_memory_id="pm-long-1",
            symbol="AAPL",
            pattern_id="p-long",
            confidence=0.9,
            memory_json={
                "status": "promoted",
                "notes": "x" * 2000,
            },
            evidence_refs_json=["ref-a"],
        ),
    )
    create_setup_event(
        engine,
        _setup_event("AAPL", "se-context-1", "VWAP_RECLAIM"),
    )

    service = SessionContextBootstrap(engine)
    summary = service.bootstrap("session-1", symbol="AAPL", max_chars=200)

    assert len(summary.markdown) <= 200
    assert summary.promoted_count == 1
    assert summary.recent_fact_count >= 1
    assert "## Promoted Patterns" in summary.markdown


def test_context_bootstrap_append_only_and_latest_returns_newest(tmp_path: Path) -> None:
    engine = _init_db(tmp_path)
    service = SessionContextBootstrap(engine)

    first = service.bootstrap("session-shared", symbol="MSFT")
    second = service.bootstrap("session-shared", symbol="MSFT")

    assert first.session_context_pack_id != second.session_context_pack_id

    all_packs = list_session_context_packs(engine, session_id="session-shared")
    assert len(all_packs) == 2
    assert all(item.session_id == "session-shared" for item in all_packs)
    latest = service.latest(session_id="session-shared", symbol="MSFT")
    assert latest is not None
    assert latest.session_context_pack_id == second.session_context_pack_id
    assert "session_id: session-shared" in latest.markdown


def test_context_bootstrap_stable_sections_when_empty(tmp_path: Path) -> None:
    engine = _init_db(tmp_path)
    service = SessionContextBootstrap(engine)

    summary = service.bootstrap("session-empty", symbol="QQQ", max_chars=400)
    sections = [s.strip() for s in summary.markdown.split("\n\n") if s.strip()]

    assert any("## Promoted Patterns" in section for section in sections)
    assert any("## Degrading Patterns" in section for section in sections)
    assert any("## Active Warnings" in section for section in sections)
    assert any("## Recent Context Facts" in section for section in sections)
    assert "- (none)" in summary.markdown
