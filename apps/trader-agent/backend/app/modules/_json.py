from __future__ import annotations

"""Low-level JSON helpers.

``dumps`` / ``loads`` are implementation details for ``json_row_codec`` and legacy
call sites. New SQLite ``*_json`` TEXT column I/O should use ``json_row_codec``
instead of importing ``dumps`` / ``loads`` from this module.
"""

import json
from typing import Any


def dumps(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def loads(value: str | None, default: Any = None) -> Any:
    if value is None:
        return default
    return json.loads(value)


def json_array_like_pattern(value: str) -> str:
    """Build a LIKE pattern for JSON array columns storing string elements."""
    return f'%"{value}"%'


def json_array_contains(column, value: str):
    """SQLAlchemy filter: JSON array column contains `value` as an element."""
    return column.like(json_array_like_pattern(value))
