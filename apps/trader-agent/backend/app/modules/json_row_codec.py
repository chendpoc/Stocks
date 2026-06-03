from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from app.modules._json import dumps, loads

"""Shared SQLite TEXT JSON column encode/decode for raw-SQL row dicts."""


def serialize_json_field(value: Any) -> str:
    """Write path: one domain JSON value → canonical TEXT for SQLite."""
    return dumps(value)


def serialize_json_field_optional(value: Any) -> str | None:
    """Write path for nullable JSON columns."""
    if value is None:
        return None
    return dumps(value)


def deserialize_json_fields_in_row(
    row: dict[str, Any],
    field_names: Iterable[str],
    *,
    default: Any = None,
    defaults: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Read path: decode listed TEXT columns on a row copy (idempotent if already parsed)."""
    field_defaults = defaults or {}
    payload = dict(row)
    for field_name in field_names:
        if field_name not in payload or payload[field_name] is None:
            continue
        value = payload[field_name]
        if isinstance(value, str):
            payload[field_name] = loads(
                value,
                default=field_defaults.get(field_name, default),
            )
    return payload


def serialize_json_fields_in_row(
    row: dict[str, Any],
    field_names: Iterable[str],
) -> dict[str, Any]:
    """Write path: encode listed fields on a row copy before INSERT/UPDATE."""
    payload = dict(row)
    for field_name in field_names:
        if field_name in payload and payload[field_name] is not None:
            payload[field_name] = dumps(payload[field_name])
    return payload
