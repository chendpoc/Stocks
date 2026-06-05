from __future__ import annotations

from dataclasses import dataclass
from statistics import median
from typing import Any
from uuid import uuid4

from sqlalchemy import delete, select, update

from app.core.config import Settings
from app.core.events import record_agent_event
from app.core.time import utc_now_iso
from app.db.models import (
    lite_backtest_reports,
    rule_candidate_evidence_requirements,
    rule_candidates,
    trader_semantic_events,
)
from app.db.session import create_sqlite_engine
from app.modules.json_row_codec import coerce_json_value, serialize_json_field
from app.tools.local_adapter import (
    MARKET_BARS_FIXTURE,
    CapabilityDisabledError,
    FixtureNotFoundError,
    LocalEvidence,
    LocalToolAdapter,
    normalize_symbol,
)

DRAFT = "draft"
EVIDENCE_REQUIRED = "evidence_required"
BACKTEST_PENDING = "backtest_pending"
BACKTESTED = "backtested"
NEEDS_MORE_DATA = "needs_more_data"
REJECTED = "rejected"
PENDING_SHADOW_TRACKING = "pending_shadow_tracking"
PENDING_MANUAL_APPROVAL = "pending_manual_approval"

REPORT_REQUIRED_STATES = {PENDING_SHADOW_TRACKING, PENDING_MANUAL_APPROVAL}
TERMINAL_REVIEW_STATES = {
    NEEDS_MORE_DATA,
    REJECTED,
    PENDING_SHADOW_TRACKING,
    PENDING_MANUAL_APPROVAL,
}
ALLOWED_STATUS_TRANSITIONS = {
    DRAFT: {EVIDENCE_REQUIRED},
    EVIDENCE_REQUIRED: {BACKTEST_PENDING, EVIDENCE_REQUIRED},
    BACKTEST_PENDING: {BACKTESTED},
    BACKTESTED: TERMINAL_REVIEW_STATES,
}
DEFAULT_DATA_REQUIREMENTS = [
    {
        "requirement_type": "market_bars",
        "provider_capability": MARKET_BARS_FIXTURE,
        "required_quality": {"min_bars": 3},
    }
]
DROP_THRESHOLD = -0.03
DEFAULT_COST_MODEL = {"commission": 0.0, "spread_bps": 5, "slippage_bps": 5}


class RuleDiscoveryError(RuntimeError):
    pass


class EvidenceGapError(RuleDiscoveryError):
    pass


class InvalidCandidateTransitionError(RuleDiscoveryError):
    pass


@dataclass(frozen=True)
class Candidate:
    id: str
    status: str
    symbols: list[str]
    data_requirements: list[dict[str, Any]]
    latest_report_id: str | None
    trigger_definition: str
    entry_condition: str
    invalidation: str


def create_rule_candidate_from_semantic_event(
    settings: Settings,
    event_id: str,
    created_by: str = "agent_core",
) -> str:
    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        event = conn.execute(
            select(trader_semantic_events).where(trader_semantic_events.c.id == event_id)
        ).mappings().one_or_none()
        if event is None:
            raise ValueError(f"Semantic event not found: {event_id}")

        symbols = [normalize_symbol(event["symbol"])] if event["symbol"] else []
        if not symbols:
            raise ValueError(f"Semantic event has no supported symbol: {event_id}")

        candidate_id = str(uuid4())
        now = utc_now_iso()
        conn.execute(
            rule_candidates.insert().values(
                id=candidate_id,
                created_at=now,
                updated_at=now,
                source="semantic_event",
                source_ref=serialize_json_field({"event_id": event_id}),
                hypothesis=_hypothesis_from_event(event),
                symbols=serialize_json_field(symbols),
                trigger_definition=event["setup_hint"] or event["entry_condition"],
                entry_condition=event["entry_condition"] or "research_measurement_only",
                exit_condition="evaluate_to_sample_window_final_bar",
                invalidation=event["invalidation"] or "insufficient_confirming_evidence",
                data_requirements=serialize_json_field(DEFAULT_DATA_REQUIREMENTS),
                risk_notes=event["risk_notes"],
                status=DRAFT,
                confidence=event["confidence"],
                created_by=created_by,
            )
        )

    record_agent_event(
        settings,
        event_type="rule_discovery.candidate_created",
        status="completed",
        title="Rule candidate created",
        input_summary={"source": "semantic_event", "event_id": event_id},
        output_summary={"candidate_id": candidate_id, "status": DRAFT, "symbols": symbols},
        symbol=symbols[0],
    )
    return candidate_id


