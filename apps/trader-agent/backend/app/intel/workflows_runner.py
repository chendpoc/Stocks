from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any

_run_store: dict[str, dict[str, Any]] = {}
_store_lock = threading.Lock()


class WorkflowDispatchError(ValueError):
    """Raised when workflow inputs cannot be mapped to a CLI command."""


def build_workflow_cli_args(workflow_id: str, body: dict[str, Any]) -> list[str]:
    symbols = _symbols_from_body(body)

    if workflow_id == "decision":
        if not symbols:
            raise WorkflowDispatchError("decision requires symbols or symbol")
        return ["decide", symbols[0]]

    if workflow_id == "outcome":
        args = ["outcomes", "run", "--due"]
        if symbols:
            args.extend(["--symbol", symbols[0]])
        limit = body.get("daysBack") or body.get("limit") or 100
        args.extend(["--limit", str(int(limit))])
        return args

    if workflow_id == "evaluation":
        if not symbols:
            raise WorkflowDispatchError("evaluation requires symbols or symbol")
        args = ["eval", "summary", "--symbol", symbols[0]]
        limit = body.get("daysBack") or body.get("limit") or 500
        args.extend(["--limit", str(int(limit))])
        return args

    if workflow_id == "insightExploration":
        if not symbols:
            raise WorkflowDispatchError("insightExploration requires symbols or symbol")
        window = body.get("window") or "30d"
        return ["insights", "explore", "--symbol", symbols[0], "--window", str(window)]

    if workflow_id == "alphaResearch":
        raise WorkflowDispatchError(
            "alphaResearch is not available via workflow CLI yet; use LangGraph Studio"
        )

    raise WorkflowDispatchError(f"Unknown workflow: {workflow_id}")


def run_workflows_cli(repo_root: Path, cli_args: list[str]) -> dict[str, Any]:
    npm = shutil.which("npm")
    if npm is None and os.name == "nt":
        npm = shutil.which("npm.cmd")
    if npm is None:
        raise RuntimeError("npm not found on PATH")

    cmd = [
        npm,
        "--prefix",
        "apps/trader-workflows",
        "run",
        "workflows",
        "--",
        *cli_args,
        "--json",
    ]
    result = subprocess.run(
        cmd,
        cwd=repo_root,
        capture_output=True,
        text=True,
        shell=os.name == "nt",
        env=os.environ.copy(),
        check=False,
    )
    raw = (result.stdout or "").strip()
    if not raw:
        detail = (result.stderr or "").strip() or "trader-workflows returned empty output"
        raise RuntimeError(detail)

    try:
        envelope = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"invalid workflow JSON output: {raw[:500]}") from exc

    if not envelope.get("ok"):
        error = envelope.get("error") or {}
        message = error.get("message") or envelope.get("command") or "workflow failed"
        raise RuntimeError(str(message))

    return envelope


def _symbols_from_body(body: dict[str, Any]) -> list[str]:
    symbols = body.get("symbols")
    if isinstance(symbols, list):
        normalized = [str(item).strip().upper() for item in symbols if str(item).strip()]
        if normalized:
            return normalized
    symbol = body.get("symbol")
    if symbol is not None and str(symbol).strip():
        return [str(symbol).strip().upper()]
    return []


def start_workflow_run(
    *,
    repo_root: Path,
    workflow_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    cli_args = build_workflow_cli_args(workflow_id, body)
    run_id = f"run_{workflow_id}_{uuid.uuid4().hex[:8]}"
    started_at = time.time()
    symbols = _symbols_from_body(body)

    with _store_lock:
        _run_store[run_id] = {
            "workflowId": workflow_id,
            "status": "running",
            "startedAt": started_at,
            "symbols": symbols,
            "cliArgs": cli_args,
        }

    def _run() -> None:
        try:
            envelope = run_workflows_cli(repo_root, cli_args)
            with _store_lock:
                record = _run_store.get(run_id)
                if record is None:
                    return
                record["status"] = "completed"
                record["result"] = envelope.get("data")
                record["workflowRunId"] = envelope.get("run_id")
                record["command"] = envelope.get("command")
        except Exception as exc:
            with _store_lock:
                record = _run_store.get(run_id)
                if record is None:
                    return
                record["status"] = "failed"
                record["error"] = str(exc)

    threading.Thread(target=_run, daemon=True).start()
    return {"runId": run_id, "status": "running", "workflowId": workflow_id}


def get_workflow_run(run_id: str) -> dict[str, Any] | None:
    with _store_lock:
        record = _run_store.get(run_id)
        if record is None:
            return None
        return dict(record)


def reset_workflow_runs_for_tests() -> None:
    with _store_lock:
        _run_store.clear()
