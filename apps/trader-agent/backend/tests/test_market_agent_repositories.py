from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest
from sqlalchemy import text

from app.core.config import Settings
from app.intel.db.schema import init_intel_db
from app.intel.db.connection import get_intel_engine, set_intel_db_path
from app.intel.market_agent.repositories import (
    MarketAgentConflictError,
    create_feature_snapshot,
    create_failure_memory,
    create_pattern_memory,
    create_session_context_pack,
    create_setup_event,
    list_feature_snapshots,
    list_failure_memories,
    list_pattern_memories,
    list_session_context_packs,
    list_setup_events,
)
from app.intel.market_agent.schemas import (
    FailureMemory,
    FeatureSnapshot,
    PatternMemory,
    SetupEvent,
    SessionContextPack,
)


def _settings(tmp_repo: Path) -> Settings:
    return Settings(
        repo_root=tmp_repo,
        data_dir=tmp_repo / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
    )


def _setup_engine(tmp_path: Path):
    tmp_repo = tmp_path / "repo"
    db_path = tmp_repo / "data" / "market_intel.db"
    set_intel_db_path(db_path)
    return init_intel_db(_settings(tmp_repo)), _settings(tmp_repo)


RECORD_CASES = [
    (
        "feature_snapshots",
        create_feature_snapshot,
        list_feature_snapshots,
        {"symbol": "TSLA"},
        lambda: FeatureSnapshot(
            feature_snapshot_id="fs-1",
            symbol="tsla",
            asof_ts="2026-06-01T12:00:00Z",
            timeframe="1d",
            features_json={"trend": "up", "score": 0.8},
            tags_json=[{"name": "demo"}],
        ),
        lambda rec: replace(rec, features_json={"trend": "down", "score": 0.2}),
        "feature_snapshot_id",
        ("features_json", "tags_json"),
    ),
    (
        "setup_events",
        create_setup_event,
        list_setup_events,
        {"symbol": "NVDA"},
        lambda: SetupEvent(
            setup_event_id="ev-1",
            symbol="nvda",
            event_type="started",
            event_ts="2026-06-02T09:00:00Z",
            setup_json={"stage": "entry", "status": "ok"},
            context_json={"source": "scanner"},
        ),
        lambda rec: replace(rec, setup_json={"stage": "exit", "status": "ok"}),
        "setup_event_id",
        ("setup_json", "context_json"),
    ),
    (
        "pattern_memories",
        create_pattern_memory,
        list_pattern_memories,
        {"symbol": "TSLA"},
        lambda: PatternMemory(
            pattern_memory_id="pm-1",
            pattern_id="double_bottom",
            symbol="tsla",
            confidence=0.73,
            memory_json={"hit_rate": 0.58, "samples": 120},
            evidence_refs_json=["e1", "e2"],
        ),
        lambda rec: replace(rec, memory_json={"hit_rate": 0.1, "samples": 2}),
        "pattern_memory_id",
        ("memory_json", "evidence_refs_json"),
    ),
    (
        "failure_memories",
        create_failure_memory,
        list_failure_memories,
        {"symbol": "SPY"},
        lambda: FailureMemory(
            failure_memory_id="fm-1",
            symbol="spy",
            failure_type="timeout",
            failed_ts="2026-06-03T10:30:00Z",
            failure_json={"error": "connect", "retries": 3},
            context_json={"session": "s-1"},
        ),
        lambda rec: replace(rec, failure_json={"error": "other", "retries": 1}),
        "failure_memory_id",
        ("failure_json", "context_json"),
    ),
    (
        "session_context_packs",
        create_session_context_pack,
        list_session_context_packs,
        {"symbol": "TSLA"},
        lambda: SessionContextPack(
            session_context_pack_id="scp-1",
            session_id="sess-1",
            symbol="tsla",
            context_pack_json={"bias": "risk-on", "volatility": "high"},
            metadata_json={"version": "v1"},
        ),
        lambda rec: replace(rec, context_pack_json={"bias": "risk-off", "volatility": "low"}),
        "session_context_pack_id",
        ("context_pack_json", "metadata_json"),
    ),
]


@pytest.mark.parametrize(
    "table, create_fn, list_fn, list_filter, make_record, mutate_record, id_field, json_fields",
    RECORD_CASES,
)
def test_market_agent_repositories_create_is_idempotent_and_list_returns_deserialized_json(
    tmp_path: Path,
    table: str,
    create_fn,
    list_fn,
    list_filter: dict[str, str],
    make_record,
    mutate_record,
    id_field: str,
    json_fields: tuple[str, ...],
) -> None:
    engine, _ = _setup_engine(tmp_path)
    record = make_record()
    created = create_fn(engine, record)
    again = create_fn(engine, record)
    assert again == created

    items = list_fn(engine, **list_filter)
    assert len(items) == 1
    item = items[0]
    for field_name in json_fields:
        value = getattr(item, field_name)
        assert isinstance(value, (dict, list))

    with engine.connect() as conn:
        stored = conn.execute(
            text(f"SELECT * FROM {table} WHERE {id_field} = :record_id"),
            {"record_id": getattr(record, id_field)},
        ).mappings().fetchone()
    assert stored is not None
    for field_name in json_fields:
        assert isinstance(stored[field_name], str)

    conflict_record = mutate_record(record)
    with pytest.raises(MarketAgentConflictError):
        create_fn(engine, conflict_record)


def test_market_agent_repository_filters_and_list_supports_id_fields(tmp_path: Path) -> None:
    engine, _ = _setup_engine(tmp_path)

    created = create_feature_snapshot(
        engine,
        FeatureSnapshot(
            feature_snapshot_id="fs-filter",
            symbol="AAPL",
            asof_ts="2026-06-04T12:00:00Z",
            timeframe="5m",
            features_json={"momentum": 1.2},
            tags_json=["alpha"],
        ),
    )
    create_feature_snapshot(
        engine,
        FeatureSnapshot(
            feature_snapshot_id="fs-filter-2",
            symbol="TSLA",
            asof_ts="2026-06-04T12:00:00Z",
            timeframe="5m",
            features_json={"momentum": 0.4},
            tags_json=["beta"],
        ),
    )
    assert created is not None

    tsla_snapshots = list_feature_snapshots(engine, symbol="tsla")
    assert any(item.feature_snapshot_id == "fs-filter-2" for item in tsla_snapshots)
    assert all(item.symbol == "TSLA" for item in tsla_snapshots)


def test_session_context_pack_allows_multiple_records_for_same_session_id(tmp_path: Path) -> None:
    engine, _ = _setup_engine(tmp_path)

    create_session_context_pack(
        engine,
        SessionContextPack(
            session_context_pack_id="scp-a",
            session_id="session-shared",
            symbol="TSLA",
            context_pack_json={"bias": "risk-on"},
            metadata_json={"revision": 1},
        ),
    )
    second = create_session_context_pack(
        engine,
        SessionContextPack(
            session_context_pack_id="scp-b",
            session_id="session-shared",
            symbol="TSLA",
            context_pack_json={"bias": "risk-off"},
            metadata_json={"revision": 2},
        ),
    )

    items = list_session_context_packs(engine, session_id="session-shared")
    assert len(items) == 2
    assert {item.session_context_pack_id for item in items} == {"scp-a", "scp-b"}

    with engine.connect() as conn:
        count = conn.execute(
            text("SELECT COUNT(*) AS count FROM session_context_packs WHERE session_id = :session_id"),
            {"session_id": "session-shared"},
        ).scalar_one()
    assert count == 2
    assert second.session_context_pack_id == "scp-b"
