from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.core.config import Settings
from app.core.time import utc_now_iso
from app.db.migrations import bootstrap_database
from app.modules.context_selector import select_context
from app.modules.memory_service import create_memory_item


def _settings(tmp_path: Path) -> Settings:
    return Settings(
        repo_root=tmp_path,
        data_dir=tmp_path / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
    )


def _seed(
    settings: Settings,
    *,
    title: str = "Test memory",
    confirm: bool = True,
    **fields,
) -> dict:
    payload = {
        "memory_type": "trading_rule",
        "title": title,
        "confidence": 0.8,
        "status": "active",
    }
    payload.update(fields)
    return create_memory_item(settings, payload, confirm=confirm)


def test_selects_active_matching_symbol(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    created = _seed(
        settings,
        title="SPY rule",
        symbols_json=["SPY"],
        tags_json=["macro"],
    )

    result = select_context(
        settings,
        task_type="signal_explanation",
        symbols=["SPY"],
    )

    assert len(result.memories) == 1
    assert result.memories[0].memory_id == created["id"]
    assert "SPY" in result.memories[0].symbols


def test_excludes_deprecated_and_conflicted(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    active = _seed(settings, title="Active", symbols_json=["AAA"])
    _seed(settings, title="Deprecated", symbols_json=["BBB"], status="deprecated")
    _seed(settings, title="Conflicted", symbols_json=["CCC"], status="conflicted")

    result = select_context(
        settings,
        task_type="signal_explanation",
        symbols=["AAA", "BBB", "CCC"],
    )

    assert len(result.memories) == 1
    assert result.memories[0].memory_id == active["id"]


def test_excludes_low_confidence(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    low = _seed(settings, title="Low", symbols_json=["LOW"], confidence=0.3)
    borderline = _seed(settings, title="Borderline", symbols_json=["MID"], confidence=0.5)
    high = _seed(settings, title="High", symbols_json=["HIGH"], confidence=0.7)

    result = select_context(
        settings,
        task_type="signal_explanation",
        symbols=["LOW", "MID", "HIGH"],
    )

    selected_ids = {memory.memory_id for memory in result.memories}
    assert low["id"] not in selected_ids
    assert borderline["id"] in selected_ids
    assert high["id"] in selected_ids


def test_respects_max_memories(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    for index in range(10):
        _seed(
            settings,
            title=f"Rule {index}",
            symbols_json=[f"SYM{index}"],
            tags_json=[f"tag{index}"],
        )

    result = select_context(
        settings,
        task_type="signal_explanation",
        symbols=[f"SYM{index}" for index in range(10)],
        max_memories=3,
    )

    assert len(result.memories) <= 3


def test_respects_total_chars(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    for index in range(5):
        _seed(
            settings,
            title=f"Long rule {index}",
            symbols_json=[f"CHAR{index}"],
            rule_text="x" * 700,
            summary="y" * 700,
        )

    result = select_context(
        settings,
        task_type="signal_explanation",
        symbols=[f"CHAR{index}" for index in range(5)],
        max_memories=5,
        max_total_chars=1200,
    )

    assert result.total_chars <= 1200


def test_scores_symbol_match_above_scope_match(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    scope_only = _seed(
        settings,
        title="Scope only",
        market_scope="US",
        memory_type="trading_rule",
        tags_json=["shared"],
    )
    symbol_match = _seed(
        settings,
        title="Symbol match",
        symbols_json=["SPY"],
        market_scope="US",
        memory_type="trading_rule",
        tags_json=["shared"],
    )

    result = select_context(
        settings,
        task_type="signal_explanation",
        symbols=["SPY"],
        tags=["shared"],
        market_scope="US",
    )

    assert len(result.memories) == 2
    assert result.memories[0].memory_id == symbol_match["id"]
    assert result.memories[0].relevance_score > result.memories[1].relevance_score
    assert result.memories[1].memory_id == scope_only["id"]


def test_returns_empty_when_no_match(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    _seed(
        settings,
        title="Existing",
        symbols_json=["SPY"],
        memory_type="source_pattern_summary",
    )

    result = select_context(
        settings,
        task_type="signal_explanation",
        symbols=["ZZZZ"],
    )

    assert result.memories == []
    assert result.total_chars == 0


def test_task_type_preference(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    trading = _seed(
        settings,
        title="Trading rule",
        symbols_json=["QQQ"],
        memory_type="trading_rule",
    )
    mechanism = _seed(
        settings,
        title="Mechanism",
        symbols_json=["QQQ"],
        memory_type="market_mechanism",
    )

    result = select_context(
        settings,
        task_type="market_intent_explanation",
        symbols=["QQQ"],
    )

    assert len(result.memories) == 2
    assert result.memories[0].memory_id == mechanism["id"]
    assert result.memories[0].relevance_score > result.memories[1].relevance_score
    assert result.memories[1].memory_id == trading["id"]


def test_excludes_expired_valid_until(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    expired = _seed(
        settings,
        title="Expired",
        symbols_json=["EXP"],
        valid_until="2020-01-01T00:00:00+00:00",
    )
    active = _seed(
        settings,
        title="Active",
        symbols_json=["ACT"],
        valid_until=(datetime.now(UTC) + timedelta(days=30)).isoformat(),
    )

    result = select_context(
        settings,
        task_type="signal_explanation",
        symbols=["EXP", "ACT"],
    )

    selected_ids = {memory.memory_id for memory in result.memories}
    assert expired["id"] not in selected_ids
    assert active["id"] in selected_ids
    assert expired["id"] not in result.excluded_reasons
    assert result.pool_count == 1


def test_excludes_no_overlap_via_sql_prefilter(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    unmatched = _seed(
        settings,
        title="Unrelated",
        symbols_json=["OTHER"],
        tags_json=["unrelated"],
        memory_type="source_pattern_summary",
    )

    result = select_context(
        settings,
        task_type="signal_explanation",
        symbols=["NOMATCH"],
        tags=["different"],
        market_scope="EU",
    )

    assert result.memories == []
    assert result.excluded_reasons[unmatched["id"]] == "no_overlap"
    assert result.pool_count == 1
    assert result.excluded_count == 1


def test_recency_bonus(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    recent = _seed(
        settings,
        title="Recent",
        symbols_json=["REC"],
        last_reviewed_at=utc_now_iso(),
    )
    stale = _seed(
        settings,
        title="Stale",
        symbols_json=["REC"],
        last_reviewed_at=(datetime.now(UTC) - timedelta(days=60)).isoformat(),
    )

    result = select_context(
        settings,
        task_type="signal_explanation",
        symbols=["REC"],
    )

    assert len(result.memories) == 2
    assert result.memories[0].memory_id == recent["id"]
    assert result.memories[0].relevance_score == result.memories[1].relevance_score + 5


def test_evidence_bonus(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    few_refs = _seed(
        settings,
        title="Few refs",
        symbols_json=["EVD"],
        evidence_refs_json=[{"ref_type": "document_section", "ref_id": "a"}],
    )
    many_refs = _seed(
        settings,
        title="Many refs",
        symbols_json=["EVD"],
        evidence_refs_json=[
            {"ref_type": "document_section", "ref_id": "a"},
            {"ref_type": "document_section", "ref_id": "b"},
            {"ref_type": "document_section", "ref_id": "c"},
        ],
    )

    result = select_context(
        settings,
        task_type="signal_explanation",
        symbols=["EVD"],
    )

    assert len(result.memories) == 2
    assert result.memories[0].memory_id == many_refs["id"]
    assert result.memories[0].relevance_score == result.memories[1].relevance_score + 5


def test_heading_path_from_evidence_ref(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    _seed(
        settings,
        title="With heading",
        symbols_json=["HDR"],
        evidence_refs_json=[
            {
                "ref_type": "image_artifact",
                "ref_id": "img-1",
                "artifact_id": "art-1",
                "artifact_path": "images/x.png",
            },
            {
                "ref_type": "document_section",
                "ref_id": "sec-1",
                "artifact_id": "art-2",
                "artifact_path": "docs/summary.md",
                "heading_path": "2026-05-07 每日总结 > 仓位/操作策略",
            },
        ],
    )

    result = select_context(
        settings,
        task_type="signal_explanation",
        symbols=["HDR"],
    )

    assert result.memories[0].heading_path == "2026-05-07 每日总结 > 仓位/操作策略"


def test_source_date_from_evidence_ref(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    created = _seed(
        settings,
        title="With source date",
        symbols_json=["DATE"],
        evidence_refs_json=[
            {
                "ref_type": "document_section",
                "ref_id": "sec-1",
                "artifact_id": "art-1",
                "artifact_path": "docs/summary.md",
                "source_date": "2026-05-07",
            }
        ],
    )

    result = select_context(
        settings,
        task_type="signal_explanation",
        symbols=["DATE"],
    )

    assert result.memories[0].source_date == "2026-05-07"
    assert result.memories[0].memory_id == created["id"]
