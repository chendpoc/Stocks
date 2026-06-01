from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import Settings
from app.core.time import utc_now_iso
from app.intel.db.connection import get_intel_engine, set_intel_db_path
from app.main import create_app


def _settings(tmp_repo: Path) -> Settings:
    return Settings(
        repo_root=tmp_repo,
        data_dir=tmp_repo / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
    )


def _client(tmp_repo: Path) -> TestClient:
    set_intel_db_path(tmp_repo / "data" / "market_intel.db")
    return TestClient(create_app(settings=_settings(tmp_repo)))


def test_report_cache_hit_and_invalidate_on_new_signal(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    tmp_repo.mkdir()
    client = _client(tmp_repo)
    engine = get_intel_engine(_settings(tmp_repo))
    today = "2026-05-31"
    sym = "TSLA"

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO signals
                (signal_id, ts, symbol, signal_type, raw_description, severity, status)
                VALUES ('sig_v1', '2026-05-31T08:00:00', :symbol, 'test', 'v1', 0.5, 'new')
                """
            ),
            {"symbol": sym},
        )

    check1 = client.post(
        "/api/intel/report/check",
        json={"symbol": sym, "date": today},
    )
    assert check1.status_code == 200
    assert check1.json()["hit"] is False
    lts1 = check1.json()["latest_signal_ts"]

    save = client.post(
        "/api/intel/report/save",
        json={
            "symbol": sym,
            "date": today,
            "latest_signal_ts": lts1,
            "report_json": '{"summary":"cached"}',
        },
    )
    assert save.status_code == 200

    check2 = client.post(
        "/api/intel/report/check",
        json={"symbol": sym, "date": today},
    )
    assert check2.json()["hit"] is True

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO signals
                (signal_id, ts, symbol, signal_type, raw_description, severity, status)
                VALUES ('sig_v2', '2026-05-31T12:00:00', :symbol, 'test', 'v2', 0.6, 'new')
                """
            ),
            {"symbol": sym},
        )

    check3 = client.post(
        "/api/intel/report/check",
        json={"symbol": sym, "date": today},
    )
    assert check3.json()["hit"] is False


def test_report_cache_isolates_dates(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    tmp_repo.mkdir()
    client = _client(tmp_repo)
    sym = "TSLA"

    client.post(
        "/api/intel/report/save",
        json={
            "symbol": sym,
            "date": "2026-05-30",
            "latest_signal_ts": None,
            "report_json": "old",
        },
    )
    hit = client.post(
        "/api/intel/report/check",
        json={"symbol": sym, "date": "2026-05-31"},
    )
    assert hit.json()["hit"] is False
