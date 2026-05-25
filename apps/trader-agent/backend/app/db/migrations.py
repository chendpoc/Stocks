from __future__ import annotations

from app.core.config import Settings
from app.db.models import metadata
from app.db.session import create_sqlite_engine


def bootstrap_data_dirs(settings: Settings) -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    for child in ("raw", "fixtures", "audit"):
        (settings.data_dir / child).mkdir(parents=True, exist_ok=True)


def bootstrap_database(settings: Settings) -> None:
    bootstrap_data_dirs(settings)
    engine = create_sqlite_engine(settings)
    metadata.create_all(engine)
