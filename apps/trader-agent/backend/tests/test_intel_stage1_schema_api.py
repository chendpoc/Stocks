from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import Settings
from app.core.time import utc_now_iso
from app.intel.db.connection import get_intel_engine, set_intel_db_path
from app.main import create_app
from app.modules._json import loads

STAGE1_PREFIX = "/api/intel/stage1"

FORBIDDEN_CHECKPOINT_COLUMNS = frozenset(
    {
        "checkpoint_id",
        "thread_id",
        "checkpoint_ns",
        "parent_checkpoint_id",
        "checkpoint_json",
        "run_status",
    }
)

STAGE1_TABLES = (
    "context_snapshots",
    "model_decisions",
    "decision_outcomes",
    "insight_candidates",
    "evaluation_reports",
    "weighting_policy_stats",
)


def _settings(tmp_repo: Path) -> Settings:
    return Settings(
        repo_root=tmp_repo,
        data_dir=tmp_repo / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
    )


def _client(tmp_repo: Path) -> TestClient:
    set_intel_db_path(tmp_repo / "data" / "market_intel.db")
    return TestClient(create_app(settings=_settings(tmp_repo)))


def _snapshot_payload(snapshot_id: str = "snap-1", context_hash: str = "hash-abc") -> dict:
    return {
        "snapshot_id": snapshot_id,
        "symbol": "TSLA",
        "asof_ts": "2026-06-01T12:00:00Z",
        "context_version": "v1",
        "items_json": [{"source": "signal", "weight": 1.0}],
        "evidence_refs_json": [{"ref": "sig-1"}],
        "weighting_policy_version": "wp-v1",
        "context_hash": context_hash,
    }


def _decision_payload(
    decision_id: str = "dec-1",
    snapshot_id: str = "snap-1",
    action: str = "watch",
) -> dict:
    return {
        "decision_id": decision_id,
        "run_id": "run-1",
        "snapshot_id": snapshot_id,
        "symbol": "TSLA",
        "model_provider": "deepseek",
        "model_name": "chat",
        "model_version": "stage1-v0",
        "action": action,
        "confidence": 0.7,
        "uncertainty": 0.2,
        "decision_json": {"thesis": "test", "horizons": ["1d"]},
    }


def test_stage1_tables_exist_without_checkpoint_fields(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    tmp_repo.mkdir()
    client = _client(tmp_repo)
    assert client.get("/health").status_code == 200

    engine = get_intel_engine(_settings(tmp_repo))
    with engine.connect() as conn:
        table_names = {
            row[0]
            for row in conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table'")
            ).fetchall()
        }
        for table in STAGE1_TABLES:
            assert table in table_names
            cols = {
                row[1]
                for row in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            }
            assert FORBIDDEN_CHECKPOINT_COLUMNS.isdisjoint(cols)


def test_context_snapshot_idempotent_and_conflict(tmp_path: Path) -> None:
    client = _client(tmp_path / "repo")
    payload = _snapshot_payload()

    first = client.post(f"{STAGE1_PREFIX}/context-snapshots", json=payload)
    assert first.status_code == 200
    assert first.json()["snapshot_id"] == "snap-1"

    second = client.post(f"{STAGE1_PREFIX}/context-snapshots", json=payload)
    assert second.status_code == 200
    assert second.json()["snapshot_id"] == "snap-1"

    conflict = client.post(
        f"{STAGE1_PREFIX}/context-snapshots",
        json={**payload, "items_json": [{"source": "changed"}]},
    )
    assert conflict.status_code == 409

    listed = client.get(f"{STAGE1_PREFIX}/context-snapshots", params={"symbol": "TSLA"})
    assert listed.status_code == 200
    assert listed.json()["count"] >= 1

    detail = client.get(f"{STAGE1_PREFIX}/context-snapshots/snap-1")
    assert detail.status_code == 200
    assert detail.json()["context_hash"] == "hash-abc"


def test_model_decision_human_override_and_conflict(tmp_path: Path) -> None:
    client = _client(tmp_path / "repo")
    client.post(f"{STAGE1_PREFIX}/context-snapshots", json=_snapshot_payload())

    payload = _decision_payload()
    created = client.post(f"{STAGE1_PREFIX}/model-decisions", json=payload)
    assert created.status_code == 200
    assert created.json()["decision_id"] == "dec-1"

    dup = client.post(f"{STAGE1_PREFIX}/model-decisions", json=payload)
    assert dup.status_code == 200

    conflict = client.post(
        f"{STAGE1_PREFIX}/model-decisions",
        json={**payload, "action": "avoid"},
    )
    assert conflict.status_code == 409

    before = client.get(f"{STAGE1_PREFIX}/model-decisions/dec-1").json()
    override = client.post(
        f"{STAGE1_PREFIX}/model-decisions/dec-1/human-overrides",
        json={"override": {"action": "hold"}, "reason": "risk-off"},
    )
    assert override.status_code == 200
    after = override.json()
    assert after["decision_json"] == before["decision_json"]
    overrides = loads(after["human_overrides_json"])
    assert len(overrides) == 1
    assert overrides[0]["override"]["action"] == "hold"

    listed = client.get(
        f"{STAGE1_PREFIX}/model-decisions",
        params={"symbol": "TSLA", "model_version": "stage1-v0"},
    )
    assert listed.status_code == 200
    assert listed.json()["count"] >= 1


