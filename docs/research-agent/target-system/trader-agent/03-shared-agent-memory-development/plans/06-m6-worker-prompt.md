# M6 Worker Prompt — Audit + Rebuild

Target model: Cursor Composer 2.5
Source plan: [06-m6-audit-rebuild.md](./06-m6-audit-rebuild.md)
Generated: 2026-05-29

---

Implement Shared Agent Memory M6: Audit + Rebuild.

## Goal

Build backup, incremental rebuild, artifact-level rebuild, and evidence revalidation.
No full rebuild. Database corruption is recovered by deleting the database and letting
`bootstrap_database` recreate it, then re-running catalog + index.

## Repository root

D:\workspace\01-products\stock-community-summary

## Context: what already exists

### Modules you will call (do NOT modify these files)

- `artifact_catalog.py` (M0):
  - `build_artifact_catalog(settings, docs_root=None)` → `CatalogResult(discovered, updated, excluded, failed)`
  - Detects hash change → marks `source_artifacts.index_status = "stale"`

- `markdown_section_indexer.py` (M1):
  - `index_markdown_sections(settings)` → `MarkdownSectionIndexResult(indexed_artifacts, indexed_sections, skipped, failed)`
  - Reads `source_artifacts` WHERE `source_type IN ('markdown','generated_summary','prd','engineering_doc')` AND `index_status IN ('pending','stale')`

- `evidence_ref.py` (M3):
  - `EvidenceRef.from_dict(data: dict)` → EvidenceRef
  - `ref.resolve(engine)` → EvidenceRef with updated resolver_status (resolved/stale/unresolved)

- `events.py`:
  - `record_agent_event(settings, event_type=..., status=..., input_summary=..., ...)` — writes to agent_events + optional JSONL mirror

- `migrations.py`:
  - `bootstrap_database(settings)` — `metadata.create_all()` + column patches

### Tables

- `memory_items`: id, evidence_refs_json, status (active/conflicted/deprecated), review_flags_json
- `memory_candidates`: id, evidence_refs_json
- `source_artifacts`: id, path, index_status, content_hash
- `document_sections`: id, artifact_id, section_key, text_digest
- `agent_events`: id, event_type, status, input_summary

### Settings

- `settings.repo_root`: Path — repo root
- `settings.data_dir`: Path — `data/trader-agent/`
- `settings.database_path`: Path — path to the SQLite file
- Config class is in `app/core/config.py`

## Confirmed decisions

1. **Backup**: `POST /api/knowledge/backup` — manual trigger. Copy sqlite + jsonl to `data/trader-agent/backups/`.
2. **No full rebuild**: Database corruption → delete sqlite, `bootstrap_database` recreates, re-run catalog+index.
3. **Evidence revalidation**: After any rebuild, scan `memory_items` evidence refs, mark stale/unresolved, update `review_flags_json`.
4. **Incremental rebuild**: `POST /api/knowledge/incremental-rebuild` — chains M0 catalog → M1 index → evidence revalidate.
5. **Artifact-level rebuild**: `POST /api/knowledge/rebuild-artifacts` — mark specific artifact_ids stale, then reindex.

## Allowed files

- `apps/trader-agent/backend/app/modules/rebuild.py` — NEW
- `apps/trader-agent/backend/app/api/agent.py` — add 5 endpoints to knowledge_router
- `apps/trader-agent/backend/tests/test_rebuild.py` — NEW

## Forbidden files (do not touch)

- All existing modules in `app/modules/` (artifact_catalog.py, markdown_section_indexer.py, evidence_ref.py, memory_service.py, candidate_service.py, context_selector.py, event.py, migrations.py, models.py, etc.)
- `apps/trader-cockpit/**`, `config.json`
- `document_chunks` / `document_chunks_fts`
- package manager files, frontend files

## Task 1: `rebuild.py`

New file with four public functions:

```python
from dataclasses import dataclass
from app.core.config import Settings
from app.modules.artifact_catalog import CatalogResult
from app.modules.markdown_section_indexer import MarkdownSectionIndexResult

@dataclass
class EvidenceRevalidationReport:
    total_memory_items: int
    total_evidence_refs: int
    resolved: int
    stale: int
    unresolved: int
    affected_memory_ids: list[str]

@dataclass
class IncrementalRebuildReport:
    catalog: CatalogResult
    sections: MarkdownSectionIndexResult
    evidence: EvidenceRevalidationReport
    duration_ms: int

def backup_database(settings: Settings) -> dict:
    """Copy SQLite + JSONL audit file to backups dir. Return dict with paths."""
    ...

def incremental_rebuild(settings: Settings) -> IncrementalRebuildReport:
    """Chain M0 catalog → M1 index → evidence revalidate. Return report."""
    ...

def rebuild_artifacts(settings: Settings, artifact_ids: list[str]) -> IncrementalRebuildReport:
    """Mark specific artifacts stale, then _reindex_and_revalidate (no catalog scan)."""
    ...

def revalidate_evidence(settings: Settings) -> EvidenceRevalidationReport:
    """Scan all active/conflicted memory_items' evidence refs; merge review flags for every item."""
    ...

def scan_evidence_health(settings: Settings) -> EvidenceRevalidationReport:
    """Read-only evidence scan; no DB writes, no audit events."""
    ...
```

### `backup_database(settings)`

