from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.rule_candidates import router as rule_candidates_router
from app.core.config import Settings
from app.db.migrations import bootstrap_database
from app.db.models import rule_candidates
from app.db.session import create_sqlite_engine
from app.modules.json_row_codec import coerce_json_value

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"
API_PREFIX = "/api/rule-candidates"


def _settings(tmp_path: Path) -> Settings:
    repo_root = Path(__file__).resolve().parents[4]
    return Settings(
        repo_root=repo_root,
        data_dir=tmp_path / "trader-agent-data",
        fixture_data_dir=FIXTURE_DIR,
        rulepack_path=repo_root / "apps" / "trader-agent" / "shared" / "rulepacks" / "v0_1_0.yaml",
        enabled_tool_capabilities=frozenset(
            {
                "market_bars.fixture",
                "market_calendar.fixture",
                "news_events.fixture",
                "filing_events.fixture",
            }
        ),
        enable_event_jsonl_mirror=False,
    )


def _client(tmp_path: Path) -> TestClient:
    settings = _settings(tmp_path)
    bootstrap_database(settings)
    app = FastAPI()
    app.state.settings = settings
    app.include_router(rule_candidates_router)
    return TestClient(app)


def _candidate_payload(*, source: str = "manual", insight_id: str = "ins-t013-1") -> dict:
    payload = {
        "source": source,
        "hypothesis": "Sharp intraday drop can stabilize after forced selling pauses.",
        "symbols": ["TSLA"],
        "trigger_definition": "sharp_drop",
        "entry_condition": "enter_next_bar_for_measurement_only",
        "invalidation": "selling_volume_expands_again",
        "risk_notes": ["local deterministic fixture only"],
    }
    if source == "insight_candidate":
        payload["source_ref"] = {"insight_id": insight_id, "run_id": "run-t013"}
    return payload


def test_create_insight_candidate_source_persists(tmp_path: Path) -> None:
    client = _client(tmp_path)
    response = client.post(API_PREFIX, json=_candidate_payload(source="insight_candidate"))
    assert response.status_code == 200
    candidate_id = response.json()["candidate_id"]

    engine = create_sqlite_engine(_settings(tmp_path))
    with engine.connect() as conn:
        row = conn.execute(
            select(rule_candidates).where(rule_candidates.c.id == candidate_id)
        ).mappings().one()

    assert row["source"] == "insight_candidate"
    assert coerce_json_value(row["source_ref"]) == {
        "insight_id": "ins-t013-1",
        "run_id": "run-t013",
    }


def test_full_api_chain_create_evidence_backtest_advance_report(tmp_path: Path) -> None:
    client = _client(tmp_path)
    create = client.post(API_PREFIX, json=_candidate_payload(source="insight_candidate"))
    assert create.status_code == 200
    candidate_id = create.json()["candidate_id"]

    evidence = client.post(f"{API_PREFIX}/{candidate_id}/evidence-requirements")
    assert evidence.status_code == 200
    assert evidence.json()["candidate_status"] == "backtest_pending"

    backtest = client.post(
        f"{API_PREFIX}/{candidate_id}/lite-backtest",
        json={"start": "2026-05-22", "end": "2026-05-22"},
    )
    assert backtest.status_code == 200
    report_body = backtest.json()
    assert report_body["candidate_status"] == "backtested"
    assert report_body["decision"]

    advance = client.post(
        f"{API_PREFIX}/{candidate_id}/advance",
        json={"decision": report_body["decision"]},
    )
    assert advance.status_code == 200
    assert advance.json()["status"] == report_body["decision"]

    report = client.get(f"{API_PREFIX}/{candidate_id}/lite-backtest-report")
    assert report.status_code == 200
    assert report.json()["id"] == report_body["latest_report_id"]
    assert report.json()["decision"] == report_body["decision"]

    get_candidate = client.get(f"{API_PREFIX}/{candidate_id}")
    assert get_candidate.status_code == 200
    assert get_candidate.json()["status"] == report_body["decision"]


def test_lite_backtest_before_evidence_returns_409(tmp_path: Path) -> None:
    client = _client(tmp_path)
    create = client.post(API_PREFIX, json=_candidate_payload())
    candidate_id = create.json()["candidate_id"]

    backtest = client.post(
        f"{API_PREFIX}/{candidate_id}/lite-backtest",
        json={"start": "2026-05-22", "end": "2026-05-22"},
    )
    assert backtest.status_code == 409
    assert "backtest_pending" in backtest.json()["detail"]


def test_insight_candidate_requires_insight_id(tmp_path: Path) -> None:
    client = _client(tmp_path)
    payload = _candidate_payload(source="insight_candidate")
    payload.pop("source_ref")
    response = client.post(API_PREFIX, json=payload)
    assert response.status_code == 400
    assert "insight_id" in response.json()["detail"]
