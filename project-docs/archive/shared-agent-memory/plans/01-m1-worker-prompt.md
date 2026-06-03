# M1 Worker Prompt — Markdown Section Index + FTS5 Reconciliation

Target model: Cursor Composer 2.5
Source plan: [01-m1-markdown-section-index.md](./01-m1-markdown-section-index.md)
Generated: 2026-05-29

---

Implement Shared Agent Memory M1: Markdown Section Index + FTS5 Reconciliation.

## Goal

Read Markdown-class artifacts from `source_artifacts` (M0), split them into
heading-based `document_sections`, build `document_sections_fts` FTS5 index,
update artifact index status, and write canonical audit events.

## Repository root

D:\workspace\01-products\stock-community-summary

## Context: what already exists

- `apps/trader-agent/backend/app/db/models.py` — SQLAlchemy Table definitions,
  includes `source_artifacts` (M0 delivered), `document_chunks`, `agent_events`,
  and shared column helpers: `uuid_column()`, `timestamp_column()`, `json_column()`.
  Uses `metadata = MetaData()` at module level.

- `apps/trader-agent/backend/app/db/migrations.py` — `bootstrap_database(settings)`
  calls `metadata.create_all(engine)`, so adding a Table to models.py auto-creates it.

- `apps/trader-agent/backend/app/modules/artifact_catalog.py` — M0 catalog.
  `build_artifact_catalog(settings, docs_root=None)` scans and populates
  `source_artifacts`. Uses `create_sqlite_engine(settings)` for DB access.

- `apps/trader-agent/backend/app/modules/document_indexer.py` — OLD indexer.
  Creates `document_chunks_fts` via raw SQL (line 88):
    CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts
    USING fts5(chunk_id UNINDEXED, raw_text)
  DO NOT modify this file.

- `apps/trader-agent/backend/app/modules/local_search.py` — OLD search.
  Queries `document_chunks_fts`. DO NOT modify this file.

- `apps/trader-agent/backend/app/core/events.py` — `record_agent_event(settings, ...)`
  writes to `agent_events` table. Must be called AFTER DB transaction closes.

- `apps/trader-agent/backend/app/core/time.py` — `utc_now_iso()` returns ISO string.

- `apps/trader-agent/backend/app/db/session.py` — `create_sqlite_engine(settings)`.

- `apps/trader-agent/backend/app/modules/_json.py` — `dumps(obj)` for JSON columns.

## Confirmed decisions (do not deviate)

1. M1 reads ONLY from `source_artifacts` where
   `source_type IN ('markdown','generated_summary','prd','engineering_doc')`
   AND `index_status IN ('pending','stale')`. Never rescan the filesystem.

2. Add `document_sections` and `document_sections_fts` alongside existing
   `document_chunks`/`document_chunks_fts`. Do NOT delete or rename the old tables.

3. Do NOT modify `local_search.py`, `document_indexer.py`, `knowledge_source_registry.py`,
   or `api/agent.py`.

4. PRD/engineering docs MAY be indexed for search, but `source_artifacts.memory_eligible`
   MUST remain 0 — never flip it to 1.

5. Canonical event names: `markdown_sections_indexed` (success), `artifact_index_failed` (failure).
   No other event names.

6. `record_agent_event()` must be called AFTER the source_artifacts/document_sections
   DB transaction closes (avoid nested SQLite write lock).

7. Resolve artifact paths via `settings.repo_root / source_artifacts.path`, and
   reject paths that resolve outside `settings.repo_root`.

8. `section_key = sha256(f"{artifact_path}|{heading_path}|{section_index}|{split_index}")`

9. `text_digest = sha256(section_text)`

10. Reindex strategy: DELETE old sections + FTS rows for the artifact, then INSERT new ones.

## Allowed files (only these)

- `apps/trader-agent/backend/app/db/models.py` — add `document_sections` Table
- `apps/trader-agent/backend/app/modules/markdown_section_indexer.py` — NEW file
- `apps/trader-agent/backend/tests/test_markdown_section_indexer.py` — NEW file
- `apps/trader-agent/backend/app/db/migrations.py` — only if metadata.create_all() isn't enough

## Forbidden files (do not touch)

- `apps/trader-cockpit/**`
- `apps/trader-agent/backend/config.json`
- `apps/trader-agent/backend/app/modules/document_indexer.py`
- `apps/trader-agent/backend/app/modules/local_search.py`
- `apps/trader-agent/backend/app/modules/knowledge_source_registry.py`
- `apps/trader-agent/backend/app/api/agent.py`
- existing `document_chunks` schema
- existing `document_chunks_fts` virtual table
- package manager files / frontend files