ALLOWED_CANDIDATE_SOURCES = {"manual", "insight_candidate"}


def create_manual_rule_candidate(
    settings: Settings,
    payload: dict[str, Any],
    created_by: str = "manual",
) -> str:
    return create_structured_rule_candidate(
        settings,
        payload,
        source="manual",
        created_by=created_by,
    )


def create_insight_candidate_rule_candidate(
    settings: Settings,
    payload: dict[str, Any],
    created_by: str = "alpha_research_graph",
) -> str:
    return create_structured_rule_candidate(
        settings,
        payload,
        source="insight_candidate",
        created_by=created_by,
    )


def create_structured_rule_candidate(
    settings: Settings,
    payload: dict[str, Any],
    *,
    source: str,
    created_by: str,
) -> str:
    if source not in ALLOWED_CANDIDATE_SOURCES:
        raise ValueError(f"Unsupported rule candidate source: {source}")

    symbols = [normalize_symbol(symbol) for symbol in payload.get("symbols", [])]
    if not symbols:
        raise ValueError("Rule candidate requires at least one symbol")

    source_ref = payload.get("source_ref") or {}
    if source == "manual" and not source_ref:
        source_ref = {"input": "structured_payload"}
    if source == "insight_candidate":
        insight_id = source_ref.get("insight_id")
        if not isinstance(insight_id, str) or not insight_id.strip():
            raise ValueError("insight_candidate source requires source_ref.insight_id")

    candidate_id = str(uuid4())
    now = utc_now_iso()
    data_requirements = payload.get("data_requirements") or DEFAULT_DATA_REQUIREMENTS
    risk_notes = payload.get("risk_notes")

    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        conn.execute(
            rule_candidates.insert().values(
                id=candidate_id,
                created_at=now,
                updated_at=now,
                source=source,
                source_ref=serialize_json_field(source_ref),
                hypothesis=_require_text(payload, "hypothesis"),
                symbols=serialize_json_field(symbols),
                trigger_definition=_require_text(payload, "trigger_definition"),
                entry_condition=_require_text(payload, "entry_condition"),
                exit_condition=payload.get("exit_condition", "evaluate_to_sample_window_final_bar"),
                invalidation=_require_text(payload, "invalidation"),
                data_requirements=serialize_json_field(data_requirements),
                risk_notes=serialize_json_field(risk_notes),
                status=DRAFT,
                confidence=payload.get("confidence"),
                created_by=created_by,
            )
        )

    record_agent_event(
        settings,
        event_type="rule_discovery.candidate_created",
        status="completed",
        title="Rule candidate created",
        input_summary={"source": source, "symbols": symbols},
        output_summary={"candidate_id": candidate_id, "status": DRAFT},
        symbol=symbols[0],
    )
    return candidate_id


def get_rule_candidate(settings: Settings, candidate_id: str) -> dict[str, Any]:
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        row = conn.execute(
            select(rule_candidates).where(rule_candidates.c.id == candidate_id)
        ).mappings().one_or_none()
    if row is None:
        raise ValueError(f"Rule candidate not found: {candidate_id}")
    return _serialize_candidate_row(row)


def get_lite_backtest_report(
    settings: Settings,
    candidate_id: str,
    *,
    report_id: str | None = None,
) -> dict[str, Any]:
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        candidate = conn.execute(
            select(rule_candidates.c.latest_report_id).where(rule_candidates.c.id == candidate_id)
        ).mappings().one_or_none()
        if candidate is None:
            raise ValueError(f"Rule candidate not found: {candidate_id}")

        resolved_report_id = report_id or candidate["latest_report_id"]
        if not resolved_report_id:
            raise ValueError(f"No lite backtest report for candidate: {candidate_id}")

        row = conn.execute(
            select(lite_backtest_reports).where(
                lite_backtest_reports.c.id == resolved_report_id,
                lite_backtest_reports.c.candidate_id == candidate_id,
            )
        ).mappings().one_or_none()
    if row is None:
        raise ValueError(f"Lite backtest report not found: {resolved_report_id}")
    return _serialize_lite_backtest_report_row(row)


