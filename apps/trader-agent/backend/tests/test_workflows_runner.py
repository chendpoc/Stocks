from __future__ import annotations

import pytest

from app.intel.workflows_runner import (
    WorkflowDispatchError,
    build_workflow_cli_args,
    reset_workflow_runs_for_tests,
    start_workflow_run,
)


def test_build_workflow_cli_args_decision() -> None:
    args = build_workflow_cli_args("decision", {"symbols": ["tsla.us"]})
    assert args == ["decide", "TSLA.US"]


def test_build_workflow_cli_args_outcome_with_limit() -> None:
    args = build_workflow_cli_args(
        "outcome",
        {"symbol": "NVDA", "daysBack": 25},
    )
    assert args == ["outcomes", "run", "--due", "--symbol", "NVDA", "--limit", "25"]


def test_build_workflow_cli_args_insight_exploration() -> None:
    args = build_workflow_cli_args(
        "insightExploration",
        {"symbols": ["AAPL"], "window": "14d"},
    )
    assert args == ["insights", "explore", "--symbol", "AAPL", "--window", "14d"]


def test_build_workflow_cli_args_alpha_research_unavailable() -> None:
    with pytest.raises(WorkflowDispatchError, match="alphaResearch"):
        build_workflow_cli_args("alphaResearch", {"symbol": "TSLA", "insightCandidateId": "x"})


def test_start_workflow_run_records_completed_envelope(monkeypatch, tmp_path) -> None:
    reset_workflow_runs_for_tests()

    def fake_run(repo_root, cli_args):  # noqa: ANN001
        assert cli_args == ["decide", "TSLA"]
        return {
            "ok": True,
            "run_id": "stage1-run-1",
            "command": "decide",
            "data": {"decision_id": "dec-1"},
        }

    monkeypatch.setattr("app.intel.workflows_runner.run_workflows_cli", fake_run)

    payload = start_workflow_run(
        repo_root=tmp_path,
        workflow_id="decision",
        body={"symbols": ["TSLA"]},
    )
    assert payload["status"] == "running"
    run_id = payload["runId"]

    import time

    for _ in range(50):
        from app.intel.workflows_runner import get_workflow_run

        record = get_workflow_run(run_id)
        if record and record["status"] != "running":
            break
        time.sleep(0.01)

    record = get_workflow_run(run_id)
    assert record is not None
    assert record["status"] == "completed"
    assert record["workflowRunId"] == "stage1-run-1"
    assert record["result"] == {"decision_id": "dec-1"}