## Task 1: Add `document_sections` table to models.py

```python
document_sections = Table(
    "document_sections",
    metadata,
    uuid_column("id", primary_key=True, nullable=False),
    Column("artifact_id", Text, nullable=False),
    Column("section_key", Text, nullable=False),
    Column("text_digest", Text, nullable=False),
    Column("section_index", Integer, nullable=False),
    Column("heading_path", Text, nullable=False),
    Column("section_type", Text, nullable=False),
    Column("text", Text, nullable=False),
    Column("start_line", Integer),
    Column("end_line", Integer),
    Column("source_date", Text),
    json_column("symbols_json"),
    json_column("tags_json"),
    json_column("speaker_refs_json"),
    json_column("metadata_json"),
    timestamp_column("created_at"),
    timestamp_column("updated_at"),
    UniqueConstraint("artifact_id", "section_key"),
)
```

Add it after `source_artifacts` table definition. `bootstrap_database` will
auto-create it via `metadata.create_all()`.

## Task 2: Create `markdown_section_indexer.py`

New file. Public interface:

```python
from dataclasses import dataclass
from app.core.config import Settings

@dataclass
class MarkdownSectionIndexResult:
    indexed_artifacts: int
    indexed_sections: int
    skipped: int
    failed: int

@dataclass
class SectionSearchResult:
    section_id: str
    artifact_id: str
    path: str
    heading_path: str
    snippet: str
    source_date: str | None
    start_line: int | None
    end_line: int | None

def index_markdown_sections(settings: Settings) -> MarkdownSectionIndexResult:
    ...

def search_document_sections(
    settings: Settings, query: str, *, limit: int = 10
) -> list[SectionSearchResult]:
    ...
```

Implementation requirements for `index_markdown_sections`:

1. Get engine via `create_sqlite_engine(settings)`.
2. Create FTS5 virtual table (raw SQL, same pattern as document_indexer.py:88):

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS document_sections_fts
USING fts5(
  section_id UNINDEXED,
  title,
  heading_path,
  text,
  symbols,
  tags,
  speaker_refs
)
```

3. Query eligible artifacts:
```python
SELECT * FROM source_artifacts
WHERE source_type IN ('markdown','generated_summary','prd','engineering_doc')
  AND index_status IN ('pending','stale')
