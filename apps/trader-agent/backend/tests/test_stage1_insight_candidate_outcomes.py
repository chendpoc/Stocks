from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.time import utc_now_iso
from app.intel.db.connection import get_intel_engine, set_intel_db_path
from app.main import create_app

STAGE1_PREFIX = "/api/intel/stage1"


def _settings(tmp_repo: Path) -> Settings:
    return Settings(
        repo_root=tmp_repo,
        data_dir=tmp_repo / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
    )


def _client(tmp_repo: Path) -> TestClient:
    set_intel_db_path(tmp_repo / "data" / "market_intel.db")
    return TestClient(create_app(settings=_settings(tmp_repo)))


def test_insight_candidate_outcome_schedule_label_and_due(tmp_path: Path) -> None:
    """Verify the full lifecycle: schedule -> due -> label -> list -> get."""
    client = _client(tmp_path / "repo")
    insight_id = "ins-oco-1"

    # Create an insight candidate first (foreign key reference).
    insight_payload = {
        "insight_id": insight_id,
        "run_id": "run-oco",
        "symbols_json": ["TSLA"],
        "window_start": "2026-06-01",
        "window_end": "2026-06-03",
        "thesis": "momentum cluster",
        "evidence_refs_json": [{"ref": "news-1"}],
        "candidate_json": {"pattern": "breakout"},
    }
    insight = client.post(f"{STAGE1_PREFIX}/insight-candidates", json=insight_payload)
    assert insight.status_code == 200

    now = utc_now_iso()

    # Schedule
    schedule = client.post(
        f"{STAGE1_PREFIX}/insight-candidate-outcomes/schedule",
        json={
            "outcomes": [
                {
                    "insight_id": insight_id,
                    "symbol": "TSLA",
                    "horizon": "2m",
                    "evidence_refs_json": [{"ref": "ev-1"}],
                    "reason_codes_json": ["candidate_supported"],
                    "outcome_json": {"note": "test"},
                }
            ]
        },
    )
    assert schedule.status_code == 200
    created = schedule.json()["items"][0]
    outcome_id = created["outcome_id"]
    assert created["status"] == "pending"
    assert created["horizon"] == "2m"
    assert created["scheduled_at"] is not None
    assert created["due_at"] is not None
    # due_at must be after scheduled_at
    assert created["due_at"] > now

    # Schedule same idempotent
    dup = client.post(
        f"{STAGE1_PREFIX}/insight-candidate-outcomes/schedule",
        json={
            "outcomes": [
                {
                    "insight_id": insight_id,
                    "symbol": "TSLA",
                    "horizon": "2m",
                }
            ]
        },
    )
    assert dup.status_code == 200

    # Schedule conflict (different horizon → new row)
    schedule_5m = client.post(
        f"{STAGE1_PREFIX}/insight-candidate-outcomes/schedule",
        json={
            "outcomes": [
                {
                    "insight_id": insight_id,
                    "symbol": "TSLA",
                    "horizon": "5m",
                }
            ]
        },
    )
    assert schedule_5m.status_code == 200
    assert schedule_5m.json()["count"] == 1

    # Due list
    due = client.get(
        f"{STAGE1_PREFIX}/insight-candidate-outcomes/due",
        params={"now": now, "symbol": "TSLA"},
    )
    assert due.status_code == 200
    assert due.json()["count"] >= 2

    # Label
    labeled = client.post(
        f"{STAGE1_PREFIX}/insight-candidate-outcomes/{outcome_id}/label",
        json={
            "status": "labeled",
            "normalized_label": "hit",
            "reason_codes_json": ["target_hit"],
            "outcome_json": {"note": "labeled"},
        },
    )
    assert labeled.status_code == 200
    assert labeled.json()["status"] == "labeled"
    assert labeled.json()["normalized_label"] == "hit"
    assert labeled.json()["labeled_at"] is not None

    # Relabel blocked
    relabel = client.post(
        f"{STAGE1_PREFIX}/insight-candidate-outcomes/{outcome_id}/label",
        json={"status": "skipped"},
    )
    assert relabel.status_code == 409

    # List filtered
    listed = client.get(
        f"{STAGE1_PREFIX}/insight-candidate-outcomes",
        params={"insight_id": insight_id, "status": "labeled"},
    )
    assert listed.status_code == 200
    assert listed.json()["count"] == 1

    # Get single
    detail = client.get(
        f"{STAGE1_PREFIX}/insight-candidate-outcomes/{outcome_id}",
    )
    assert detail.status_code == 200
    assert detail.json()["outcome_id"] == outcome_id
    assert detail.json()["normalized_label"] == "hit"

    # Get not found
    not_found = client.get(
        f"{STAGE1_PREFIX}/insight-candidate-outcomes/nonexistent-id",
    )
    assert not_found.status_code == 404


def test_insight_candidate_outcome_rejects_invalid_horizon(tmp_path: Path) -> None:
    """Horizons must match the whitelist: 1m, 2m, 5m, 30m, 1h, 2h, 4h."""
    client = _client(tmp_path / "repo")
    insight_id = "ins-horizon-reject"

    client.post(
        f"{STAGE1_PREFIX}/insight-candidates",
        json={
            "insight_id": insight_id,
            "run_id": "run-hr",
            "symbols_json": ["TSLA"],
            "candidate_json": {},
        },
    )

    for bad_horizon in ("30d", "90d", "1w", "3h", "invalid"):
        resp = client.post(
            f"{STAGE1_PREFIX}/insight-candidate-outcomes/schedule",
            json={
                "outcomes": [
                    {
                        "insight_id": insight_id,
                        "symbol": "TSLA",
                        "horizon": bad_horizon,
                    }
                ]
            },
        )
        assert resp.status_code == 422, f"horizon {bad_horizon} should be rejected"


