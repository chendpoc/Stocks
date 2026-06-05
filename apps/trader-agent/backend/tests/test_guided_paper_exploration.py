from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.guided_paper_exploration import router as guided_router
from app.core.config import Settings
from app.intel.db.connection import set_intel_db_path
from app.intel.db.schema import init_intel_db
from app.modules.execution_policy.store import save_execution_policy
from app.modules.execution_policy.validate import ExecutionPolicyValidationError, validate_execution_policy
from app.modules.guided_paper_exploration.run import run_guided_paper_exploration
from app.modules.live_market_plane.push_normalize import push_depth_to_row, push_quote_to_row, push_trade_to_row
from app.modules.live_market_plane.service import persist_websocket_push
from app.modules.risk_gate.gate import evaluate_risk_gate


def _settings(tmp_path: Path) -> Settings:
    repo_root = Path(__file__).resolve().parents[4]
    return Settings(
        repo_root=repo_root,
        data_dir=tmp_path / "trader-agent-data",
        fixture_data_dir=repo_root / "apps" / "trader-agent" / "backend" / "tests" / "fixtures",
        rulepack_path=repo_root / "apps" / "trader-agent" / "shared" / "rulepacks" / "v0_1_0.yaml",
        enabled_tool_capabilities=frozenset({"market_data.longbridge"}),
        enable_event_jsonl_mirror=False,
    )


def _utc_now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _sample_policy(**overrides: Any) -> dict[str, Any]:
    now = datetime.now(UTC).replace(microsecond=0)
    valid_from = (now - timedelta(hours=1)).isoformat().replace("+00:00", "Z")
    expires = (now + timedelta(days=1)).isoformat().replace("+00:00", "Z")
    created = valid_from
    policy = {
        "schema_version": "analysis_to_execution_contract.v0",
        "execution_policy_id": "ep-test-001",
        "opportunity_map_id": "om-test-001",
        "risk_envelope_id": "re-test-001",
        "exploration_plan_id": "xp-test-001",
        "created_at": created,
        "valid_from": valid_from,
        "expires_at": expires,
        "allowed_modes": ["paper_simulation"],
        "forbidden_actions": ["broker_submit", "live_trading"],
        "symbols": ["AAPL.US"],
        "max_quantity": 100,
        "operator_gate": {"approval_required": False},
    }
    policy.update(overrides)
    return policy


def _seed_live_market(settings: Settings, symbol: str = "AAPL.US") -> dict[str, Any]:
    now = _utc_now_iso()
    quote = push_quote_to_row(symbol, {"last_done": 200.0, "sequence": 1, "timestamp": now})
    depth = push_depth_to_row(
        {
            "sequence": 2,
            "timestamp": now,
            "bid": [{"position": 1, "price": "199.9", "volume": 100}],
            "ask": [{"position": 1, "price": "200.1", "volume": 120}],
        }
    )
    trade = push_trade_to_row(symbol, {"price": 200.0, "volume": 10, "timestamp": now})
    return persist_websocket_push(
        settings,
        symbol,
        quote_row=quote,
        depth_row=depth,
        trade_row=trade,
    )


@pytest.fixture
def intel_db(tmp_path: Path) -> None:
    db_path = tmp_path / "data" / "market_intel.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    set_intel_db_path(db_path)
    init_intel_db(_settings(tmp_path))


def test_execution_policy_validation_rejects_forbidden_mode() -> None:
    policy = _sample_policy(allowed_modes=["live_trading"])
    with pytest.raises(ExecutionPolicyValidationError):
        validate_execution_policy(policy)


def test_risk_gate_rejects_when_paper_readiness_blocked(intel_db: None, tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    policy = _sample_policy()
    market_state = {
        "market_state_snapshot_id": "mss-x",
        "consumer_readiness": {"paper_simulation": "blocked"},
    }
    decision = evaluate_risk_gate(
        policy=policy,
        market_state=market_state,
        symbol="AAPL.US",
        direction="buy",
        quantity=1,
    )
    assert decision["decision"] == "reject"
    assert "paper_simulation" in decision["reason"]


def test_guided_run_end_to_end(intel_db: None, tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    _seed_live_market(settings)
    policy = _sample_policy()
    engine = init_intel_db(settings)
    save_execution_policy(engine, policy)

    result = run_guided_paper_exploration(
        settings,
        execution_policy_id=policy["execution_policy_id"],
        symbol="AAPL.US",
        direction="buy",
        quantity=2,
    )
    assert result["risk_decision"]["decision"] == "allow"
    assert result["paper_result"] is not None
    assert result["execution_feedback"]["status"] == "completed"
    assert result["execution_feedback"]["feasibility_verdict"] == "execution_feasible_under_policy"


def test_guided_api_register_and_run(intel_db: None, tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    _seed_live_market(settings)
    policy = _sample_policy(execution_policy_id="ep-api-001")
    app = FastAPI()
    app.state.settings = settings
    app.include_router(guided_router)
    client = TestClient(app)

    reg = client.post("/api/guided-paper/execution-policies", json={"policy": policy})
    assert reg.status_code == 200

    run = client.post(
        "/api/guided-paper/runs",
        json={
            "execution_policy_id": policy["execution_policy_id"],
            "symbol": "AAPL.US",
            "direction": "buy",
            "quantity": 1,
        },
    )
    assert run.status_code == 200
    body = run.json()
    assert body["execution_feedback"]["status"] == "completed"
