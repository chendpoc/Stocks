from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from typing import Any

from app.modules._json import dumps, loads

"""Shared SQLite TEXT JSON column encode/decode for raw-SQL row dicts.

Callers persisting JSON-in-TEXT columns should use this module instead of
``app.modules._json.dumps`` / ``loads`` directly. Low-level ``dumps``/``loads``
remain on ``_json`` for non-row helpers (e.g. ``json_array_contains``) and as
the canonical serializer used here.
"""


def coerce_json_value(value: Any, default: Any = None) -> Any:
    """Decode one value that may already be parsed or still be SQLite TEXT."""
    if isinstance(value, str):
        return loads(value, default)
    if value is None:
        return default
    return value


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


def canonical_json_text(value: Any) -> str:
    """Stable JSON text for equality checks (e.g. immutable field conflict detection)."""
    if isinstance(value, str):
        try:
            value = loads(value)
        except Exception:
            return value
    return json.dumps(value, sort_keys=True, separators=(",", ":"))
