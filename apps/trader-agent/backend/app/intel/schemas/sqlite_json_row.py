from __future__ import annotations

from typing import Any, ClassVar

from pydantic import BaseModel, model_validator

from app.modules.json_row_codec import deserialize_json_fields_in_row


class SqliteJsonRowModel(BaseModel):
    """Base for Stage1 API rows stored with JSON-in-TEXT columns."""

    __sqlite_json_fields__: ClassVar[tuple[str, ...]] = ()
    __sqlite_json_defaults__: ClassVar[dict[str, Any]] = {}

    @model_validator(mode="before")
    @classmethod
    def _decode_sqlite_json_columns(cls, data: Any) -> Any:
        if isinstance(data, dict) and cls.__sqlite_json_fields__:
            return deserialize_json_fields_in_row(
                data,
                cls.__sqlite_json_fields__,
                defaults=cls.__sqlite_json_defaults__,
            )
        return data

    @classmethod
    def from_db_row(cls, row: dict[str, Any] | None):
        if not row:
            raise ValueError(f"{cls.__name__} row is missing")
        return cls.model_validate(row)