def test_decision_outcome_schedule_label_and_due(tmp_path: Path) -> None:
    client = _client(tmp_path / "repo")
    client.post(f"{STAGE1_PREFIX}/context-snapshots", json=_snapshot_payload())
    client.post(f"{STAGE1_PREFIX}/model-decisions", json=_decision_payload())

    now = utc_now_iso()
    schedule = client.post(
        f"{STAGE1_PREFIX}/decision-outcomes/schedule",
        json={
            "outcomes": [
                {
                    "decision_id": "dec-1",
                    "symbol": "TSLA",
                    "horizon": "1d",
                    "path": "model_path",
                    "due_at": now,
                }
            ]
        },
    )
    assert schedule.status_code == 200
    outcome_id = schedule.json()["items"][0]["outcome_id"]
    assert schedule.json()["items"][0]["status"] == "pending"

    dup = client.post(
        f"{STAGE1_PREFIX}/decision-outcomes/schedule",
        json={
            "outcomes": [
                {
                    "decision_id": "dec-1",
                    "symbol": "TSLA",
                    "horizon": "1d",
                    "path": "model_path",
                    "due_at": now,
                }
            ]
        },
    )
    assert dup.status_code == 200

    conflict = client.post(
        f"{STAGE1_PREFIX}/decision-outcomes/schedule",
        json={
            "outcomes": [
                {
                    "decision_id": "dec-1",
                    "symbol": "TSLA",
                    "horizon": "1d",
                    "path": "model_path",
                    "due_at": "2099-01-01T00:00:00Z",
                }
            ]
        },
    )
    assert conflict.status_code == 409

    due = client.get(
        f"{STAGE1_PREFIX}/decision-outcomes/due",
        params={"now": now, "symbol": "TSLA"},
    )
    assert due.status_code == 200
    assert due.json()["count"] >= 1

    labeled = client.post(
        f"{STAGE1_PREFIX}/decision-outcomes/{outcome_id}/label",
        json={
            "status": "labeled",
            "reference_price": 100.0,
            "future_price": 105.0,
            "absolute_return_pct": 5.0,
            "label": "positive",
        },
    )
    assert labeled.status_code == 200
    assert labeled.json()["status"] == "labeled"
    assert labeled.json()["labeled_at"] is not None

    relabel = client.post(
        f"{STAGE1_PREFIX}/decision-outcomes/{outcome_id}/label",
        json={"status": "skipped"},
    )
    assert relabel.status_code == 409

    listed = client.get(
        f"{STAGE1_PREFIX}/decision-outcomes",
        params={"decision_id": "dec-1", "status": "labeled"},
    )
    assert listed.status_code == 200
    assert listed.json()["count"] == 1


def test_insight_evaluation_and_weighting_routes(tmp_path: Path) -> None:
    client = _client(tmp_path / "repo")

    insight_payload = {
        "insight_id": "ins-1",
        "run_id": "run-2",
        "symbols_json": ["TSLA"],
        "window_start": "2026-05-01",
        "window_end": "2026-06-01",
        "thesis": "momentum cluster",
        "evidence_refs_json": [{"ref": "news-1"}],
        "candidate_json": {"pattern": "breakout"},
    }
    insight = client.post(f"{STAGE1_PREFIX}/insight-candidates", json=insight_payload)
    assert insight.status_code == 200

    insight_dup = client.post(f"{STAGE1_PREFIX}/insight-candidates", json=insight_payload)
    assert insight_dup.status_code == 200

    insight_conflict = client.post(
        f"{STAGE1_PREFIX}/insight-candidates",
        json={**insight_payload, "candidate_json": {"pattern": "other"}},
    )
    assert insight_conflict.status_code == 409

    insight_detail = client.get(f"{STAGE1_PREFIX}/insight-candidates/ins-1")
    assert insight_detail.status_code == 200

    insight_list = client.get(
        f"{STAGE1_PREFIX}/insight-candidates",
        params={"symbol": "TSLA", "verification_status": "pending"},
    )
    assert insight_list.status_code == 200
    assert insight_list.json()["count"] >= 1

    report_payload = {
        "report_id": "rep-1",
        "model_version": "stage1-v0",
        "window_start": "2026-05-01",
        "window_end": "2026-06-01",
        "metrics_json": {"accuracy": 0.55},
        "recommendation": "hold",
        "report_json": {"summary": "stable"},
    }
    report = client.post(f"{STAGE1_PREFIX}/evaluation-reports", json=report_payload)
    assert report.status_code == 200

    bad_report = client.post(
        f"{STAGE1_PREFIX}/evaluation-reports",
        json={**report_payload, "report_id": "rep-2", "recommendation": "promote"},
    )
    assert bad_report.status_code == 422

    report_detail = client.get(f"{STAGE1_PREFIX}/evaluation-reports/rep-1")
    assert report_detail.status_code == 200

    report_list = client.get(
        f"{STAGE1_PREFIX}/evaluation-reports",
        params={"model_version": "stage1-v0"},
    )
    assert report_list.status_code == 200

    stats = client.post(
        f"{STAGE1_PREFIX}/weighting-policy-stats",
        json={
            "policy_version": "wp-v1",
            "source_key": "signals",
            "stats_json": {"count": 10, "mean_weight": 0.8},
        },
    )
    assert stats.status_code == 200

    stats_list = client.get(
        f"{STAGE1_PREFIX}/weighting-policy-stats",
        params={"policy_version": "wp-v1"},
    )
    assert stats_list.status_code == 200
    assert stats_list.json()["count"] == 1

    stats_update = client.post(
        f"{STAGE1_PREFIX}/weighting-policy-stats",
        json={
            "policy_version": "wp-v1",
            "source_key": "signals",
            "stats_json": {"count": 12, "mean_weight": 0.75},
        },
    )
    assert stats_update.status_code == 200
    assert stats_update.json()["stats_json"] is not None
