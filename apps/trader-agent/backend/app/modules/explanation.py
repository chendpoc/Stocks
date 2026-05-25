from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.core.config import Settings
from app.db.migrations import bootstrap_database
from app.db.models import agent_events, signals
from app.db.session import create_sqlite_engine
from app.modules import _json

FORBIDDEN_UI_PHRASES = (
    "automatic buy",
    "automatic sell",
    "place order",
    "execute trade",
    "ticket_ready",
)


def build_signal_explanation(settings: Settings, signal_id: str) -> dict[str, Any] | None:
    bootstrap_database(settings)
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        signal_row = (
            conn.execute(select(signals).where(signals.c.id == signal_id)).mappings().first()
        )
        if signal_row is None:
            return None
        event_rows = (
            conn.execute(
                select(agent_events)
                .where(agent_events.c.signal_id == signal_id)
                .order_by(agent_events.c.timestamp, agent_events.c.id)
            )
            .mappings()
            .all()
        )

    signal_payload = dict(signal_row)
    evidence = _as_dict(_json.loads(signal_payload.get("evidence"), {}))
    risk_flags = _sanitize_json(_as_list(_json.loads(signal_payload.get("risk_flags"), [])))
    rule_hits = _rule_hits(evidence)
    missing_evidence = _missing_evidence(signal_payload, evidence, rule_hits)
    missing_conditions = _missing_rule_conditions(rule_hits)
    status = _safe_text(signal_payload.get("status")) or "missing"
    trigger = _field_or_missing(signal_payload.get("entry_trigger"), "entry_trigger")
    invalidation = _field_or_missing(signal_payload.get("invalidation"), "invalidation")

    return {
        "signal_id": _safe_text(signal_payload.get("id")),
        "symbol": _safe_text(signal_payload.get("symbol")),
        "setup_type": _safe_text(signal_payload.get("setup_type")),
        "status": status,
        "current_status": status,
        "conclusion": _conclusion(
            status,
            trigger,
            invalidation,
            missing_conditions,
            missing_evidence,
        ),
        "reason": _reason(status, evidence, rule_hits, missing_evidence),
        "trigger": trigger,
        "invalidation": invalidation,
        "evidence_timeline": [_serialize_event(row) for row in event_rows],
        "rule_hits": rule_hits,
        "risk_blocks": _risk_blocks(risk_flags),
        "risk_flags": risk_flags,
        "missing_conditions": missing_conditions,
        "missing_evidence": missing_evidence,
        "next_human_decision_point": _next_human_decision_point(
            status,
            trigger,
            invalidation,
            missing_conditions,
            missing_evidence,
        ),
        "actions": [
            {
                "id": "open_signal",
                "label": "Open signal",
                "type": "navigation",
                "signal_id": _safe_text(signal_payload.get("id")),
            },
            {
                "id": "view_evidence",
                "label": "View evidence",
                "type": "navigation",
                "signal_id": _safe_text(signal_payload.get("id")),
            },
        ],
    }


def _missing_evidence(
    signal_payload: dict[str, Any],
    evidence: dict[str, Any],
    rule_hits: list[dict[str, Any]],
) -> list[str]:
    missing: list[str] = []
    if not signal_payload.get("entry_trigger"):
        missing.append("entry_trigger")
    if not signal_payload.get("invalidation"):
        missing.append("invalidation")
    if not isinstance(evidence.get("candidate"), dict):
        missing.append("evidence.candidate")
    if not isinstance(evidence.get("rule"), dict):
        missing.append("evidence.rule")
    elif not _has_persisted_rule_conditions(evidence):
        missing.append("evidence.rule.evidence.condition_results")
    if not isinstance(evidence.get("snapshot"), dict):
        missing.append("evidence.snapshot")
    if signal_payload.get("status") == "invalidated" and not any(
        item.get("passed") is False for item in rule_hits
    ):
        missing.append("rule.failed_condition")
    return missing


def _missing_rule_conditions(rule_hits: list[dict[str, Any]]) -> list[str]:
    return [
        str(item["name"])
        for item in rule_hits
        if item.get("status") not in {None, "confirmed"} or item.get("passed") is False
    ]


def _risk_blocks(risk_flags: list[Any]) -> list[Any]:
    return [
        flag
        for flag in risk_flags
        if isinstance(flag, dict) and _safe_text(flag.get("severity")) == "block"
    ]


def _has_persisted_rule_conditions(evidence: dict[str, Any]) -> bool:
    rule = _as_dict(evidence.get("rule"))
    rule_evidence = _as_dict(rule.get("evidence"))
    return isinstance(rule_evidence.get("condition_results"), list) or isinstance(
        rule_evidence.get("conditions"), list
    )


def _rule_hits(evidence: dict[str, Any]) -> list[dict[str, Any]]:
    rule = _as_dict(evidence.get("rule"))
    if not rule:
        return []
    rule_evidence = _as_dict(rule.get("evidence"))
    conditions = rule_evidence.get("condition_results")
    if isinstance(conditions, list):
        return [
            _condition_result(item, "evidence.rule.evidence.condition_results")
            for item in conditions
        ]

    conditions = rule_evidence.get("conditions")
    if isinstance(conditions, list):
        return [_condition_result(item, "evidence.rule.evidence.conditions") for item in conditions]

    return []