def validate_candidate_evidence_requirements(
    settings: Settings,
    candidate_id: str,
) -> dict[str, Any]:
    candidate = _load_candidate(settings, candidate_id)
    if candidate.status not in {DRAFT, EVIDENCE_REQUIRED}:
        raise InvalidCandidateTransitionError(
            "Evidence validation requires draft or evidence_required candidate status; "
            f"got {candidate.status}"
        )
    adapter = LocalToolAdapter(settings)
    rows: list[dict[str, Any]] = []
    gaps: list[dict[str, Any]] = []

    for requirement in candidate.data_requirements:
        if requirement.get("provider_capability") != MARKET_BARS_FIXTURE:
            gap = _gap(
                requirement=requirement,
                symbol=",".join(candidate.symbols),
                reason=f"unsupported requirement: {requirement.get('provider_capability')}",
            )
            rows.append(_requirement_row(candidate_id, requirement, gap=gap))
            gaps.append(gap)
            continue

        for symbol in candidate.symbols:
            gap_reason: str | None = None
            evidence_refs: list[dict[str, Any]] = []
            try:
                bars = adapter.get_market_bars(symbol, "1900-01-01", "2999-12-31")
            except CapabilityDisabledError as exc:
                gap_reason = f"missing capability: {exc.capability}"
            except FixtureNotFoundError as exc:
                gap_reason = f"missing fixture: {exc.path.name}"
            else:
                min_bars = int((requirement.get("required_quality") or {}).get("min_bars", 1))
                if len(bars) < min_bars:
                    gap_reason = (
                        f"insufficient fixture bars: required {min_bars}, found {len(bars)}"
                    )
                else:
                    evidence_refs = [
                        {
                            "provider": bar.provider,
                            "symbol": bar.symbol,
                            "timestamp": bar.timestamp,
                        }
                        for bar in bars
                    ]

            if gap_reason:
                gap = _gap(requirement=requirement, symbol=symbol, reason=gap_reason)
                rows.append(_requirement_row(candidate_id, requirement, gap=gap))
                gaps.append(gap)
            else:
                rows.append(
                    _requirement_row(
                        candidate_id,
                        requirement,
                        status="satisfied",
                        evidence_refs=evidence_refs,
                        symbol=symbol,
                    )
                )

    status_sequence = [candidate.status]
    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        conn.execute(
            delete(rule_candidate_evidence_requirements).where(
                rule_candidate_evidence_requirements.c.candidate_id == candidate_id
            )
        )
        if rows:
            conn.execute(rule_candidate_evidence_requirements.insert(), rows)
        current_candidate = candidate
        if current_candidate.status == DRAFT:
            _update_candidate_status(conn, current_candidate, EVIDENCE_REQUIRED)
            current_candidate = _replace_candidate_status(current_candidate, EVIDENCE_REQUIRED)
            status_sequence.append(EVIDENCE_REQUIRED)
        if not gaps and current_candidate.status == EVIDENCE_REQUIRED:
            _update_candidate_status(conn, current_candidate, BACKTEST_PENDING)
            current_candidate = _replace_candidate_status(current_candidate, BACKTEST_PENDING)
            status_sequence.append(BACKTEST_PENDING)

    record_agent_event(
        settings,
        event_type="rule_discovery.evidence_validated",
        status="blocked" if gaps else "completed",
        title="Rule candidate evidence validated",
        input_summary={"candidate_id": candidate_id},
        output_summary={
            "candidate_id": candidate_id,
            "status": status_sequence[-1],
            "status_sequence": status_sequence,
            "gaps": gaps,
        },
        symbol=candidate.symbols[0] if candidate.symbols else None,
    )
    return {
        "candidate_id": candidate_id,
        "status": "blocked" if gaps else "satisfied",
        "candidate_status": status_sequence[-1],
        "status_sequence": status_sequence,
        "gaps": gaps,
    }


