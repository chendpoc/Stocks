from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.config import Settings
from app.db.migrations import bootstrap_database
from app.db.models import agent_events, memory_candidates, memory_items
from app.db.session import create_sqlite_engine
from app.modules.candidate_service import create_candidates
from app.modules.conflict_detector import mark_conflict
from app.modules.memory_service import (
    activate_candidate,
    batch_process,
    create_memory_item,
    deprecate_memory_item,
    list_memory_items,
    merge_candidate,
    reject_candidate,
    update_memory_item,
)


def _settings(tmp_path: Path) -> Settings:
    return Settings(
        repo_root=tmp_path,
        data_dir=tmp_path / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
    )


def _sample_candidate(**overrides) -> dict:
    base = {
        "candidate_type": "trading_rule",
        "title": "AAPL Breakout Rule",
        "summary": "Buy AAPL on breakout",
        "normalized_rule": "Enter long when AAPL breaks above VWAP",
        "applicability": "US equities",
        "invalidation_conditions_json": ["Close below VWAP"],
        "evidence_refs_json": [{"ref_type": "document_section", "ref_id": "sec-1"}],
        "symbols_json": ["AAPL"],
        "confidence": 0.7,
        "candidate_status": "candidate",
        "created_by": "rule_based",
    }
    base.update(overrides)
    return base


def _event_types(settings: Settings) -> set[str]:
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        rows = conn.execute(select(agent_events.c.event_type)).all()
    return {row[0] for row in rows}


