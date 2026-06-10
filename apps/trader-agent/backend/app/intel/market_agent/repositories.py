from __future__ import annotations

from dataclasses import asdict, fields
from typing import Any

from sqlalchemy import text

from app.core.time import utc_now_iso
from app.intel.market_agent.schemas import (
    FailureMemory,
    FeatureSnapshot,
    ModelDecisionRecord,
    PatternMemory,
    SetupEvent,
    SessionContextPack,
)
from app.modules.json_row_codec import serialize_json_fields_in_row


class MarketAgentConflictError(ValueError):
    """Raised when a duplicate id payload conflicts with existing immutable fields."""


def _fetch_one(conn, sql: str, params: dict[str, Any]) -> dict[str, Any] | None:
    row = conn.execute(text(sql), params).mappings().fetchone()
    return dict(row) if row else None


def _normalize_symbol(value: str | None) -> str | None:
    if value is None:
        return None
    return value.upper()


def _normalize_filter_value(value: str) -> str:
    return str(value).strip().lower()


def _json_text_or_null(column: str, path: str) -> str:
    return f"NULLIF(TRIM(CAST(json_extract({column}, '{path}') AS TEXT)), '')"


def _normalized_json_value(default: str, *json_exprs: str) -> str:
    values = ", ".join(json_exprs + (f"'{default}'",))
    return f"LOWER(TRIM(COALESCE({values})))"


def _payload_from_model(model: object) -> dict[str, Any]:
    payload = asdict(model)
    normalized_symbol = _normalize_symbol(payload.get("symbol"))
    if normalized_symbol is not None:
        payload["symbol"] = normalized_symbol
    return payload


def _model_matches(existing: dict[str, Any], model, schema_cls, *, ignore_fields: frozenset[str]) -> bool:
    typed_existing = schema_cls.from_db_row(existing)
    incoming = schema_cls(**_payload_from_model(model))
    for field in fields(schema_cls):
        name = field.name
        if name in ignore_fields:
            continue
        if getattr(typed_existing, name) != getattr(incoming, name):
            return False
    return True


def _create_record(
    engine,
    table: str,
    id_field: str,
    model,
    schema_cls,
    *, 
    json_fields: tuple[str, ...],
    now_field: str = "created_at",
) -> Any:
    now = utc_now_iso()
    payload = _payload_from_model(model)
    if payload.get(now_field) is None:
        payload[now_field] = now
    select_sql = f"SELECT * FROM {table} WHERE {id_field} = :{id_field}"
    with engine.begin() as conn:
        existing = _fetch_one(conn, select_sql, {id_field: payload[id_field]})
        if existing is not None:
            if not _model_matches(existing, model, schema_cls, ignore_fields=frozenset({now_field})):
                raise MarketAgentConflictError(f"{table}:{payload[id_field]} payload conflict")
            return schema_cls.from_db_row(existing)

        serialized = serialize_json_fields_in_row(payload, json_fields)
        columns = ", ".join(serialized.keys())
        values = ", ".join(f":{name}" for name in serialized.keys())
        conn.execute(text(f"INSERT INTO {table} ({columns}) VALUES ({values})"), serialized)
        created = _fetch_one(conn, select_sql, {id_field: payload[id_field]})
    assert created is not None
    return schema_cls.from_db_row(created)


def _list_records(
    engine,
    table: str,
    schema_cls,
    clauses: list[str],
    params: dict[str, Any],
    *,
    limit: int = 50,
) -> list[Any]:
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with engine.connect() as conn:
        rows = (
            conn.execute(
                text(f"SELECT * FROM {table} {where} ORDER BY created_at DESC LIMIT :limit"),
                {**params, "limit": limit},
            )
            .mappings()
            .all()
        )
    return [schema_cls.from_db_row(dict(row)) for row in rows]


def create_feature_snapshot(engine, snapshot: FeatureSnapshot) -> FeatureSnapshot:
    return _create_record(
        engine=engine,
        table="feature_snapshots",
        id_field="feature_snapshot_id",
        model=snapshot,
        schema_cls=FeatureSnapshot,
        json_fields=FeatureSnapshot.__json_fields__,
    )


def list_feature_snapshots(
    engine,
    *,
    symbol: str | None = None,
    timeframe: str | None = None,
    limit: int = 50,
) -> list[FeatureSnapshot]:
    clauses: list[str] = []
    params: dict[str, Any] = {"limit": limit}
    if symbol:
        clauses.append("symbol = :symbol")
        params["symbol"] = _normalize_symbol(symbol)
    if timeframe:
        clauses.append("timeframe = :timeframe")
        params["timeframe"] = timeframe
    return _list_records(
        engine,
        "feature_snapshots",
        FeatureSnapshot,
        clauses,
        params,
        limit=limit,
    )


def create_setup_event(engine, event: SetupEvent) -> SetupEvent:
    return _create_record(
        engine=engine,
        table="setup_events",
        id_field="setup_event_id",
        model=event,
        schema_cls=SetupEvent,
        json_fields=SetupEvent.__json_fields__,
    )


def list_setup_events(
    engine,
    *,
    symbol: str | None = None,
    event_type: str | None = None,
    limit: int = 50,
) -> list[SetupEvent]:
    clauses: list[str] = []
    params: dict[str, Any] = {"limit": limit}
    if symbol:
        clauses.append("symbol = :symbol")
        params["symbol"] = _normalize_symbol(symbol)
    if event_type:
        clauses.append("event_type = :event_type")
        params["event_type"] = event_type
    return _list_records(
        engine,
        "setup_events",
        SetupEvent,
        clauses,
        params,
        limit=limit,
    )


