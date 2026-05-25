from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings


def create_sqlite_engine(settings: Settings) -> Engine:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    return create_engine(f"sqlite:///{settings.database_path.as_posix()}", future=True)


def create_session_factory(settings: Settings) -> sessionmaker[Session]:
    return sessionmaker(bind=create_sqlite_engine(settings), autoflush=False, future=True)


def get_session(settings: Settings) -> Iterator[Session]:
    session_factory = create_session_factory(settings)
    with session_factory() as session:
        yield session