def run_lite_backtest(
    settings: Settings,
    candidate_id: str,
    start: str,
    end: str,
) -> dict[str, Any]:
    candidate = _load_candidate(settings, candidate_id)
    if candidate.status != BACKTEST_PENDING:
        raise InvalidCandidateTransitionError(
            f"Lite backtest requires {BACKTEST_PENDING} candidate status; got {candidate.status}"
        )

    gaps = _stored_evidence_gaps(settings, candidate_id)
    if gaps:
        reason = f"Backtest blocked by evidence gaps: {gaps}"
        record_agent_event(
            settings,
            event_type="rule_discovery.lite_backtest_rejected",
            status="blocked",
            title="Lite backtest blocked",
            input_summary={"candidate_id": candidate_id, "start": start, "end": end},
            output_summary={"reason": reason, "evidence_gaps": gaps},
            symbol=candidate.symbols[0] if candidate.symbols else None,
            error=reason,
        )
        raise EvidenceGapError(reason)

    adapter = LocalToolAdapter(settings)
    trades = []
    for symbol in candidate.symbols:
        trades.extend(_backtest_symbol(adapter.get_market_bars(symbol, start, end)))

    metrics = _calculate_metrics(trades)
    quality_flags = _quality_flags(metrics["sample_size"], gaps)
    failure_cases = _failure_cases(trades)
    recommended_decision, reason = _decision(metrics, quality_flags)
    report_id = str(uuid4())
    now = utc_now_iso()
    report_payload = {
        "id": report_id,
        "candidate_id": candidate_id,
        "created_at": now,
        "data_window_start": start,
        "data_window_end": end,
        "sample_size": metrics["sample_size"],
        "trigger_logic": serialize_json_field(
            {
                "type": "sharp_drop",
                "threshold_return": DROP_THRESHOLD,
                "uses_bars": "current and prior bars only",
            }
        ),
        "entry_logic": serialize_json_field(
            {
                "type": "next_bar_measurement",
                "entry_price": "next_bar_open",
                "mode": "research_only_no_action",
            }
        ),
        "exit_logic": serialize_json_field({"type": "sample_final_bar_close"}),
        "invalidation_logic": serialize_json_field({"definition": candidate.invalidation}),
        "win_rate": metrics["win_rate"],
        "avg_return": metrics["avg_return"],
        "median_return": metrics["median_return"],
        "max_adverse_excursion": metrics["max_adverse_excursion"],
        "max_favorable_excursion": metrics["max_favorable_excursion"],
        "cost_model": serialize_json_field(DEFAULT_COST_MODEL),
        "spread_assumption": "5 bps fixture assumption",
        "slippage_assumption": "5 bps fixture assumption",
        "evidence_gaps": serialize_json_field(gaps),
        "quality_flags": serialize_json_field({"flags": quality_flags, "failure_cases": failure_cases}),
        "decision": recommended_decision,
        "reason": reason,
        "next_review_trigger": _next_review_trigger(recommended_decision),
    }

    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        conn.execute(lite_backtest_reports.insert().values(**report_payload))
        refreshed = _candidate_from_row(
            conn.execute(select(rule_candidates).where(rule_candidates.c.id == candidate_id))
            .mappings()
            .one()
        )
        conn.execute(
            update(rule_candidates)
            .where(rule_candidates.c.id == candidate_id)
            .values(updated_at=now, latest_report_id=report_id)
        )
        refreshed = Candidate(
            **{
                **refreshed.__dict__,
                "latest_report_id": report_id,
            }
        )
        _update_candidate_status(conn, refreshed, BACKTESTED)

    record_agent_event(
        settings,
        event_type="rule_discovery.lite_backtest_completed",
        status="completed",
        title="Lite backtest completed",
        input_summary={"candidate_id": candidate_id, "start": start, "end": end},
        output_summary={
            "candidate_id": candidate_id,
            "report_id": report_id,
            "decision": recommended_decision,
            "sample_size": metrics["sample_size"],
            "candidate_status": BACKTESTED,
        },
        symbol=candidate.symbols[0] if candidate.symbols else None,
    )

    return {
        "candidate_id": candidate_id,
        "latest_report_id": report_id,
        "sample_size": metrics["sample_size"],
        "win_rate": metrics["win_rate"],
        "avg_return": metrics["avg_return"],
        "median_return": metrics["median_return"],
        "max_adverse_excursion": metrics["max_adverse_excursion"],
        "max_favorable_excursion": metrics["max_favorable_excursion"],
        "cost_model": DEFAULT_COST_MODEL,
        "evidence_gaps": gaps,
        "quality_flags": quality_flags,
        "failure_cases": failure_cases,
        "candidate_status": BACKTESTED,
        "decision": recommended_decision,
        "reason": reason,
        "next_review_trigger": report_payload["next_review_trigger"],
        "trigger_logic": coerce_json_value(report_payload["trigger_logic"]),
        "entry_logic": coerce_json_value(report_payload["entry_logic"]),
    }