def test_create_memory_item_status_active_all_fields_persisted(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    item = create_memory_item(
        settings,
        {
            "memory_type": "trading_rule",
            "title": "Manual memory",
            "summary": "summary text",
            "rule_text": "rule text",
            "symbols_json": ["NVDA"],
            "tags_json": ["momentum"],
            "confidence": 0.75,
        },
    )
    assert item["status"] == "active"
    assert item["title"] == "Manual memory"
    assert item["symbols_json"] == ["NVDA"]
    assert item["tags_json"] == ["momentum"]
    assert item["confidence"] == 0.75


def test_update_memory_item_sets_updated_by(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    created = create_memory_item(
        settings,
        {"memory_type": "trading_rule", "title": "Original"},
    )
    updated = update_memory_item(
        settings,
        created["id"],
        {"title": "Updated title"},
        updated_by="agent",
    )
    assert updated is not None
    assert updated["title"] == "Updated title"
    assert updated["updated_by"] == "agent"
    assert updated["updated_at"]


def test_activate_candidate_creates_memory_item_and_updates_status(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    created = create_candidates(settings, [_sample_candidate()])
    candidate_id = created.created[0]

    result = activate_candidate(settings, candidate_id)

    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        candidate = conn.execute(
            select(memory_candidates).where(memory_candidates.c.id == candidate_id)
        ).mappings().one()
        memory_row = conn.execute(
            select(memory_items).where(memory_items.c.id == result.memory_item_id)
        ).mappings().one()

    assert candidate["candidate_status"] == "activated"
    assert memory_row["status"] == "active"
    assert memory_row["memory_type"] == "trading_rule"
    assert result.memory_item_id


def test_activate_candidate_copies_evidence_refs_and_symbols(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    created = create_candidates(settings, [_sample_candidate()])
    result = activate_candidate(settings, created.created[0])
    from app.modules.memory_service import get_memory_item

    memory = get_memory_item(settings, result.memory_item_id)
    assert memory is not None
    assert memory["symbols_json"] == ["AAPL"]
    assert memory["evidence_refs_json"] == [{"ref_type": "document_section", "ref_id": "sec-1"}]


def test_reject_candidate_updates_status(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    created = create_candidates(settings, [_sample_candidate()])
    payload = reject_candidate(settings, created.created[0])
    assert payload["candidate_status"] == "rejected"


def test_merge_candidate_extends_target_evidence_refs(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    target = create_memory_item(
        settings,
        {
            "memory_type": "trading_rule",
            "title": "Existing memory",
            "evidence_refs_json": [{"ref_type": "document_section", "ref_id": "existing"}],
        },
    )
    created = create_candidates(
        settings,
        [
            _sample_candidate(
                evidence_refs_json=[
                    {"ref_type": "document_section", "ref_id": "existing"},
                    {"ref_type": "document_section", "ref_id": "new-ref"},
                ]
            )
        ],
    )
    merge_candidate(settings, created.created[0], target["id"])

    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        candidate = conn.execute(
            select(memory_candidates).where(memory_candidates.c.id == created.created[0])
        ).mappings().one()
        memory_row = conn.execute(
            select(memory_items).where(memory_items.c.id == target["id"])
        ).mappings().one()

    assert candidate["candidate_status"] == "merged"
    refs = json.loads(memory_row["evidence_refs_json"])
    assert {"ref_type": "document_section", "ref_id": "existing"} in refs
    assert {"ref_type": "document_section", "ref_id": "new-ref"} in refs


def test_deprecate_memory_item_sets_status_deprecated(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    item = create_memory_item(
        settings,
        {"memory_type": "trading_rule", "title": "To deprecate"},
    )
    deprecated = deprecate_memory_item(settings, item["id"])
    assert deprecated is not None
    assert deprecated["status"] == "deprecated"


def test_batch_process_activate_returns_correct_counts(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    created = create_candidates(
        settings,
        [
            _sample_candidate(title="Rule one"),
            _sample_candidate(title="Rule two"),
        ],
    )
    result = batch_process(settings, created.created, "activate")
    assert len(result.activated) == 2
    assert result.rejected == []
    assert result.skipped == []


def test_batch_process_skips_conflicted_candidates(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    conflicted = create_candidates(
        settings,
        [_sample_candidate(title="Conflicted candidate")],
    )
    normal = create_candidates(settings, [_sample_candidate(title="Normal candidate")])
    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        conn.execute(
            memory_candidates.update()
            .where(memory_candidates.c.id == conflicted.created[0])
            .values(review_flags_json=json.dumps(["possible_conflict"]))
        )
    result = batch_process(settings, conflicted.created + normal.created, "activate")
    assert len(result.activated) == 1
    assert normal.created[0] in result.activated
    assert conflicted.created[0] in result.skipped


def test_activate_candidate_marks_possible_conflict_on_overlap(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    create_memory_item(
        settings,
        {
            "memory_type": "trading_rule",
            "title": "Existing long rule",
            "rule_text": "Buy AAPL long on breakout",
            "symbols_json": ["AAPL"],
            "tags_json": ["breakout"],
            "market_scope": "us_equities",
        },
    )
    created = create_candidates(
        settings,
        [
            _sample_candidate(
                title="Conflicting short rule",
                normalized_rule="Sell AAPL short on breakdown",
                summary="Short AAPL on breakdown",
                market_scope="us_equities",
            )
        ],
    )
    result = activate_candidate(settings, created.created[0])
    assert result.conflicts_found

    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        candidate = conn.execute(
            select(memory_candidates).where(memory_candidates.c.id == created.created[0])
        ).mappings().one()
    flags = json.loads(candidate["review_flags_json"])
    assert "possible_conflict" in flags


def test_reject_and_merge_require_pending_candidate(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    target = create_memory_item(
        settings,
        {"memory_type": "trading_rule", "title": "Merge target"},
    )
    created = create_candidates(settings, [_sample_candidate()])
    candidate_id = created.created[0]
    activate_candidate(settings, candidate_id)

    with pytest.raises(ValueError, match="candidate already processed"):
        reject_candidate(settings, candidate_id)
    with pytest.raises(ValueError, match="candidate already processed"):
        merge_candidate(settings, candidate_id, target["id"])


def test_list_memory_items_symbol_filter_exact_match(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    create_memory_item(
        settings,
        {"memory_type": "trading_rule", "title": "AAPL rule", "symbols_json": ["AAPL"]},
    )
    create_memory_item(
        settings,
        {"memory_type": "trading_rule", "title": "TSLA rule", "symbols_json": ["TSLA"]},
    )

    assert len(list_memory_items(settings, symbol="AAPL")) == 1
    assert list_memory_items(settings, symbol="AP") == []


def test_audit_events_written_for_transitions(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    created = create_candidates(settings, [_sample_candidate()])
    candidate_id = created.created[0]
    activate_candidate(settings, candidate_id)

    created2 = create_candidates(settings, [_sample_candidate(title="Reject me")])
    reject_candidate(settings, created2.created[0])

    target = create_memory_item(
        settings,
        {"memory_type": "trading_rule", "title": "Merge target"},
    )
    created3 = create_candidates(settings, [_sample_candidate(title="Merge me")])
    merge_candidate(settings, created3.created[0], target["id"])

    item = create_memory_item(
        settings,
        {"memory_type": "trading_rule", "title": "Deprecate me"},
    )
    deprecate_memory_item(settings, item["id"])

    events = _event_types(settings)
    assert "memory_candidate_activated" in events
    assert "memory_candidate_rejected" in events
    assert "memory_candidate_merged" in events
    assert "memory_item_deprecated" in events


def test_mark_conflict_sets_both_items_conflicted(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    left = create_memory_item(
        settings,
        {"memory_type": "trading_rule", "title": "Left"},
    )
    right = create_memory_item(
        settings,
        {"memory_type": "trading_rule", "title": "Right"},
    )
    mark_conflict(settings, left["id"], right["id"])

    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        rows = conn.execute(select(memory_items)).mappings().all()
    statuses = {row["id"]: row["status"] for row in rows}
    assert statuses[left["id"]] == "conflicted"
    assert statuses[right["id"]] == "conflicted"
    assert "memory_conflict_marked" in _event_types(settings)
