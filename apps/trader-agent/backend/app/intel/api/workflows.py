"""
/api/intel/workflows — Workflow 调度路由

Agent 在 Chat 中通过 runWorkflow / listWorkflows / getWorkflowStatus
触发 Workflow 执行。执行委托给 apps/trader-workflows CLI（与 trader-cli decide 相同路径）。
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request

from app.intel.workflows_runner import (
    WorkflowDispatchError,
    get_workflow_run,
    start_workflow_run,
)

router = APIRouter()

WORKFLOW_CATALOG: list[dict[str, Any]] = [
    {
        "id": "decision",
        "description": "扫描固定标的池，检测 setup，生成 DecisionEnvelope",
        "requiredInputs": ["symbols"],
        "produces": "model_decisions",
        "avgDuration": "30s",
    },
    {
        "id": "outcome",
        "description": "对已生成的决策回标 1D/3D/5D 实际结果",
        "requiredInputs": ["symbols", "daysBack"],
        "produces": "decision_outcomes",
        "avgDuration": "10s",
    },
    {
        "id": "evaluation",
        "description": "按 setup 聚合评估最近 N 次决策的胜率/盈亏比/衰减状态",
        "requiredInputs": ["symbols", "daysBack"],
        "produces": "evaluation_reports",
        "avgDuration": "15s",
    },
    {
        "id": "insightExploration",
        "description": "从复盘数据中发现规律候选，生成 insight candidates",
        "requiredInputs": ["symbols"],
        "produces": "insight_candidates",
        "avgDuration": "20s",
    },
    {
        "id": "alphaResearch",
        "description": "深度回测 + 规则挖掘，产出 RuleCandidate + LiteBacktestReport",
        "requiredInputs": ["symbol", "insightCandidateId"],
        "produces": "rule_candidates + lite_backtest_reports",
        "avgDuration": "60s",
        "cliAvailable": False,
    },
]


@router.get("")
async def list_workflows() -> dict[str, Any]:
    return {"workflows": WORKFLOW_CATALOG, "total": len(WORKFLOW_CATALOG)}


@router.post("/{workflow_id}")
async def run_workflow(
    workflow_id: str,
    body: dict[str, Any],
    request: Request,
) -> dict[str, Any]:
    if workflow_id not in {item["id"] for item in WORKFLOW_CATALOG}:
        raise HTTPException(status_code=404, detail=f"Unknown workflow: {workflow_id}")

    settings = request.app.state.settings
    try:
        return start_workflow_run(
            repo_root=settings.repo_root,
            workflow_id=workflow_id,
            body=body,
        )
    except WorkflowDispatchError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/runs/{run_id}")
async def get_workflow_status(run_id: str) -> dict[str, Any]:
    run = get_workflow_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")

    return {
        "runId": run_id,
        "workflowId": run.get("workflowId"),
        "status": run.get("status"),
        "progress": run.get("progress"),
        "result": run.get("result"),
        "workflowRunId": run.get("workflowRunId"),
        "error": run.get("error"),
        "startedAt": run.get("startedAt"),
    }
