from __future__ import annotations

import json
from dataclasses import asdict
from time import perf_counter
from typing import Any
from uuid import uuid4

from sqlalchemy import and_, desc, select

from app.core.config import Settings
from app.core.events import record_agent_event
from app.core.time import utc_now_iso
from app.db.migrations import bootstrap_database
from app.db.models import agent_events
from app.db.session import create_sqlite_engine
from app.modules.market_snapshot import EvidenceGap, EvidenceGapError, build_market_snapshot
from app.modules.setup_detection import detect_setups
from app.rulepack.loader import load_rulepack
from app.tools.local_adapter import LocalToolAdapter, normalize_symbol

RUN_STARTED = "runtime_orchestrator.run_started"
RUN_COMPLETED = "runtime_orchestrator.run_completed"
SYMBOL_COMPLETED = "runtime_orchestrator.symbol_completed"
SYMBOL_FAILED = "runtime_orchestrator.symbol_failed"
MAX_EVENT_LIMIT = 200
DEFAULT_EVENT_LIMIT = 50


class EmptyScanUniverseError(ValueError):
    pass


class RuntimeOrchestrator:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or Settings()
        bootstrap_database(self.settings)

    def run_symbol(self, *, symbol: str, start: str, end: str) -> dict[str, Any]:
        return self.run_scan(start=start, end=end, symbols=[symbol])

    def run_scan(
        self,
        *,
        start: str,
        end: str,
        symbols: list[str] | None = None,
    ) -> dict[str, Any]:
        rulepack = load_rulepack(self.settings.rulepack_path)
        requested_symbols = symbols if symbols is not None else rulepack.universe_symbols
        if not requested_symbols:
            raise EmptyScanUniverseError("symbols must not be empty")
        normalized_symbols = [_safe_symbol_label(symbol) for symbol in requested_symbols]
        run_id = str(uuid4())
        started_at = utc_now_iso()
        timer_start = perf_counter()

        record_agent_event(
            self.settings,
            event_type=RUN_STARTED,
            status="started",
            title="Runtime scan started",
            input_summary={
                "module": "runtime_orchestrator",
                "start": start,
                "end": end,
                "symbols": normalized_symbols,
                "rulepack_version": rulepack.version,
            },
            run_id=run_id,
        )

        symbol_results = [
            self._run_one_symbol(
                run_id=run_id,
                symbol=symbol,
                start=start,
                end=end,
            )
            for symbol in requested_symbols
        ]
        completed_at = utc_now_iso()
        status = (
            "completed"
            if all(item["status"] == "completed" for item in symbol_results)
            else "completed_with_errors"
        )
        result = {
            "run_id": run_id,
            "status": status,
            "started_at": started_at,
            "completed_at": completed_at,
            "start": start,
            "end": end,
            "symbols_scanned": normalized_symbols,
            "symbol_results": symbol_results,
            "candidate_count": sum(len(item["candidates"]) for item in symbol_results),
            "gap_count": sum(len(item["gaps"]) for item in symbol_results),
            "error_count": sum(len(item["errors"]) for item in symbol_results),
            "evidence_refs": sorted(
                {
                    evidence_ref
                    for item in symbol_results
                    for evidence_ref in item["evidence_refs"]
                }
            ),
            "rulepack_version": rulepack.version,
        }

        record_agent_event(
            self.settings,
            event_type=RUN_COMPLETED,
            status=status,
            title="Runtime scan completed",
            output_summary={"module": "runtime_orchestrator", **result},
            run_id=run_id,
            duration_ms=_elapsed_ms(timer_start),
        )
        return result

    def _run_one_symbol(
        self,
        *,
        run_id: str,
        symbol: str,
        start: str,
        end: str,
    ) -> dict[str, Any]:
        timer_start = perf_counter()
        normalized_symbol = _safe_symbol_label(symbol)
        try:
            normalized_symbol = normalize_symbol(symbol)
            snapshot = build_market_snapshot(
                adapter=LocalToolAdapter(self.settings),
                symbol=normalized_symbol,
                start=start,
                end=end,
            )
            detection = detect_setups(snapshot)
        except EvidenceGapError as exc:
            return self._failed_symbol_result(
                run_id=run_id,
                symbol=normalized_symbol,
                start=start,
                end=end,
                errors=[_serialize_gap(exc.gap)],
                timer_start=timer_start,
            )
        except ValueError as exc:
            return self._failed_symbol_result(
                run_id=run_id,
                symbol=normalized_symbol,
                start=start,
                end=end,
                errors=[{"error_type": "invalid_symbol", "reason": str(exc)}],
                timer_start=timer_start,
            )

        candidates = [_serialize_candidate(candidate) for candidate in detection.candidates]
        gaps = [_serialize_gap(gap) for gap in detection.gaps]
        evidence_refs = sorted(
            {
                evidence_ref
                for item in [*candidates, *gaps]
                for evidence_ref in item.get("evidence_refs", [])
            }
        )
        result = {
            "symbol": detection.symbol,
            "status": "completed",
            "start": start,
            "end": end,
            "candidates": candidates,
            "gaps": gaps,
            "errors": [],
            "evidence_refs": evidence_refs,
        }
        record_agent_event(
            self.settings,
            event_type=SYMBOL_COMPLETED,
            status="completed",
            title=f"{detection.symbol} runtime scan completed",
            input_summary={
                "module": "runtime_orchestrator",
                "symbol": detection.symbol,
                "start": start,
                "end": end,
            },
            output_summary={
                "module": "runtime_orchestrator",
                "symbol": detection.symbol,
                "candidate_count": len(candidates),
                "gap_count": len(gaps),
                "evidence_refs": evidence_refs,
                "candidates": candidates,
                "gaps": gaps,
            },
            run_id=run_id,
            symbol=detection.symbol,
            duration_ms=_elapsed_ms(timer_start),
        )
        return result

    def _failed_symbol_result(
        self,
        *,
        run_id: str,
        symbol: str,
        start: str,
        end: str,
        errors: list[dict[str, Any]],
        timer_start: float,
    ) -> dict[str, Any]:
        result = {
            "symbol": symbol,
            "status": "failed",
            "start": start,
            "end": end,
            "candidates": [],
            "gaps": [],
            "errors": errors,
            "evidence_refs": sorted(
                {
                    evidence_ref
                    for error in errors
                    for evidence_ref in error.get("evidence_refs", [])
                }
            ),
        }
        record_agent_event(
            self.settings,
            event_type=SYMBOL_FAILED,
            status="failed",
            title=f"{symbol} runtime scan failed",
            input_summary={
                "module": "runtime_orchestrator",
                "symbol": symbol,
                "start": start,
                "end": end,
            },
            output_summary={"module": "runtime_orchestrator", **result},
            run_id=run_id,
            symbol=symbol,
            duration_ms=_elapsed_ms(timer_start),
            error=errors[0]["reason"] if errors else "Runtime symbol scan failed.",
        )
        return result


