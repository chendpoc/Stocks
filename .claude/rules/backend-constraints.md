---
paths: "apps/trader-agent/backend/app/**/*.py"
---

# Backend constraints

Load when working with `apps/trader-agent/backend/app/**/*.py`.

## FTS5

- `document_sections_fts` and `document_chunks_fts` are FTS5 virtual tables created with raw SQL `CREATE VIRTUAL TABLE IF NOT EXISTS`. Do NOT add them as SQLAlchemy `Table()` in `models.py` — `metadata.create_all()` cannot handle virtual tables.

## DB

- `bootstrap_database(settings)` calls `metadata.create_all(engine)` — new `Table()` in `models.py` auto-creates. No migration script needed.
- Always use `create_sqlite_engine(settings)` from `db/session.py`.
- Shared column helpers in `models.py`: `uuid_column(n)`, `timestamp_column(n)`, `json_column(n)`.

## Events

- `record_agent_event(settings, event_type=..., status=..., input_summary=..., error=...)` — writes to `agent_events`. Call AFTER DB transaction closes. Never inside `engine.begin()`.
- Canonical event registry: `docs/.../07-audit-and-rebuild-workflow.md`. Never invent event names.

## Forbidden modules (never modify)

- `document_indexer.py` — old paragraph indexer
- `local_search.py` — old search backed by document_chunks
- `knowledge_source_registry.py` — old source registry
- These exist for backward compatibility. Route new features through M1+ modules instead.

## Forbidden tables (never alter)

- `document_chunks` and `document_chunks_fts` — old paragraph search. Do not drop, rename, or modify.

## Testing

- `.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/<file>.py -v --tb=short`
- `.venv/Scripts/python.exe -m ruff check apps/trader-agent/backend/app/<path>.py`
- Use `bootstrap_database(settings)` for test DB setup, `create_sqlite_engine(settings)` for verification queries.
