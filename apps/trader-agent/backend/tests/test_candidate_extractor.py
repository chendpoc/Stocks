from __future__ import annotations

from pathlib import Path

from sqlalchemy import select

from app.core.config import Settings
from app.db.migrations import bootstrap_database
from app.db.models import document_sections
from app.db.session import create_sqlite_engine
from app.modules.artifact_catalog import build_artifact_catalog
from app.modules.candidate_extractor import extract_candidates_from_sections
from app.modules.evidence_ref import EvidenceRef
from app.modules.markdown_section_indexer import index_markdown_sections


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _settings(tmp_repo: Path) -> Settings:
    return Settings(
        repo_root=tmp_repo,
        data_dir=tmp_repo / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
        rulepack_path=_repo_root()
        / "apps"
        / "trader-agent"
        / "shared"
        / "rulepacks"
        / "v0_1_0.yaml",
    )


def _catalog_and_index(settings: Settings):
    build_artifact_catalog(settings)
    return index_markdown_sections(settings)


def _write_summary_md(
    tmp_repo: Path,
    *,
    body: str,
    rel_path: str = "docs/summaries/2026-05/summary.md",
) -> None:
    md_path = tmp_repo / rel_path
    md_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.write_text(body, encoding="utf-8")


def _sections(settings: Settings) -> list[dict]:
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        rows = conn.execute(select(document_sections)).mappings().all()
    return [dict(row) for row in rows]


def test_rule_based_extracts_core_theory_as_market_mechanism(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    _write_summary_md(
        tmp_repo,
        body=(
            "# 2026-05-15 每日总结\n"
            "intro\n"
            "## 核心理论\n"
            "market mechanism theory content\n"
        ),
    )

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    candidates = extract_candidates_from_sections(settings)
    assert len(candidates) == 1
    assert candidates[0]["candidate_type"] == "market_mechanism"
    assert "核心理论" in candidates[0]["title"]


def test_rule_based_extracts_tags_from_section(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    _write_summary_md(
        tmp_repo,
        body=(
            "# 2026-05-15 每日总结\n"
            "## 核心理论\n"
            "theory with #breakout tag\n"
        ),
    )

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    candidates = extract_candidates_from_sections(settings)
    assert len(candidates) == 1
    assert "breakout" in candidates[0]["tags_json"]


def test_rule_based_extracts_entry_condition_as_trading_rule(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    _write_summary_md(
        tmp_repo,
        body=(
            "# 2026-05-16 每日总结\n"
            "## 入场条件\n"
            "enter when breakout confirmed\n"
        ),
    )

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    candidates = extract_candidates_from_sections(settings)
    assert len(candidates) == 1
    assert candidates[0]["candidate_type"] == "trading_rule"
    assert "入场条件" in candidates[0]["title"]


def test_rule_based_filters_by_source_date_range(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    _write_summary_md(
        tmp_repo,
        body="# 2026-05-10 每日总结\n## 核心理论\nold theory\n",
        rel_path="docs/summaries/2026-05/2026-05-10.md",
    )
    _write_summary_md(
        tmp_repo,
        body="# 2026-05-20 每日总结\n## 核心理论\nnew theory\n",
        rel_path="docs/summaries/2026-05/2026-05-20.md",
    )

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    candidates = extract_candidates_from_sections(
        settings,
        source_date_from="2026-05-15",
        source_date_to="2026-05-25",
    )
    assert len(candidates) == 1
    assert "2026-05-20" in candidates[0]["title"]


def test_rule_based_respects_memory_eligible_zero(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    prd_path = tmp_repo / "docs" / "research-agent" / "target-system" / "prd.md"
    prd_path.parent.mkdir(parents=True)
    prd_path.write_text("# PRD\n## 核心理论\nshould not extract\n", encoding="utf-8")

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    candidates = extract_candidates_from_sections(settings)
    assert candidates == []


def test_generated_candidate_dict_has_required_keys(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    _write_summary_md(
        tmp_repo,
        body="# 2026-05-17 每日总结\n## 风控规则\nrisk management rules\n",
    )

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    candidate = extract_candidates_from_sections(settings)[0]
    required_keys = {
        "candidate_type",
        "title",
        "summary",
        "normalized_rule",
        "symbols_json",
        "confidence",
        "candidate_status",
        "created_by",
        "evidence_refs_json",
    }
    assert required_keys <= candidate.keys()
    assert candidate["created_by"] == "rule_based"
    assert candidate["candidate_status"] == "candidate"


def test_evidence_ref_in_candidate_roundtrips(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    _write_summary_md(
        tmp_repo,
        body="# 2026-05-18 每日总结\n## 失效条件\ninvalidation rules\n",
    )

    settings = _settings(tmp_repo)
    bootstrap_database(settings)
    _catalog_and_index(settings)

    candidate = extract_candidates_from_sections(settings)[0]
    ref_dict = candidate["evidence_refs_json"][0]
    ref = EvidenceRef.from_dict(ref_dict)
    roundtrip = ref.as_dict()
    assert roundtrip["ref_type"] == "document_section"
    assert roundtrip["section_key"]
    assert roundtrip["text_digest"]

    section = next(row for row in _sections(settings) if row["id"] == ref.ref_id)
    assert section["section_key"] == roundtrip["section_key"]