def get_runtime_status(settings: Settings | None = None) -> dict[str, Any]:
    resolved_settings = settings or Settings()
    bootstrap_database(resolved_settings)
    rulepack = load_rulepack(resolved_settings.rulepack_path)
    return {
        "storage": _storage_health(resolved_settings),
        "rulepack": {"version": rulepack.version},
        "universe": {
            "size": len(rulepack.universe_symbols),
            "symbols": rulepack.universe_symbols,
        },
        "enabled_capabilities": sorted(resolved_settings.enabled_tool_capabilities),
        "last_scan_time": _last_scan_time(resolved_settings),
    }


def list_agent_events(
    settings: Settings | None = None,
    *,
    module: str | None = None,
    event_type: str | None = None,
    status: str | None = None,
    symbol: str | None = None,
    run_id: str | None = None,
    start: str | None = None,
    end: str | None = None,
    limit: int = DEFAULT_EVENT_LIMIT,
) -> dict[str, Any]:
    resolved_settings = settings or Settings()
    bootstrap_database(resolved_settings)
    bounded_limit = min(max(limit, 1), MAX_EVENT_LIMIT)
    filters = []
    if module:
        filters.append(agent_events.c.event_type.like(f"{module}.%"))
    if event_type:
        filters.append(agent_events.c.event_type == event_type)
    if status:
        filters.append(agent_events.c.status == status)
    if symbol:
        try:
            normalized_symbol = normalize_symbol(symbol)
        except ValueError:
            return {"events": [], "limit": bounded_limit}
        filters.append(agent_events.c.symbol == normalized_symbol)
    if run_id:
        filters.append(agent_events.c.run_id == run_id)
    if start:
        filters.append(agent_events.c.timestamp >= start)
    if end:
        filters.append(agent_events.c.timestamp <= end)

    query = select(agent_events).order_by(desc(agent_events.c.timestamp)).limit(bounded_limit)
    if filters:
        query = query.where(and_(*filters))

    engine = create_sqlite_engine(resolved_settings)
    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()

    return {"events": [_serialize_event(row) for row in rows], "limit": bounded_limit}


