from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.tools.local_adapter import (
    FILING_EVENTS_FIXTURE,
    MARKET_BARS_FIXTURE,
    MARKET_CALENDAR_FIXTURE,
    NEWS_EVENTS_FIXTURE,
)

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"
ALL_CAPABILITIES = {
    MARKET_BARS_FIXTURE,
    MARKET_CALENDAR_FIXTURE,
    NEWS_EVENTS_FIXTURE,
    FILING_EVENTS_FIXTURE,
}


def _settings(tmp_path: Path) -> Settings:
    repo_root = Path(__file__).resolve().parents[4]
    return Settings(
        repo_root=repo_root,
        data_dir=tmp_path / "trader-agent-data",
        fixture_data_dir=FIXTURE_DIR,
        rulepack_path=repo_root / "apps" / "trader-agent" / "shared" / "rulepacks" / "v0_1_0.yaml",
        enabled_tool_capabilities=ALL_CAPABILITIES,
    )


def _client(tmp_path: Path) -> TestClient:
    return TestClient(create_app(settings=_settings(tmp_path)))


def test_default_app_enables_read_only_fixture_capabilities() -> None:
    settings = create_app().state.settings

    assert MARKET_BARS_FIXTURE in settings.enabled_tool_capabilities
    assert MARKET_CALENDAR_FIXTURE in settings.enabled_tool_capabilities
    assert NEWS_EVENTS_FIXTURE in settings.enabled_tool_capabilities
    assert FILING_EVENTS_FIXTURE in settings.enabled_tool_capabilities


def test_agent_status_reports_storage_rulepack_universe_capabilities_and_last_scan(
    tmp_path: Path,
) -> None:
    client = _client(tmp_path)
    client.post(
        "/api/agent/run-symbol/TSLA",
        json={"start": "2026-05-20", "end": "2026-05-22"},
    )

    response = client.get("/api/agent/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["storage"]["status"] == "ok"
    assert payload["rulepack"]["version"] == "0.1.0"
    assert payload["universe"]["size"] >= 1
    assert "TSLA" in payload["universe"]["symbols"]
    assert MARKET_BARS_FIXTURE in payload["enabled_capabilities"]
    assert payload["last_scan_time"] is not None


def test_run_scan_events_runs_and_run_detail_are_derived_from_agent_events(
    tmp_path: Path,
) -> None:
    client = _client(tmp_path)

    run_response = client.post(
        "/api/agent/run-scan",
        json={"start": "2026-05-20", "end": "2026-05-22", "symbols": ["SPY", "XYZ"]},
    )

    assert run_response.status_code == 200
    run_payload = run_response.json()
    assert run_payload["status"] == "completed_with_errors"
    assert run_payload["symbols_scanned"] == ["SPY", "XYZ"]
    assert any(item["status"] == "failed" for item in run_payload["symbol_results"])

    events_response = client.get(
        "/api/agent/events",
        params={
            "module": "runtime_orchestrator",
            "event_type": "runtime_orchestrator.symbol_failed",
            "symbol": "XYZ",
            "status": "failed",
            "run_id": run_payload["run_id"],
            "limit": 5,
        },
    )
    assert events_response.status_code == 200
    events_payload = events_response.json()
    assert len(events_payload["events"]) == 1
    assert events_payload["events"][0]["symbol"] == "XYZ"

    run_detail_before_time_filter = client.get(f"/api/agent/runs/{run_payload['run_id']}").json()
    failed_event = next(
        item
        for item in run_detail_before_time_filter["events"]
        if item["event_type"] == "runtime_orchestrator.symbol_failed"
    )
    time_filtered_response = client.get(
        "/api/agent/events",
        params={
            "start": failed_event["timestamp"],
            "end": failed_event["timestamp"],
            "event_type": "runtime_orchestrator.symbol_failed",
        },
    )
    assert time_filtered_response.status_code == 200
    time_filtered_payload = time_filtered_response.json()
    assert [item["id"] for item in time_filtered_payload["events"]] == [failed_event["id"]]

    runs_response = client.get("/api/agent/runs")
    assert runs_response.status_code == 200
    runs_payload = runs_response.json()
    assert runs_payload["runs"][0]["run_id"] == run_payload["run_id"]
    assert runs_payload["runs"][0]["status"] == "completed_with_errors"

    detail_response = client.get(f"/api/agent/runs/{run_payload['run_id']}")
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()
    assert detail_payload["run"]["run_id"] == run_payload["run_id"]
    assert detail_payload["run"]["symbols_scanned"] == ["SPY", "XYZ"]
    assert len(detail_payload["events"]) >= 4


def test_run_symbol_endpoint_returns_single_symbol_summary(tmp_path: Path) -> None:
    client = _client(tmp_path)

    response = client.post(
        "/api/agent/run-symbol/COIN",
        json={"start": "2026-05-20", "end": "2026-05-22"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "completed"
    assert payload["symbols_scanned"] == ["COIN"]
    assert payload["symbol_results"][0]["symbol"] == "COIN"
    assert any(
        item["setup_type"] == "btc_move_alert"
        for item in payload["symbol_results"][0]["candidates"]
    )


def test_run_scan_rejects_explicit_empty_symbols(tmp_path: Path) -> None:
    client = _client(tmp_path)

    response = client.post(
        "/api/agent/run-scan",
        json={"start": "2026-05-20", "end": "2026-05-22", "symbols": []},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "symbols must not be empty"


def test_events_invalid_symbol_filter_returns_empty_result(tmp_path: Path) -> None:
    client = _client(tmp_path)
    client.post(
        "/api/agent/run-symbol/TSLA",
        json={"start": "2026-05-20", "end": "2026-05-22"},
    )

    response = client.get("/api/agent/events", params={"symbol": "../TSLA"})

    assert response.status_code == 200
    assert response.json()["events"] == []


def test_signal_explanation_endpoint_returns_404_for_unknown_signal(tmp_path: Path) -> None:
    client = _client(tmp_path)

    response = client.get("/api/agent/signals/unknown-signal/explanation")

    assert response.status_code == 404
    assert response.json()["detail"] == "Signal not found"


def test_signal_explanation_endpoint_returns_persisted_signal_context(tmp_path: Path) -> None:
    client = _client(tmp_path)
    run_response = client.post(
        "/api/agent/run-symbol/TSLA",
        json={"start": "2026-05-20", "end": "2026-05-22"},
    )
    signal_id = run_response.json()["symbol_results"][0]["signals"][0]["id"]

    response = client.get(f"/api/agent/signals/{signal_id}/explanation")

    assert response.status_code == 200
    payload = response.json()
    assert payload["signal_id"] == signal_id
    assert payload["symbol"] == "TSLA"
    assert payload["current_status"] in {"observe", "waiting_trigger", "invalidated"}
    assert payload["evidence_timeline"]
    assert any(
        item["name"] == "relative_volume_gt_threshold" for item in payload["rule_hits"]
    )
    forbidden = ("automatic buy", "automatic sell", "place order", "execute trade", "ticket_ready")
    assert not any(term in str(payload).lower() for term in forbidden)
