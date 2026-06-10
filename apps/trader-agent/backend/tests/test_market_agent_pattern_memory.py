from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config import Settings
from app.intel.db.connection import set_intel_db_path
from app.intel.db.schema import init_intel_db
from app.intel.market_agent.patterns import FailureMemoryService, PatternMemoryService
from app.intel.market_agent.repositories import (
    create_failure_memory,
    create_pattern_memory,
    list_pattern_memories,
)
from app.intel.market_agent.schemas import FailureMemory, PatternMemory


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


def _make_pattern(
    pattern_memory_id: str,
    *,
    symbol: str,
    pattern_id: str,
    status: str,
    created_at: str | None = None,
) -> PatternMemory:
    return PatternMemory(
        pattern_memory_id=pattern_memory_id,
        symbol=symbol,
        pattern_id=pattern_id,
        confidence=0.55,
        memory_json={"status": status, "evidence": f"seed:{status}"},
        evidence_refs_json=[f"ref:{status}"],
        created_at=created_at,
    )


def _make_failure(
    *,
    failure_memory_id: str,
    symbol: str,
    failure_type: str,
    status: str | None,
    setup_name: str | None = None,
    use_context: bool = False,
    created_at: str | None = None,
) -> FailureMemory:
    failure_json: dict[str, object] = {}
    if not use_context:
        if status is not None:
            failure_json["status"] = status
        if setup_name is not None:
            failure_json["setup_name"] = setup_name
    context_json: dict[str, object] = {}
    if use_context:
        if status is not None:
            context_json["status"] = status
        if setup_name is not None:
            context_json["setup_name"] = setup_name
    return FailureMemory(
        failure_memory_id=failure_memory_id,
        symbol=symbol,
        failure_type=failure_type,
        failed_ts=created_at or "2026-06-10T09:00:00Z",
        failure_json=failure_json,
        context_json=context_json,
        created_at=created_at,
    )


def test_pattern_memory_service_list_filters_status(tmp_path: Path) -> None:
    engine = _init_db(tmp_path)
    create_pattern_memory(
        engine,
        _make_pattern("pm-a1", symbol="AAPL", pattern_id="p-accumulate", status="promoted"),
    )
    create_pattern_memory(
        engine,
        _make_pattern("pm-a2", symbol="AAPL", pattern_id="p-vol", status="degrading"),
    )
    create_pattern_memory(
        engine,
        _make_pattern("pm-a3", symbol="AAPL", pattern_id="p-other", status="active"),
    )
    service = PatternMemoryService(engine)

    promoted = service.list(symbol="aapl", status="promoted")
    assert len(promoted) == 1
    assert all(item.memory_json.get("status") == "promoted" for item in promoted)

    degrading = service.list(symbol="AAPL", status="degrading")
    assert len(degrading) == 1
    assert all(item.memory_json.get("status") == "degrading" for item in degrading)


def test_pattern_memory_service_list_status_applies_before_limit_truncation(tmp_path: Path) -> None:
    engine = _init_db(tmp_path)
    for index in range(205):
        minute = index // 60
        second = index % 60
        create_pattern_memory(
            engine,
            _make_pattern(
                f"pm-new-{index}",
                symbol="TSLA",
                pattern_id="p-accumulate",
                status="active",
                created_at=f"2026-06-10T10:{minute:02d}:{second:02d}Z",
            ),
        )
    create_pattern_memory(
        engine,
        _make_pattern(
            "pm-promoted",
            symbol="TSLA",
            pattern_id="p-accumulate",
            status="promoted",
            created_at="2026-06-10T09:00:00Z",
        ),
    )

    promoted = list_pattern_memories(
        engine,
        symbol="tsla",
        pattern_id="p-accumulate",
        status="promoted",
        limit=1,
        latest_per_pattern=False,
    )

    assert len(promoted) == 1
    assert promoted[0].pattern_memory_id == "pm-promoted"


def test_pattern_memory_service_promote_requires_confirm_and_generates_new_memory_entry(tmp_path: Path) -> None:
    engine = _init_db(tmp_path)
    seed = create_pattern_memory(
        engine,
        _make_pattern("pm-base", symbol="TSLA", pattern_id="p-decision", status="active"),
    )
    service = PatternMemoryService(engine)
    with pytest.raises(ValueError, match="confirm=True"):
        service.promote(seed)

    promoted = service.promote(seed, confirm=True)
    assert promoted.pattern_memory_id != seed.pattern_memory_id
    assert promoted.memory_json["status"] == "promoted"

    degraded = service.degrade(promoted)
    assert degraded.pattern_memory_id != promoted.pattern_memory_id
    assert degraded.memory_json["status"] == "degrading"


def test_failure_memory_service_filters_active_warnings_and_setup_name(tmp_path: Path) -> None:
    engine = _init_db(tmp_path)
    create_failure_memory(
        engine,
        _make_failure(
            failure_memory_id="fm-a1",
            symbol="SPY",
            failure_type="timeout",
            status="active",
            setup_name="setup-a",
        ),
    )
    create_failure_memory(
        engine,
        _make_failure(
            failure_memory_id="fm-a2",
            symbol="SPY",
            failure_type="timeout",
            status="retired",
            setup_name="setup-retired",
        ),
    )
    create_failure_memory(
        engine,
        _make_failure(
            failure_memory_id="fm-a3",
            symbol="TSLA",
            failure_type="data_quality",
            status="open",
            setup_name="setup-b",
            use_context=True,
        ),
    )
    create_failure_memory(
        engine,
        _make_failure(
            failure_memory_id="fm-a4",
            symbol="TSLA",
            failure_type="data_quality",
            status="closed",
            setup_name="setup-closed",
            use_context=True,
        ),
    )

    service = FailureMemoryService(engine)

    active_spy = service.list_active_warnings(symbol="SPY", failure_type="timeout")
    assert len(active_spy) == 1
    assert active_spy[0].failure_memory_id == "fm-a1"

    setup_b = service.list_active_warnings(
        symbol="TSLA",
        failure_type="data_quality",
        setup_name="setup-b",
    )
    assert len(setup_b) == 1
    assert setup_b[0].failure_memory_id == "fm-a3"


def test_failure_memory_service_active_warning_setup_filter_applies_before_limit_truncation(tmp_path: Path) -> None:
    engine = _init_db(tmp_path)
    for index in range(205):
        minute = index // 60
        second = index % 60
        create_failure_memory(
            engine,
            _make_failure(
                failure_memory_id=f"fm-new-{index}",
                symbol="TSLA",
                failure_type="data_quality",
                status="closed",
                setup_name="setup-b",
                use_context=False,
                created_at=f"2026-06-10T10:{minute:02d}:{second:02d}Z",
            ),
        )
    create_failure_memory(
        engine,
        _make_failure(
            failure_memory_id="fm-old-active",
            symbol="TSLA",
            failure_type="data_quality",
            status="active",
            setup_name="setup-b",
            use_context=False,
            created_at="2026-06-10T09:00:00Z",
        ),
    )

    service = FailureMemoryService(engine)
    active = service.list_active_warnings(symbol="TSLA", failure_type="data_quality", setup_name="setup-b", limit=1)

    assert len(active) == 1
    assert active[0].failure_memory_id == "fm-old-active"