def advance_backtested_candidate(
    settings: Settings,
    candidate_id: str,
    decision: str,
) -> dict[str, Any]:
    if decision not in TERMINAL_REVIEW_STATES:
        raise InvalidCandidateTransitionError(f"Unsupported terminal decision: {decision}")

    engine = create_sqlite_engine(settings)
    with engine.begin() as conn:
        row = (
            conn.execute(select(rule_candidates).where(rule_candidates.c.id == candidate_id))
            .mappings()
            .one_or_none()
        )
        if row is None:
            raise ValueError(f"Rule candidate not found: {candidate_id}")
        candidate = _candidate_from_row(row)
        _update_candidate_status(conn, candidate, decision)

    record_agent_event(
        settings,
        event_type="rule_discovery.candidate_advanced",
        status="completed",
        title="Backtested rule candidate advanced",
        input_summary={"candidate_id": candidate_id, "decision": decision},
        output_summary={"candidate_id": candidate_id, "status": decision},
        symbol=candidate.symbols[0] if candidate.symbols else None,
    )
    return {"candidate_id": candidate_id, "status": decision}


def _hypothesis_from_event(event: Any) -> str:
    setup_hint = event["setup_hint"] or "semantic_event_rule"
    thesis = event["thesis"] or ""
    return f"{setup_hint}: {thesis[:240]}"


def _serialize_candidate_row(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "source": row["source"],
        "source_ref": coerce_json_value(row["source_ref"], {}),
        "hypothesis": row["hypothesis"],
        "symbols": list(coerce_json_value(row["symbols"], [])),
        "trigger_definition": row["trigger_definition"],
        "entry_condition": row["entry_condition"],
        "exit_condition": row["exit_condition"],
        "invalidation": row["invalidation"],
        "data_requirements": list(coerce_json_value(row["data_requirements"], [])),
        "risk_notes": coerce_json_value(row["risk_notes"]),
        "status": row["status"],
        "confidence": float(row["confidence"]) if row["confidence"] is not None else None,
        "created_by": row["created_by"],
        "latest_report_id": row["latest_report_id"],
    }


def _serialize_lite_backtest_report_row(row: Any) -> dict[str, Any]:
    quality_flags = coerce_json_value(row["quality_flags"], {})
    return {
        "id": row["id"],
        "candidate_id": row["candidate_id"],
        "created_at": row["created_at"],
        "data_window_start": row["data_window_start"],
        "data_window_end": row["data_window_end"],
        "sample_size": row["sample_size"],
        "trigger_logic": coerce_json_value(row["trigger_logic"], {}),
        "entry_logic": coerce_json_value(row["entry_logic"], {}),
        "exit_logic": coerce_json_value(row["exit_logic"]),
        "invalidation_logic": coerce_json_value(row["invalidation_logic"], {}),
        "win_rate": float(row["win_rate"]) if row["win_rate"] is not None else None,
        "avg_return": float(row["avg_return"]) if row["avg_return"] is not None else None,
        "median_return": float(row["median_return"]) if row["median_return"] is not None else None,
        "max_adverse_excursion": (
            float(row["max_adverse_excursion"])
            if row["max_adverse_excursion"] is not None
            else None
        ),
        "max_favorable_excursion": (
            float(row["max_favorable_excursion"])
            if row["max_favorable_excursion"] is not None
            else None
        ),
        "cost_model": coerce_json_value(row["cost_model"], {}),
        "spread_assumption": row["spread_assumption"],
        "slippage_assumption": row["slippage_assumption"],
        "evidence_gaps": list(coerce_json_value(row["evidence_gaps"], [])),
        "quality_flags": quality_flags.get("flags", quality_flags),
        "failure_cases": quality_flags.get("failure_cases", []),
        "decision": row["decision"],
        "reason": row["reason"],
        "next_review_trigger": row["next_review_trigger"],
    }


