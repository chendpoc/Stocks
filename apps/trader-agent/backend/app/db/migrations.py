from __future__ import annotations

from sqlalchemy import text

from app.core.config import Settings
from app.db.models import metadata
from app.db.session import create_sqlite_engine

# Incremental patches for existing SQLite databases. metadata.create_all() only
# creates missing tables; it does not ALTER existing tables when columns are added.
_SCHEMA_COLUMN_PATCHES: tuple[tuple[str, str, str], ...] = (
    ("memory_candidates", "tags_json", "TEXT"),
    ("memory_items", "review_flags_json", "TEXT"),
)


def bootstrap_data_dirs(settings: Settings) -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    for child in ("raw", "fixtures", "audit"):
        (settings.data_dir / child).mkdir(parents=True, exist_ok=True)


def _table_exists(conn, table_name: str) -> bool:
    row = conn.execute(
        text(
            "SELECT 1 FROM sqlite_master "
            "WHERE type = 'table' AND name = :table_name LIMIT 1"
        ),
        {"table_name": table_name},
    ).first()
    return row is not None


def _existing_columns(conn, table_name: str) -> set[str]:
    rows = conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
    return {row[1] for row in rows}


def _apply_schema_column_patches(engine) -> None:
    with engine.begin() as conn:
        for table_name, column_name, column_type in _SCHEMA_COLUMN_PATCHES:
            if not _table_exists(conn, table_name):
                continue
            if column_name in _existing_columns(conn, table_name):
                continue
            conn.execute(
                text(
                    f"ALTER TABLE {table_name} "
                    f"ADD COLUMN {column_name} {column_type}"
                )
            )


def bootstrap_database(settings: Settings) -> None:
    bootstrap_data_dirs(settings)
    engine = create_sqlite_engine(settings)
    metadata.create_all(engine)
    _apply_schema_column_patches(engine)