def _condition_result(value: Any, source: str) -> dict[str, Any]:
    payload = _as_dict(value)
    status = _safe_text(payload.get("status"))
    return {
        "name": _safe_text(payload.get("name") or payload.get("condition")) or "condition",
        "status": status,
        "passed": _condition_passed(payload, status),
        "detail": _safe_text(payload.get("detail") or payload.get("reason")),
        "source": source,
    }


def _condition_passed(payload: dict[str, Any], status: str | None) -> bool | None:
    if isinstance(payload.get("passed"), bool):
        return payload["passed"]
    if status == "confirmed":
        return True
    if status == "failed":
        return False
    return None


def _conclusion(
    status: str,
    trigger: str,
    invalidation: str,
    missing_conditions: list[str],
    missing_evidence: list[str],
) -> str:
    if status == "waiting_trigger":
        return _with_missing_evidence(
            f"Observe only: {trigger} must happen before action consideration.",
            missing_evidence,
        )
    if status == "invalidated":
        return _with_missing_evidence(
            f"Invalidated: {invalidation} is the controlling condition.",
            missing_evidence,
        )
    if missing_conditions:
        return _with_missing_evidence(
            "Observe only: required conditions are still missing.",
            missing_evidence,
        )
    return _with_missing_evidence(
        f"Current status is {status}; review persisted evidence before manual decision.",
        missing_evidence,
    )


def _reason(
    status: str,
    evidence: dict[str, Any],
    rule_hits: list[dict[str, Any]],
    missing_evidence: list[str],
) -> str:
    failed = next((item for item in rule_hits if item.get("passed") is False), None)
    if status == "invalidated" and failed is not None:
        return _with_missing_evidence(
            _safe_text(failed.get("detail")) or "A persisted invalidation condition failed.",
            missing_evidence,
        )
    rule = _as_dict(evidence.get("rule"))
    rule_reason = _safe_text(rule.get("reason"))
    if rule_reason:
        return _with_missing_evidence(rule_reason, missing_evidence)
    if status == "waiting_trigger":
        return _with_missing_evidence(
            "Persisted status is waiting_trigger and no additional rule reason was recorded.",
            missing_evidence,
        )
    return _with_missing_evidence(
        f"Persisted status is {status} and no additional rule reason was recorded.",
        missing_evidence,
    )


def _next_human_decision_point(
    status: str,
    trigger: str,
    invalidation: str,
    missing_conditions: list[str],
    missing_evidence: list[str],
) -> str:
    if status == "waiting_trigger":
        return _with_missing_evidence(
            f"Observe only: {trigger} must happen before action consideration.",
            missing_evidence,
        )
    if status == "invalidated":
        return _with_missing_evidence(
            f"manual review: confirm the failed condition remains valid: {invalidation}.",
            missing_evidence,
        )
    if missing_conditions:
        return _with_missing_evidence(
            "Observe only: required conditions must be confirmed before action consideration.",
            missing_evidence,
        )
    return _with_missing_evidence(
        "manual review: inspect persisted evidence and decide whether continued observation is "
        "warranted.",
        missing_evidence,
    )


def _with_missing_evidence(text: str, missing_evidence: list[str]) -> str:
    if not missing_evidence:
        return text
    return f"{text} Missing persisted evidence: {', '.join(missing_evidence)}."


def _field_or_missing(value: Any, field_name: str) -> str:
    text = _safe_text(value)
    if text:
        return text
    return f"Missing persisted {field_name} evidence."


def _serialize_event(row: Any) -> dict[str, Any]:
    return {
        "id": _safe_text(row["id"]),
        "timestamp": _safe_text(row["timestamp"]),
        "run_id": _safe_text(row["run_id"]),
        "task_id": _safe_text(row["task_id"]),
        "signal_id": _safe_text(row["signal_id"]),
        "symbol": _safe_text(row["symbol"]),
        "event_type": _safe_text(row["event_type"]),
        "status": _safe_text(row["status"]),
        "title": _safe_text(row["title"]),
        "summary": _safe_text(row["summary"]),
        "input_summary": _as_dict(_sanitize_json(_json.loads(row["input_summary"], {}))),
        "output_summary": _as_dict(_sanitize_json(_json.loads(row["output_summary"], {}))),
        "tool_name": _safe_text(row["tool_name"]),
        "duration_ms": row["duration_ms"],
        "error": _safe_text(row["error"]),
    }


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _safe_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value)
    lowered = text.lower()
    if any(phrase in lowered for phrase in FORBIDDEN_UI_PHRASES):
        return "Persisted text contained UI-restricted execution wording and was redacted."
    return text


def _sanitize_json(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            _safe_text(key) or "redacted_key": _sanitize_json(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_sanitize_json(item) for item in value]
    if isinstance(value, str):
        return _safe_text(value)
    return value