def _require_text(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Manual rule candidate requires {key}")
    return value.strip()


def _load_candidate(settings: Settings, candidate_id: str) -> Candidate:
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        row = conn.execute(select(rule_candidates).where(rule_candidates.c.id == candidate_id))
        mapping = row.mappings().one_or_none()
    if mapping is None:
        raise ValueError(f"Rule candidate not found: {candidate_id}")
    return _candidate_from_row(mapping)


def _candidate_from_row(row: Any) -> Candidate:
    return Candidate(
        id=row["id"],
        status=row["status"],
        symbols=list(coerce_json_value(row["symbols"], [])),
        data_requirements=list(coerce_json_value(row["data_requirements"], [])),
        latest_report_id=row["latest_report_id"],
        trigger_definition=row["trigger_definition"],
        entry_condition=row["entry_condition"],
        invalidation=row["invalidation"],
    )


def _replace_candidate_status(candidate: Candidate, status: str) -> Candidate:
    return Candidate(
        id=candidate.id,
        status=status,
        symbols=candidate.symbols,
        data_requirements=candidate.data_requirements,
        latest_report_id=candidate.latest_report_id,
        trigger_definition=candidate.trigger_definition,
        entry_condition=candidate.entry_condition,
        invalidation=candidate.invalidation,
    )


def _update_candidate_status(conn: Any, candidate: Candidate, next_status: str) -> None:
    if next_status in REPORT_REQUIRED_STATES:
        if not candidate.latest_report_id:
            raise InvalidCandidateTransitionError(
                f"{next_status} requires a stored lite_backtest_report"
            )
        report_exists = conn.execute(
            select(lite_backtest_reports.c.id).where(
                lite_backtest_reports.c.id == candidate.latest_report_id,
                lite_backtest_reports.c.candidate_id == candidate.id,
            )
        ).scalar_one_or_none()
        if report_exists is None:
            raise InvalidCandidateTransitionError(
                f"{next_status} requires a stored lite_backtest_report"
            )
    if next_status == candidate.status:
        raise InvalidCandidateTransitionError(
            f"Rule candidate status is already {next_status}"
        )
    if next_status not in ALLOWED_STATUS_TRANSITIONS.get(candidate.status, set()):
        raise InvalidCandidateTransitionError(
            f"Invalid rule candidate status transition: {candidate.status} -> {next_status}"
        )
    conn.execute(
        update(rule_candidates)
        .where(rule_candidates.c.id == candidate.id)
        .values(status=next_status, updated_at=utc_now_iso())
    )


def _gap(requirement: dict[str, Any], symbol: str, reason: str) -> dict[str, str]:
    return {
        "provider_capability": str(requirement.get("provider_capability")),
        "reason": reason,
        "requirement_type": str(requirement.get("requirement_type")),
        "symbol": symbol,
    }


def _requirement_row(
    candidate_id: str,
    requirement: dict[str, Any],
    *,
    gap: dict[str, str] | None = None,
    status: str = "gap",
    evidence_refs: list[dict[str, Any]] | None = None,
    symbol: str | None = None,
) -> dict[str, Any]:
    query_scope = {"symbol": symbol or (gap or {}).get("symbol")}
    return {
        "id": str(uuid4()),
        "candidate_id": candidate_id,
        "created_at": utc_now_iso(),
        "requirement_type": requirement["requirement_type"],
        "provider_capability": requirement["provider_capability"],
        "query_scope": serialize_json_field(query_scope),
        "required_quality": serialize_json_field(requirement.get("required_quality")),
        "status": status if gap is None else "gap",
        "evidence_refs": serialize_json_field(evidence_refs or []),
        "gap_reason": None if gap is None else gap["reason"],
    }


def _stored_evidence_gaps(settings: Settings, candidate_id: str) -> list[dict[str, str]]:
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        rows = conn.execute(
            select(rule_candidate_evidence_requirements).where(
                rule_candidate_evidence_requirements.c.candidate_id == candidate_id,
                rule_candidate_evidence_requirements.c.status == "gap",
            )
        ).mappings().all()
    return [
        {
            "provider_capability": row["provider_capability"],
            "reason": row["gap_reason"],
            "requirement_type": row["requirement_type"],
            "symbol": coerce_json_value(row["query_scope"], {}).get("symbol"),
        }
        for row in rows
    ]


def _backtest_symbol(bars: list[LocalEvidence]) -> list[dict[str, float]]:
    ordered = sorted(bars, key=lambda bar: bar.timestamp)
    trades: list[dict[str, float]] = []
    for index in range(1, len(ordered) - 1):
        previous_close = float(ordered[index - 1].payload["close"])
        trigger_close = float(ordered[index].payload["close"])
        trigger_return = (trigger_close - previous_close) / previous_close
        if trigger_return > DROP_THRESHOLD:
            continue

        future_bars = ordered[index + 1 :]
        entry_bar = future_bars[0]
        entry_price = float(entry_bar.payload["open"])
        final_price = float(future_bars[-1].payload["close"])
        high_after_entry = max(float(bar.payload["high"]) for bar in future_bars)
        low_after_entry = min(float(bar.payload["low"]) for bar in future_bars)
        trades.append(
            {
                "return": _net_return(entry_price, final_price),
                "mae": (low_after_entry - entry_price) / entry_price,
                "mfe": (high_after_entry - entry_price) / entry_price,
            }
        )
    return trades


def _net_return(entry_price: float, final_price: float) -> float:
    gross_return = (final_price - entry_price) / entry_price
    cost = (DEFAULT_COST_MODEL["spread_bps"] + DEFAULT_COST_MODEL["slippage_bps"]) / 10000
    return gross_return - cost


def _calculate_metrics(trades: list[dict[str, float]]) -> dict[str, Any]:
    returns = [trade["return"] for trade in trades]
    maes = [trade["mae"] for trade in trades]
    mfes = [trade["mfe"] for trade in trades]
    sample_size = len(trades)
    return {
        "sample_size": sample_size,
        "win_rate": None if not returns else sum(1 for value in returns if value > 0) / sample_size,
        "avg_return": None if not returns else sum(returns) / sample_size,
        "median_return": None if not returns else median(returns),
        "max_adverse_excursion": None if not maes else min(maes),
        "max_favorable_excursion": None if not mfes else max(mfes),
    }


def _quality_flags(sample_size: int, evidence_gaps: list[dict[str, str]]) -> list[str]:
    flags = []
    if sample_size == 0:
        flags.append("no_triggers")
    if sample_size < 20:
        flags.append("small_sample")
    if evidence_gaps:
        flags.append("evidence_gaps_present")
    return flags


def _failure_cases(trades: list[dict[str, float]]) -> list[dict[str, Any]]:
    return [
        {
            "case_index": index,
            "return": trade["return"],
            "mae": trade["mae"],
            "reason": "non_positive_after_costs",
        }
        for index, trade in enumerate(trades)
        if trade["return"] <= 0
    ]


def _decision(metrics: dict[str, Any], quality_flags: list[str]) -> tuple[str, str]:
    if "no_triggers" in quality_flags:
        return NEEDS_MORE_DATA, "No qualifying trigger was found in local fixture bars."
    if metrics["avg_return"] is not None and metrics["avg_return"] < -0.02:
        return REJECTED, "Local fixture return was materially negative after costs."
    if "small_sample" in quality_flags:
        return NEEDS_MORE_DATA, "Local fixture sample is too small for shadow tracking."
    if metrics["win_rate"] is not None and metrics["win_rate"] >= 0.55:
        return PENDING_SHADOW_TRACKING, "Local fixture evidence supports shadow tracking review."
    return NEEDS_MORE_DATA, "Local fixture evidence is inconclusive."


def _next_review_trigger(decision: str) -> str:
    if decision == REJECTED:
        return "Reopen only if a materially different local sample window is added."
    if decision == PENDING_SHADOW_TRACKING:
        return "Human review can decide whether to start non-executing shadow tracking."
    return "Add at least 20 local post-trigger samples before reconsidering."
