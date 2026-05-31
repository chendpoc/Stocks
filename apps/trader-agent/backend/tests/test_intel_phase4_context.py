from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import Settings
from app.core.time import utc_now_iso
from app.intel.db.connection import set_intel_db_path
from app.intel.ingestion.market_data import Bar, _insert_bars
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


def _seed_bars(tmp_repo: Path, symbol: str, closes: list[float]) -> None:
    from app.intel.db.connection import get_intel_engine

    engine = get_intel_engine(_settings(tmp_repo))
    bars = []
    for idx, close in enumerate(closes):
        bars.append(
            Bar(
                symbol=symbol,
                timeframe="1d",
                ts=f"2026-05-{idx + 1:02d}T00:00:00",
                open=close,
                high=close + 1,
                low=close - 1,
                close=close,
                volume=1_000_000 + idx * 10_000,
                vwap=close,
                source="test",
            )
        )
    _insert_bars(engine, bars)


def test_context_build_and_signal_scan(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    tmp_repo.mkdir()
    client = _client(tmp_repo)

    _seed_bars(tmp_repo, "TSLA", [100, 101, 102, 103, 104, 105, 106, 107, 108, 109])
    _seed_bars(tmp_repo, "QQQ", [400, 401, 402, 403, 404, 405, 406, 407, 408, 409])

    scan_resp = client.post("/api/intel/signals/scan")
    assert scan_resp.status_code == 200
    assert "signal_count" in scan_resp.json()

    ctx_resp = client.post(
        "/api/intel/context/build",
        json={
            "symbols": ["TSLA"],
            "taskType": "signal_explanation",
            "query": "TSLA",
        },
    )
    assert ctx_resp.status_code == 200
    body = ctx_resp.json()
    assert "market_data" in body
    assert "TSLA" in body["market_data"]
    assert "benchmark" in body
    assert "signals" in body
    assert "patterns" in body
    assert "lessons" in body


def test_event_and_hypothesis_flow(tmp_path: Path) -> None:
    tmp_repo = tmp_path / "repo"
    tmp_repo.mkdir()
    client = _client(tmp_repo)

    from app.intel.db.connection import get_intel_engine

    engine = get_intel_engine(_settings(tmp_repo))
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO signals
                (signal_id, ts, symbol, signal_type, raw_description, severity, status)
                VALUES ('TSLA_2026_05_30_10_higher_low_candidate', :ts, 'TSLA',
                        'higher_low_candidate', 'test signal', 0.7, 'new')
                """
            ),
            {"ts": utc_now_iso()},
        )

    event_resp = client.post(
        "/api/intel/events",
        json={
            "ts": utc_now_iso(),
            "event_type": "policy",
            "title": "Test event",
            "raw_text": "macro headline",
            "affected_symbols": ["TSLA"],
        },
    )
    assert event_resp.status_code == 200

    hypo_resp = client.post(
        "/api/intel/hypotheses",
        json={
            "signal_id": "TSLA_2026_05_30_10_higher_low_candidate",
            "claim": "TSLA may hold support vs QQQ benchmark",
            "professional_explanation": "Relative strength vs QQQ with higher low structure",
            "plain_language_explanation": "TSLA looks stronger than the market",
            "evidence_for": ["Higher low"],
            "evidence_against": [],
            "reasoning_gap": "No direct counter evidence found; logic follows price structure vs QQQ",
            "missing_evidence": ["Volume confirmation"],
            "confidence": 0.6,
            "tradability": "watchlist",
            "invalidation_condition": "Break below prior low on volume",
            "predictions": [
                {
                    "window": "3D",
                    "expected_outcome": "Hold above support",
                    "invalid_if": "跌 below support",
                }
            ],
        },
    )
    assert hypo_resp.status_code == 200
    assert "hypothesis_id" in hypo_resp.json()

    with engine.connect() as conn:
        pred = conn.execute(
            text("SELECT reference_price FROM predictions LIMIT 1")
        ).fetchone()
    assert pred is not None