def create_pattern_memory(engine, memory: PatternMemory) -> PatternMemory:
    return _create_record(
        engine=engine,
        table="pattern_memories",
        id_field="pattern_memory_id",
        model=memory,
        schema_cls=PatternMemory,
        json_fields=PatternMemory.__json_fields__,
    )


def list_pattern_memories(
    engine,
    *,
    symbol: str | None = None,
    pattern_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
    latest_per_pattern: bool = False,
) -> list[PatternMemory]:
    clauses: list[str] = []
    params: dict[str, Any] = {"limit": limit}
    if symbol:
        clauses.append("symbol = :symbol")
        params["symbol"] = _normalize_symbol(symbol)
    if pattern_id:
        clauses.append("pattern_id = :pattern_id")
        params["pattern_id"] = pattern_id
    if status:
        clauses.append(f"{_normalized_json_value('active', _json_text_or_null('memory_json', '$.status'))} = :status")
        params["status"] = _normalize_filter_value(status)
    if not latest_per_pattern:
        return _list_records(
            engine,
            "pattern_memories",
            PatternMemory,
            clauses,
            params,
            limit=limit,
        )

    latest_clauses = list(clauses)
    latest_where = f"WHERE {' AND '.join(latest_clauses)}" if latest_clauses else ""
    outer_clauses = [
        "pm.pattern_memory_id IN ("
        "SELECT pm2.pattern_memory_id FROM pattern_memories pm2 "
        "INNER JOIN ("
        "SELECT pattern_id, MAX(created_at) AS max_created_at "
        f"FROM pattern_memories {latest_where} "
        "GROUP BY pattern_id"
        ") latest ON pm2.pattern_id = latest.pattern_id "
        "AND pm2.created_at = latest.max_created_at"
        ")"
    ]
    if symbol:
        outer_clauses.append("pm.symbol = :symbol")
    if pattern_id:
        outer_clauses.append("pm.pattern_id = :pattern_id")
    if status:
        outer_clauses.append(
            f"{_normalized_json_value('active', _json_text_or_null('pm.memory_json', '$.status'))} = :status"
        )
    where = f"WHERE {' AND '.join(outer_clauses)}"
    with engine.connect() as conn:
        rows = (
            conn.execute(
                text(
                    f"""
                    SELECT pm.*
                    FROM pattern_memories pm
                    {where}
                    ORDER BY pm.created_at DESC
                    LIMIT :limit
                    """
                ),
                params,
            )
            .mappings()
            .all()
        )
    return [PatternMemory.from_db_row(dict(row)) for row in rows]


def create_failure_memory(engine, memory: FailureMemory) -> FailureMemory:
    return _create_record(
        engine=engine,
        table="failure_memories",
        id_field="failure_memory_id",
        model=memory,
        schema_cls=FailureMemory,
        json_fields=FailureMemory.__json_fields__,
    )


def list_failure_memories(
    engine,
    *,
    symbol: str | None = None,
    failure_type: str | None = None,
    status_values: tuple[str, ...] | None = None,
    setup_name: str | None = None,
    limit: int = 50,
) -> list[FailureMemory]:
    clauses: list[str] = []
    params: dict[str, Any] = {"limit": limit}
    if symbol:
        clauses.append("symbol = :symbol")
        params["symbol"] = _normalize_symbol(symbol)
    if failure_type:
        clauses.append("failure_type = :failure_type")
        params["failure_type"] = failure_type
    status_expr = _normalized_json_value(
        "active",
        _json_text_or_null("failure_json", "$.status"),
        _json_text_or_null("context_json", "$.status"),
    )
    if status_values:
        status_params: list[str] = []
        for index, value in enumerate(status_values):
            key = f"status_{index}"
            status_params.append(f":{key}")
            params[key] = _normalize_filter_value(value)
        clauses.append(f"{status_expr} IN ({', '.join(status_params)})")
    if setup_name:
        setup_expr = _normalized_json_value(
            "",
            _json_text_or_null("failure_json", "$.setup_name"),
            _json_text_or_null("context_json", "$.setup_name"),
        )
        clauses.append(f"{setup_expr} = :setup_name")
        params["setup_name"] = _normalize_filter_value(setup_name)
    return _list_records(
        engine,
        "failure_memories",
        FailureMemory,
        clauses,
        params,
        limit=limit,
    )


def create_session_context_pack(engine, pack: SessionContextPack) -> SessionContextPack:
    return _create_record(
        engine=engine,
        table="session_context_packs",
        id_field="session_context_pack_id",
        model=pack,
        schema_cls=SessionContextPack,
        json_fields=SessionContextPack.__json_fields__,
    )


def list_session_context_packs(
    engine,
    *,
    session_id: str | None = None,
    symbol: str | None = None,
    limit: int = 50,
) -> list[SessionContextPack]:
    clauses: list[str] = []
    params: dict[str, Any] = {"limit": limit}
    if session_id:
        clauses.append("session_id = :session_id")
        params["session_id"] = session_id
    if symbol:
        clauses.append("symbol = :symbol")
        params["symbol"] = _normalize_symbol(symbol)
    return _list_records(
        engine,
        "session_context_packs",
        SessionContextPack,
        clauses,
        params,
        limit=limit,
    )


def create_model_decision(
    engine,
    decision: ModelDecisionRecord,
) -> ModelDecisionRecord:
    return _create_record(
        engine=engine,
        table="model_decisions",
        id_field="decision_id",
        model=decision,
        schema_cls=ModelDecisionRecord,
        json_fields=ModelDecisionRecord.__json_fields__,
    )
