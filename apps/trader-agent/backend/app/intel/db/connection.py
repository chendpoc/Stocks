from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine

from app.core.config import Settings

_override_path: Path | None = None


def set_intel_db_path(path: Path) -> None:
    global _override_path
    _override_path = path


def get_intel_db_path(settings: Settings | None = None) -> Path:
    if _override_path is not None:
        return _override_path
    if settings is not None:
        return settings.repo_root / "data" / "market_intel.db"
    return Path("data/market_intel.db")


def get_intel_engine(settings: Settings | None = None) -> Engine:
    db_path = get_intel_db_path(settings)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite:///{db_path.as_posix()}", echo=False)

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record) -> None:
        del connection_record
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

    return engine