```

4. For each artifact:
   a. Resolve path: `file_path = (settings.repo_root / row["path"]).resolve()`
   b. Verify `file_path` is inside `settings.repo_root.resolve()` — skip+mark failed if not
   c. Read file UTF-8: `file_path.read_text(encoding="utf-8", errors="replace")`
   d. Parse ATX headings only (`#` through `######`). NO setext headings.
   e. Build sections (see heading parsing rules below)
   f. Generate `section_key` and `text_digest` using sha256
   g. Extract symbols/tags/speaker_refs (see extraction rules below)
   h. Collect old section IDs for this artifact, DELETE from FTS, DELETE from sections
   i. INSERT new sections + FTS rows
   j. UPDATE `source_artifacts` SET `index_status='indexed'`, `indexed_at=now`, `updated_at=now`
   k. If any step fails for an artifact: set `index_status='failed'`, record error in metadata_json,
      continue to next artifact (don't abort the whole run)

5. Buffer events and write them AFTER the transaction closes:
   - Success: `record_agent_event(settings, event_type="markdown_sections_indexed", ...)`
   - Failure: `record_agent_event(settings, event_type="artifact_index_failed", ...)`

### ATX Heading Parsing Rules

Only recognize ATX headings:
```markdown
# H1
## H2
### H3
```

Do NOT recognize setext:
```markdown
Title
=====
```

Each section starts at a heading line and ends at the line before the next heading
of EQUAL OR HIGHER level. Example:

```
1  # Daily Summary
2  intro text
3  ## AAPL
4  aapl content
5  ## TSLA
6  tsla content
```

Produces:
| section_index | heading_path | start_line | end_line |
|---|---|---|---|
| 0 | Daily Summary | 1 | 2 |
| 1 | Daily Summary > AAPL | 3 | 4 |
| 2 | Daily Summary > TSLA | 5 | 6 |

For files with NO headings: create one section with `section_type="document"`,
`heading_path=""`, covering the entire file (lines 1 to last).

Heading sections use `section_type="heading"`.

### Oversized Section Split

If a section's text exceeds 5000 Chinese characters (use `len(text)` as approximation):
- Split by blank-line paragraph groups, targeting 3000-5000 chars per sub-section
- Never split inside a Markdown table row
- Split sections keep the same `heading_path`, with `metadata_json.split_index` from 0

### Metadata Extraction (minimal rules)

```python
import re

# symbols: uppercase tickers like $AAPL, AAPL.O, TSLA, NVDA
SYMBOL_RE = re.compile(r'\$?[A-Z]{1,5}(?:\.[A-Z])?')
# Filter: must contain at least one letter, exclude pure numbers
# Deduplicate, max 20

# tags: Markdown #tag patterns (exclude heading markers at line start)
TAG_RE = re.compile(r'(?<!\A)(?<!\n)#([\w\u4e00-\u9fff-]+)')

# speaker_refs: known speaker tokens
SPEAKERS = {"赵哥", "群友", "用户", "agent", "system", "管理员", "xiaozhaolucky"}

# source_date: use source_artifacts.source_date if present, else extract YYYY-MM-DD from path
```

### Path Resolution

`title` = filename stem with leading `YYYY-MM-DD-` / `YYYY-MM-DD_` / `YYYY-MM-DD ` stripped.

## Task 3: Internal search helper

`search_document_sections(settings, query, *, limit=10)`:
- For ASCII/ticker queries: use `document_sections_fts MATCH :query`
- For Chinese queries: use `document_sections.text LIKE :like_query` as fallback
  (detect Chinese by checking if query contains any CJK character `\u4e00-\u9fff`)
- Return list of `SectionSearchResult` with `section_id`, `artifact_id`, `path`
  (from source_artifacts join), `heading_path`, `snippet` (first 200 chars of text),
  `source_date`, `start_line`, `end_line`
- Do NOT expose this via REST API — it's internal-only for now

## Task 4: Create tests

File: `apps/trader-agent/backend/tests/test_markdown_section_indexer.py`

Use pytest. Pattern from existing tests (see `test_artifact_catalog.py`):
- `bootstrap_database(settings)` for setup
- `create_sqlite_engine(settings)` for verification queries
- Settings fixture likely uses temp dirs

Required test cases:

| Test | Setup | Assertion |
|---|---|---|
| `test_indexes_heading_sections` | temp repo, write `docs/summaries/test.md` with headings, run catalog then M1 | Multiple `document_sections` rows, correct `heading_path`, `start_line`, `end_line` |
| `test_indexes_no_heading_markdown` | temp repo, no-heading .md | One section with `section_type='document'` |
| `test_updates_artifact_indexed_status` | catalog → artifact is `pending` | After M1: `index_status='indexed'`, `indexed_at` non-null |
| `test_reindexes_stale_artifact_idempotently` | index once, modify file, re-catalog → stale, re-index | Old sections replaced, count doesn't double |
| `test_keeps_prd_memory_ineligible` | `project-docs/research-agent/target-system/x.md` | Sections indexed, but `memory_eligible=0` unchanged |
| `test_writes_markdown_sections_indexed_event` | successful index | `agent_events.event_type` contains `markdown_sections_indexed` |
| `test_records_artifact_index_failed` | artifact points to nonexistent file | `index_status='failed'`, event `artifact_index_failed` |
| `test_searches_fts_ascii` | section text contains "AAPL breakout" | `search_document_sections(settings, "AAPL")` returns result |
| `test_searches_chinese_fallback` | section text contains 中文关键词 | Chinese query returns result via LIKE |
| `test_does_not_touch_old_chunks` | pre-existing `document_chunks` row | After M1, old row still exists |

## Verification commands (run in order)

```powershell
.venv\Scripts\python.exe -m pytest apps/trader-agent/backend/tests/test_markdown_section_indexer.py -v --tb=short
.venv\Scripts\python.exe -m ruff check apps/trader-agent/backend/app/modules/markdown_section_indexer.py
.venv\Scripts\python.exe -m ruff check apps/trader-agent/backend/tests/test_markdown_section_indexer.py
.venv\Scripts\python.exe -m pytest apps/trader-agent/backend/tests/test_artifact_catalog.py -v --tb=short
```

## Important: do NOT commit

All changes stay in the working tree. Do not run `git commit`.

## Final response format

When done, report:
- List of changed files
- Commands run and their results
- Any failed command output
- Known gaps or risks