def test_insight_candidate_outcome_all_valid_horizons_accepted(tmp_path: Path) -> None:
    """All whitelisted horizons should be accepted."""
    client = _client(tmp_path / "repo")
    insight_id = "ins-valid-horizons"

    client.post(
        f"{STAGE1_PREFIX}/insight-candidates",
        json={
            "insight_id": insight_id,
            "run_id": "run-vh",
            "symbols_json": ["TSLA"],
            "candidate_json": {},
        },
    )

    valid_horizons = ["1m", "2m", "5m", "30m", "1h", "2h", "4h"]
    for horizon in valid_horizons:
        resp = client.post(
            f"{STAGE1_PREFIX}/insight-candidate-outcomes/schedule",
            json={
                "outcomes": [
                    {
                        "insight_id": insight_id,
                        "symbol": "TSLA",
                        "horizon": horizon,
                    }
                ]
            },
        )
        assert resp.status_code == 200, f"horizon {horizon} should be accepted: {resp.text}"


def test_insight_candidate_outcome_skipped_and_failed_label(tmp_path: Path) -> None:
    """Skipped and failed are valid final statuses."""
    client = _client(tmp_path / "repo")
    insight_id = "ins-skip-fail"

    client.post(
        f"{STAGE1_PREFIX}/insight-candidates",
        json={
            "insight_id": insight_id,
            "run_id": "run-sf",
            "symbols_json": ["TSLA"],
            "candidate_json": {},
        },
    )

    schedule = client.post(
        f"{STAGE1_PREFIX}/insight-candidate-outcomes/schedule",
        json={
            "outcomes": [
                {
                    "insight_id": insight_id,
                    "symbol": "TSLA",
                    "horizon": "1m",
                },
                {
                    "insight_id": insight_id,
                    "symbol": "TSLA",
                    "horizon": "5m",
                },
                {
                    "insight_id": insight_id,
                    "symbol": "TSLA",
                    "horizon": "30m",
                },
            ]
        },
    )
    assert schedule.status_code == 200
    items = schedule.json()["items"]
    assert len(items) == 3

    outcome_ids = [item["outcome_id"] for item in items]

    # Label: labeled
    labeled = client.post(
        f"{STAGE1_PREFIX}/insight-candidate-outcomes/{outcome_ids[0]}/label",
        json={"status": "labeled", "normalized_label": "hit"},
    )
    assert labeled.status_code == 200

    # Label: skipped
    skipped = client.post(
        f"{STAGE1_PREFIX}/insight-candidate-outcomes/{outcome_ids[1]}/label",
        json={"status": "skipped", "normalized_label": "insufficient_data"},
    )
    assert skipped.status_code == 200

    # Label: failed
    failed = client.post(
        f"{STAGE1_PREFIX}/insight-candidate-outcomes/{outcome_ids[2]}/label",
        json={"status": "failed", "normalized_label": "invalid"},
    )
    assert failed.status_code == 200

    # Verify all three statuses
    listed = client.get(
        f"{STAGE1_PREFIX}/insight-candidate-outcomes",
        params={"insight_id": insight_id},
    )
    assert listed.status_code == 200
    statuses = {item["status"] for item in listed.json()["items"]}
    assert statuses == {"labeled", "skipped", "failed"}


def test_insight_candidate_outcome_label_rejects_invalid_status(tmp_path: Path) -> None:
    """Only labeled/skipped/failed are accepted as final label statuses."""
    client = _client(tmp_path / "repo")
    insight_id = "ins-bad-status"

    client.post(
        f"{STAGE1_PREFIX}/insight-candidates",
        json={
            "insight_id": insight_id,
            "run_id": "run-bs",
            "symbols_json": ["TSLA"],
            "candidate_json": {},
        },
    )

    schedule = client.post(
        f"{STAGE1_PREFIX}/insight-candidate-outcomes/schedule",
        json={
            "outcomes": [
                {
                    "insight_id": insight_id,
                    "symbol": "TSLA",
                    "horizon": "2m",
                }
            ]
        },
    )
    outcome_id = schedule.json()["items"][0]["outcome_id"]

    resp = client.post(
        f"{STAGE1_PREFIX}/insight-candidate-outcomes/{outcome_id}/label",
        json={"status": "active"},
    )
    assert resp.status_code == 422


def test_insight_candidate_outcome_no_update_delete_endpoints(tmp_path: Path) -> None:
    """v1 does not add update or delete endpoints."""
    client = _client(tmp_path / "repo")

    put_resp = client.put(
        f"{STAGE1_PREFIX}/insight-candidate-outcomes/some-id",
        json={"status": "labeled"},
    )
    assert put_resp.status_code in (404, 405)

    delete_resp = client.delete(
        f"{STAGE1_PREFIX}/insight-candidate-outcomes/some-id",
    )
    assert delete_resp.status_code in (404, 405)
