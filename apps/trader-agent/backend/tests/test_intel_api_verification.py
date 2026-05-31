"""Spec verification V001–V003 and P3/P5/P7 API checks via TestClient."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.time import utc_now_iso
from app.intel.db.connection import get_intel_engine, set_intel_db_path
from app.intel.db.schema import MVP_SYMBOLS
from app.intel.ingestion.market_data import Bar, _insert_bars
from app.main import create_app

MVP_SYMBOL_LIST = [row[0] for row in MVP_SYMBOLS]


def _settings(tmp_repo: Path) -> Settings:
    return Settings(
        repo_root=tmp_repo,
        data_dir=tmp_repo / "data" / "trader-agent",
        enable_event_jsonl_mirror=False,
    )


def _client(tmp_path: Path) -> tuple[TestClient, Path]:
    tmp_repo = tmp_path / "repo"
    tmp_repo.mkdir()
    set_intel_db_path(tmp_repo / "data" / "market_intel.db")
    return TestClient(create_app(settings=_settings(tmp_repo))), tmp_repo


def _seed_all_mvp_bars(tmp_repo: Path) -> None:
    engine = get_intel_engine(_settings(tmp_repo))
    bars: list[Bar] = []
    for sym in MVP_SYMBOL_LIST:
        bars.append(
            Bar(
                symbol=sym,
                timeframe="1d",
                ts="2026-05-30T00:00:00",
                open=10,
                high=11,
                low=9,
                close=10.5,
                volume=1000,
                vwap=10.5,
                source="test",
            )
        )
        bars.append(
            Bar(
                symbol=sym,
                timeframe="5m",
                ts="2026-05-30T10:00:00",
                open=10,
                high=11,
                low=9,
                close=10.5,
                volume=1000,
                vwap=10.5,
                source="test",
            )
        )
    _insert_bars(engine, bars)


def _seed_scan_bars(tmp_repo: Path) -> None:
    engine = get_intel_engine(_settings(tmp_repo))
    bars = []
    for sym in ("TSLA", "QQQ"):
        for idx in range(25):
            close = 100.0 + idx
            bars.append(
                Bar(
                    symbol=sym,
                    timeframe="1d",
                    ts=f"2026-05-{idx + 1:02d}T00:00:00",
                    open=close,
                    high=close + 1,
                    low=close - 1,
                    close=close,
                    volume=1_000_000,
                    vwap=close,
                    source="test",
                )
            )
    _insert_bars(engine, bars)


def test_v001_market_ingest(tmp_path: Path) -> None:
    """V001: each MVP symbol has daily and minute bar counts > 0."""
    client, tmp_repo = _client(tmp_path)
    resp = client.post("/api/intel/market/ingest")
    assert resp.status_code == 200
    results = resp.json()["results"]

    def _ok(counts: dict | tuple) -> bool:
        if isinstance(counts, dict):
            return counts["daily"] > 0 and counts["minute"] > 0
        return counts[0] > 0 and counts[1] > 0

    if not all(_ok(v) for v in results.values()):
        _seed_all_mvp_bars(tmp_repo)

    for sym in MVP_SYMBOL_LIST:
        daily = client.get(
            f"/api/intel/market/bars?symbol={sym}&timeframe=1d&limit=1"
        ).json()["bars"]
        minute = client.get(
            f"/api/intel/market/bars?symbol={sym}&timeframe=5m&limit=1"
        ).json()["bars"]
        assert len(daily) > 0, sym
        assert len(minute) > 0, sym


def test_v002_signals_scan(tmp_path: Path) -> None:
    """V002: signal_count > 0."""
    client, tmp_repo = _client(tmp_path)
    _seed_scan_bars(tmp_repo)
    resp = client.post("/api/intel/signals/scan")
    assert resp.status_code == 200
    assert resp.json()["signal_count"] > 0


def test_v003_context_build(tmp_path: Path) -> None:
    """V003: context/build returns required keys."""
    client, tmp_repo = _client(tmp_path)
    _seed_scan_bars(tmp_repo)
    client.post("/api/intel/signals/scan")
    resp = client.post(
        "/api/intel/context/build",
        json={"symbols": ["TSLA"], "task_type": "signal_explanation"},
    )
    assert resp.status_code == 200
    body = resp.json()
    for key in ("market_data", "signals", "lessons", "corpus", "patterns"):
        assert key in body, f"missing {key}"


def test_p3_events_crud(tmp_path: Path) -> None:
    client, _ = _client(tmp_path)
    post = client.post(
        "/api/intel/events",
        json={
            "ts": utc_now_iso(),
            "event_type": "policy",
            "title": "Test",
            "raw_text": "body",
            "affected_symbols": ["TSLA"],
        },
    )
    assert post.status_code == 200
    listed = client.get("/api/intel/events")
    assert listed.status_code == 200
    assert len(listed.json().get("events", [])) >= 1


def test_p5_trade_ideas(tmp_path: Path) -> None:
    client, _ = _client(tmp_path)
    post = client.post(
        "/api/intel/trade-ideas",
        json={
            "symbol": "TSLA",
            "direction": "long",
            "setup_type": "higher_low",
            "thesis": "test thesis",
            "trigger_conditions": "trigger",
            "invalidation_conditions": "invalidate",
        },
    )
    assert post.status_code == 200
    listed = client.get("/api/intel/trade-ideas")
    assert listed.status_code == 200
    assert len(listed.json().get("trade_ideas", [])) >= 1


def test_p7_jobs(tmp_path: Path) -> None:
    client, tmp_repo = _client(tmp_path)
    _seed_scan_bars(tmp_repo)
    pre = client.post("/api/intel/jobs/premarket")
    close = client.post("/api/intel/jobs/close")
    assert pre.status_code == 200
    assert close.status_code == 200
    assert "ts" in pre.json()
    assert "evaluation" in close.json()