def list_agent_runs(
    settings: Settings | None = None,
    *,
    limit: int = DEFAULT_EVENT_LIMIT,
) -> dict[str, Any]:
    resolved_settings = settings or Settings()
    bootstrap_database(resolved_settings)
    bounded_limit = min(max(limit, 1), MAX_EVENT_LIMIT)
    query = (
        select(agent_events)
        .where(agent_events.c.event_type == RUN_COMPLETED)
        .order_by(desc(agent_events.c.timestamp))
        .limit(bounded_limit)
    )
    engine = create_sqlite_engine(resolved_settings)
    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()
    return {"runs": [_run_from_completed_event(row) for row in rows], "limit": bounded_limit}


def get_agent_run(settings: Settings | None, run_id: str) -> dict[str, Any] | None:
    resolved_settings = settings or Settings()
    bootstrap_database(resolved_settings)
    engine = create_sqlite_engine(resolved_settings)
    with engine.connect() as conn:
        completed = (
            conn.execute(
                select(agent_events).where(
                    agent_events.c.event_type == RUN_COMPLETED,
                    agent_events.c.run_id == run_id,
                )
            )
            .mappings()
            .first()
        )
        event_rows = (
            conn.execute(
                select(agent_events)
                .where(agent_events.c.run_id == run_id)
                .order_by(agent_events.c.timestamp)
            )
            .mappings()
            .all()
        )
    if completed is None:
        return None
    return {
        "run": _run_from_completed_event(completed),
        "events": [_serialize_event(row) for row in event_rows],
    }


def _storage_health(settings: Settings) -> dict[str, Any]:
    try:
        engine = create_sqlite_engine(settings)
        with engine.connect() as conn:
            conn.exec_driver_sql("SELECT 1")
    except Exception as exc:  # pragma: no cover - defensive health reporting
        return {"status": "error", "database_path": str(settings.database_path), "error": str(exc)}
    return {"status": "ok", "database_path": str(settings.database_path)}


def _last_scan_time(settings: Settings) -> str | None:
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        row = (
            conn.execute(
                select(agent_events.c.timestamp)
                .where(agent_events.c.event_type == RUN_COMPLETED)
                .order_by(desc(agent_events.c.timestamp))
                .limit(1)
            )
            .mappings()
            .first()
        )
    return None if row is None else str(row["timestamp"])


def _run_from_completed_event(row: Any) -> dict[str, Any]:
    summary = _decode_json(row["output_summary"])
    return {
        "run_id": row["run_id"],
        "status": row["status"],
        "started_at": summary.get("started_at"),
        "completed_at": summary.get("completed_at", row["timestamp"]),
        "start": summary.get("start"),
        "end": summary.get("end"),
        "symbols_scanned": summary.get("symbols_scanned", []),
        "candidate_count": summary.get("candidate_count", 0),
        "gap_count": summary.get("gap_count", 0),
        "error_count": summary.get("error_count", 0),
        "evidence_refs": summary.get("evidence_refs", []),
        "symbol_results": summary.get("symbol_results", []),
        "rulepack_version": summary.get("rulepack_version"),
    }


def _serialize_candidate(candidate: Any) -> dict[str, Any]:
    return asdict(candidate)


def _serialize_gap(gap: EvidenceGap) -> dict[str, Any]:
    payload = asdict(gap)
    payload["evidence_refs"] = list(gap.evidence_refs)
    return payload


def _serialize_event(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "timestamp": row["timestamp"],
        "run_id": row["run_id"],
        "task_id": row["task_id"],
        "signal_id": row["signal_id"],
        "symbol": row["symbol"],
        "event_type": row["event_type"],
        "status": row["status"],
        "title": row["title"],
        "summary": row["summary"],
        "input_summary": _decode_json(row["input_summary"]),
        "output_summary": _decode_json(row["output_summary"]),
        "tool_name": row["tool_name"],
        "duration_ms": row["duration_ms"],
        "error": row["error"],
    }


def _decode_json(value: str | None) -> dict[str, Any]:
    if value is None:
        return {}
    decoded = json.loads(value)
    return decoded if isinstance(decoded, dict) else {"value": decoded}


def _safe_symbol_label(symbol: str) -> str:
    try:
        return normalize_symbol(symbol)
    except ValueError:
        return symbol.strip().upper()


def _elapsed_ms(timer_start: float) -> int:
    return int((perf_counter() - timer_start) * 1000)