1. Create `settings.data_dir / "backups"` if not exists
2. `timestamp = utc_now_iso().replace(":", "").replace("T", "-")` (safe filename)
3. Source sqlite: `settings.database_path`
4. Source jsonl: `settings.data_dir / "audit" / "agent_events.jsonl"`
5. Copy sqlite → `backups/trader-agent-memory-{timestamp}.sqlite` using `shutil.copy2`
6. Copy jsonl → `backups/agent-events-{timestamp}.jsonl` using `shutil.copy2` (skip if jsonl doesn't exist)
7. Return `{"sqlite_path": "...", "jsonl_path": "...", "timestamp": timestamp}`

### `incremental_rebuild(settings)`

1. `start = time.monotonic()`
2. Write `index_rebuild_started` audit event
3. `catalog_result = build_artifact_catalog(settings)`
4. `_reindex_and_revalidate(settings)` → sections + evidence
5. `duration_ms = int((time.monotonic() - start) * 1000)`
6. Write `index_rebuild_completed` audit event with report summary
7. On exception: write `index_rebuild_failed`, then re-raise
8. Return `IncrementalRebuildReport(...)`

### `rebuild_artifacts(settings, artifact_ids)`

1. Use `create_sqlite_engine(settings)` to UPDATE `source_artifacts` SET `index_status='stale'` WHERE id IN artifact_ids
2. Call `_reindex_and_revalidate(settings)` — **do not** call `build_artifact_catalog`
3. Return report with zero-value `CatalogResult` for catalog fields

### `revalidate_evidence(settings)`

1. Query `memory_items` WHERE `status IN ('active', 'conflicted')`
2. For each memory_item's `evidence_refs_json`:
   a. Deserialize via `loads(row["evidence_refs_json"], [])`
   b. For each ref dict → `EvidenceRef.from_dict(ref_dict)`
   c. Call `ref.resolve(engine)` (each resolve creates its own short-lived connection — that's fine)
   d. If `resolver_status == STALE` → `stale += 1`
   e. If `resolver_status == UNRESOLVED` → `unresolved += 1`
   f. If `resolver_status == RESOLVED` → `resolved += 1`
3. If a memory_item has any stale or unresolved refs, add item_id to `affected_memory_ids`
4. For **every** scanned item, merge `review_flags_json` (strip evidence flags when all refs resolved)
5. Write `memory_conflict_marked` event for unresolved evidence (dedupe by memory_item_id + reason)

For the revalidate step, use a single engine instance and pass it to each EvidenceRef.resolve() call, or create fresh connections per resolve. Either is fine — the resolve() method opens its own `engine.connect()`.

## Task 2: API endpoints in `api/agent.py`

Add to `knowledge_router`:

### POST /api/knowledge/backup

```python
@knowledge_router.post("/backup")
def backup_database_endpoint(request: Request) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)
    result = backup_database(settings)
    return result
```

### POST /api/knowledge/incremental-rebuild

```python
class IncrementalRebuildResponse(BaseModel):
    catalog_discovered: int
    catalog_updated: int
    catalog_excluded: int
    catalog_failed: int
    sections_indexed_artifacts: int
    sections_indexed: int
    sections_skipped: int
    sections_failed: int
    evidence_total_items: int
    evidence_total_refs: int
    evidence_resolved: int
    evidence_stale: int
    evidence_unresolved: int
    evidence_affected_ids: list[str]
    duration_ms: int

@knowledge_router.post("/incremental-rebuild")
def incremental_rebuild_endpoint(request: Request) -> IncrementalRebuildResponse:
    settings = _settings(request)
    bootstrap_database(settings)
    report = incremental_rebuild(settings)
    return IncrementalRebuildResponse(
        catalog_discovered=report.catalog.discovered,
        ...
    )
```

### POST /api/knowledge/rebuild-artifacts

```python
class RebuildArtifactsRequest(BaseModel):
    artifact_ids: list[str]

@knowledge_router.post("/rebuild-artifacts")
def rebuild_artifacts_endpoint(request: Request, payload: RebuildArtifactsRequest) -> IncrementalRebuildResponse:
    ...
```

### GET /api/knowledge/rebuild-status

```python
@knowledge_router.get("/rebuild-status")
def rebuild_status_endpoint(request: Request) -> dict:
    """Return the most recent index_rebuild_completed event from agent_events."""
    settings = _settings(request)
    bootstrap_database(settings)
    engine = create_sqlite_engine(settings)
    with engine.connect() as conn:
        row = conn.execute(
            select(agent_events).where(agent_events.c.event_type == "index_rebuild_completed")
            .order_by(agent_events.c.timestamp.desc()).limit(1)
        ).mappings().one_or_none()
    if row is None:
        return {"status": "no_rebuild_yet"}
    return {"status": "ok", "last_rebuild": dict(row)}
```

### GET /api/knowledge/evidence-health

```python
@knowledge_router.get("/evidence-health")
def evidence_health_endpoint(request: Request) -> dict:
    """Run a lightweight revalidation and return summary."""
    settings = _settings(request)
    bootstrap_database(settings)
    report = revalidate_evidence(settings)
    return asdict(report)
```

## Task 3: Tests

File: `apps/trader-agent/backend/tests/test_rebuild.py`

Pattern: same as existing tests — `bootstrap_database(temp_settings)`, seed data, call function, assert.

| Test | Assertion |
|---|---|
| `test_backup_creates_sqlite_copy` | backup dir has .sqlite file, size > 0 |
| `test_backup_returns_correct_paths` | response has sqlite_path, jsonl_path, timestamp |
| `test_backup_dir_created_if_not_exists` | first backup auto-creates dir |
| `test_backup_skips_jsonl_when_not_exists` | jsonl_path is null or file skipped |
| `test_incremental_rebuild_calls_catalog_and_index` | report.catalog columns filled, report.sections columns filled |
| `test_incremental_rebuild_returns_full_report` | IncrementalRebuildReport has catalog/sections/evidence/duration |
| `test_incremental_rebuild_writes_audit_event` | agent_events has index_rebuild_completed |
| `test_rebuild_artifacts_only_rebuilds_specified` | seed 3 artifacts, rebuild 1 → only that 1 gets reindexed |
| `test_rebuild_artifacts_skips_nonexistent_id` | no crash on nonexistent artifact_id |
| `test_revalidate_evidence_detects_stale` | modify section text → rebuild → evidence marked stale |
| `test_revalidate_evidence_detects_unresolved` | delete section → rebuild → evidence marked unresolved |
| `test_revalidate_evidence_updates_review_flags` | stale item → review_flags_json has evidence_stale |
| `test_revalidate_evidence_writes_conflict_event` | unresolved evidence → memory_conflict_marked event |
| `test_rebuild_status_returns_last_rebuild` | after rebuild → GET returns status=ok |
| `test_rebuild_status_no_rebuild_yet` | no rebuilds → status=no_rebuild_yet |
| `test_evidence_health_returns_counts` | seed items with mixed evidence → counts correct |

## Verification commands

```powershell
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_rebuild.py -v --tb=short
.venv/Scripts/python.exe -m ruff check apps/trader-agent/backend/app/modules/rebuild.py apps/trader-agent/backend/app/api/agent.py
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_artifact_catalog.py apps/trader-agent/backend/tests/test_markdown_section_indexer.py apps/trader-agent/backend/tests/test_corpus_search.py apps/trader-agent/backend/tests/test_evidence_ref.py apps/trader-agent/backend/tests/test_candidate_api.py apps/trader-agent/backend/tests/test_memory_api.py apps/trader-agent/backend/tests/test_context_selector.py -v --tb=short
```

## Do NOT commit

## Final response

- Changed files
- Commands run, results
- Failed output, gaps, risks
