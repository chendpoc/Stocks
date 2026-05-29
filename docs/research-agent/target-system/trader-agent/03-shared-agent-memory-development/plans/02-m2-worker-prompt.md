# M2 Worker Prompt — Local Corpus Search API Reconciliation

Target model: Cursor Composer 2.5
Source plan: [02-m2-corpus-search-api.md](./02-m2-corpus-search-api.md)
Generated: 2026-05-29

---

Implement Shared Agent Memory M2: Local Corpus Search API Reconciliation.

## Goal

Route `GET /api/knowledge/search` from the old `document_chunks`-based search
to M1's `document_sections` + `document_sections_fts` infrastructure, while
keeping the API response backward-compatible.

## Repository root

D:\workspace\01-products\stock-community-summary

## Context: what already exists

### M0 (done)
- `source_artifacts` table — catalog of all local files with `source_type`, `path`, `source_date`, `memory_eligible`
- `artifact_catalog.py` — `build_artifact_catalog(settings, docs_root=None)`

### M1 (done)
- `document_sections` table — heading-based markdown sections with `section_key`, `text_digest`, `heading_path`, `start_line`, `end_line`, `symbols_json`, `tags_json`, `speaker_refs_json`, `source_date`
- `document_sections_fts` — FTS5 virtual table over (section_id UNINDEXED, title, heading_path, text, symbols, tags, speaker_refs)
- `markdown_section_indexer.py`:
  - `index_markdown_sections(settings) -> MarkdownSectionIndexResult`
  - `search_document_sections(settings, query, *, limit=10) -> list[SectionSearchResult]`
  - `ensure_sections_fts(conn)` — creates FTS5 virtual table if not exists

### OLD (still exists, do NOT modify)
- `document_chunks` + `document_chunks_fts` — old paragraph-based search
- `local_search.py` — `search_local_knowledge(settings, *, query, symbol, source_type, start, end, limit) -> list[KnowledgeSearchResult]`
- `document_indexer.py` — `index_local_knowledge(settings)` + `ensure_knowledge_fts(conn)`

### Current API (the target for modification)
- `api/agent.py` line 141: `GET /api/knowledge/search` routes to `search_local_knowledge()`
- Response shape: `{"query": "...", "results": [{"evidence_id", "source_path", "snippet", "source_type", "confidence", "timestamp", "symbol_hints"}]}`

## Confirmed decisions

1. **Search backend**: Switch `GET /api/knowledge/search` to use `document_sections` + `document_sections_fts`. Do NOT touch `document_chunks`.

2. **New module**: Create `corpus_search.py`. Do NOT modify `local_search.py`. Incremental improvement — never modify old modules.

3. **No fallback to old chunks**: `document_sections` and `document_chunks` are both generated directly from Markdown files, not from each other. If sections search returns empty, return empty — do NOT fallback to `document_chunks`.

4. **`symbol_hints` → `symbols`**: Replace directly. `symbols` is a cleaned version of `symbol_hints` (stopwords filtered, deduplicated, max 20). Semantically equivalent but higher quality.

5. **Backward compatibility**: Response must include all old fields: `evidence_id`, `source_path`, `snippet`, `source_type`, `timestamp`, `confidence`. Add new fields: `section_id`, `heading_path`, `start_line`, `end_line`, `symbols`.

6. **Symbol filter**: Read `document_sections.symbols_json`, deserialize, match exactly (not LIKE `%"SYM"%`).

7. **Source type filter**: JOIN `source_artifacts` and filter on `source_artifacts.source_type`.

8. **Date filter**: Use `document_sections.source_date` (populated by M1).

9. **FTS ensure**: Call M1's `ensure_sections_fts(conn)` — do not duplicate FTS DDL.

10. **No audit events**: Search is read-only. No `record_agent_event()` calls.

11. **`confidence` field**: Keep in response for backward compat. Default to `0.8` since sections don't have a confidence score (old chunks had ~0.82).

## Allowed files (only these)

- `apps/trader-agent/backend/app/modules/corpus_search.py` — NEW file
- `apps/trader-agent/backend/app/api/agent.py` — modify `search_knowledge` function only
- `apps/trader-agent/backend/tests/test_corpus_search.py` — NEW file

## Forbidden files (do not touch)

- `apps/trader-cockpit/**`
- `apps/trader-agent/backend/config.json`
- `apps/trader-agent/backend/app/modules/local_search.py`
- `apps/trader-agent/backend/app/modules/document_indexer.py`
- `apps/trader-agent/backend/app/modules/markdown_section_indexer.py`
- `apps/trader-agent/backend/app/modules/artifact_catalog.py`
- `apps/trader-agent/backend/app/db/models.py`
- `document_chunks` / `document_chunks_fts` schema
- `document_sections` / `document_sections_fts` schema
- package manager files / frontend files

## Task 1: Create `corpus_search.py`

New file at `apps/trader-agent/backend/app/modules/corpus_search.py`.

```python
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.core.config import Settings
from app.db.session import create_sqlite_engine
from app.modules._json import loads
from app.modules.markdown_section_indexer import ensure_sections_fts

MAX_SEARCH_LIMIT = 50
FETCH_MULTIPLIER = 5
CJK_RE = re.compile(r"[\u4e00-\u9fff]")


@dataclass
class CorpusSearchResult:
    evidence_id: str
    section_id: str
    source_path: str
    source_type: str
    heading_path: str
    snippet: str
    source_date: str | None
    start_line: int | None
    end_line: int | None
    symbols: list[str]
    timestamp: str | None
    confidence: float = 0.8

    def as_dict(self) -> dict[str, Any]:
        return {
            "evidence_id": self.evidence_id,
            "section_id": self.section_id,
            "source_path": self.source_path,
            "source_type": self.source_type,
            "heading_path": self.heading_path,
            "snippet": self.snippet,
            "source_date": self.source_date,
            "start_line": self.start_line,
            "end_line": self.end_line,
            "symbols": self.symbols,
            "timestamp": self.timestamp,
            "confidence": self.confidence,
        }


def search_corpus(
    settings: Settings,
    *,
    query: str,
    symbol: str | None = None,
    source_type: str | None = None,
    start: str | None = None,
    end: str | None = None,
    limit: int = 10,
) -> list[CorpusSearchResult]:
    ...
```

Implementation requirements:

1. Validate `query` not empty (raise `ValueError`), `limit` in [1, MAX_SEARCH_LIMIT].

2. Get engine, call `ensure_sections_fts(conn)` inside transaction.

3. Build query dynamically:
   - Base: SELECT from `document_sections_fts` JOIN `document_sections` ON `section_id` JOIN `source_artifacts` ON `artifact_id`
   - FTS path: `WHERE document_sections_fts MATCH :query`
   - LIKE fallback: **multi-term AND matching** — split query by whitespace into terms, then `WHERE ds.text LIKE :term_0 AND ds.text LIKE :term_1 ...` (same as old `local_search.py` lines 142-147). For single-term queries, it's just one LIKE.
   - Filters append to WHERE clause

4. Filter logic:
   ```python
   conditions = []
   params = {}

   # symbol filter — exact match on deserialized symbols_json
   if symbol:
       # symbols_json is a JSON array string like '["AAPL", "TSLA"]'
       # Use LIKE to match within the JSON string: simpler than json_each
       conditions.append("ds.symbols_json LIKE :symbol_pattern")
       params["symbol_pattern"] = f'%"{symbol.strip().upper()}"%'

   # source_type filter — via source_artifacts join
   if source_type:
       conditions.append("sa.source_type = :source_type")
       params["source_type"] = source_type

   # date range filter
   if start:
       conditions.append("ds.source_date >= :start_date")
       params["start_date"] = _date_value(start)
   if end:
       conditions.append("ds.source_date <= :end_date")
       params["end_date"] = _date_value(end)
   ```

5. Search strategy:
   - If query has CJK characters → LIKE fallback directly
   - Otherwise → FTS5 first
   - If FTS5 returns empty or raises OperationalError → LIKE fallback
   - FTS query: build from ASCII terms joined with AND (same as old `local_search.py` `_fts_query`)
   - LIKE fallback MUST use multi-term AND matching (same as old `local_search.py` `_search_like`):
     - Split query by whitespace into terms
     - For each term, add `AND ds.text LIKE :term_N` with `%term%`
     - This preserves the old behavior: "AAPL breakout" → `LIKE '%AAPL%' AND LIKE '%breakout%'`
     - Single-term query → just one LIKE condition
   - After LIKE results: filter rows by verifying all query terms appear in text (same as old `_filter_rows_by_query_terms`)

6. Snippet generation:
   - Find first occurrence of any query term in text
   - Take 80 chars before, total 240 chars
   - Add "..." prefix/suffix if truncated

7. Return `CorpusSearchResult` list, respecting `limit`.

## Task 2: Modify `api/agent.py`

In `search_knowledge` function (line 141):

Change the import:
```python
# old
from app.modules.local_search import MAX_SEARCH_LIMIT, search_local_knowledge

# new
from app.modules.corpus_search import MAX_SEARCH_LIMIT, search_corpus
```

Change the function body:
```python
@knowledge_router.get("/search")
def search_knowledge(...) -> dict:
    ...
    try:
        results = search_corpus(    # was: search_local_knowledge
            settings,
            query=q,
            symbol=symbol,
            source_type=source_type,
            start=start,
            end=end,
            limit=limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"query": q, "results": [result.as_dict() for result in results]}
```

Do NOT change anything else in `api/agent.py`.

## Task 3: Create tests

File: `apps/trader-agent/backend/tests/test_corpus_search.py`

Pattern: same as `test_markdown_section_indexer.py` — temp repo, catalog + index first, then search.

Required test cases:

| Test | Setup | Assertion |
|---|---|---|
| `test_searches_sections_via_fts` | catalog + index markdown with "AAPL breakout signal", search "AAPL" | Returns result with non-empty `heading_path` |
| `test_searches_chinese_like` | section text contains 市场回调风险, search 市场回调 | Returns result via LIKE |
| `test_filters_by_symbol` | section symbols_json=["TSLA"], search with symbol=TSLA | Returns section; search symbol=NVDA returns empty |
| `test_filters_by_source_type` | artifact source_type=generated_summary, search with source_type=generated_summary | Returns match; filter by prd excludes it |
| `test_filters_by_date_range` | source_date=2026-05-15, search start=2026-05-01 end=2026-05-31 | Returns; search start=2026-06-01 returns empty |
| `test_returns_backward_compatible_fields` | any search | `evidence_id`, `source_path`, `snippet`, `source_type` in response |
| `test_returns_new_section_fields` | search | `heading_path`, `start_line`, `end_line`, `symbols`, `section_id` in response |
| `test_search_api_endpoint` | `GET /api/knowledge/search?q=test` via TestClient | 200, results is list |
| `test_empty_query_rejected` | `GET /api/knowledge/search?q=` | 422 |
| `test_no_regression_on_old_chunks` | pre-existing `document_chunks` row | Row still exists after search |

## Verification commands (run in order)

```powershell
.venv\Scripts\python.exe -m pytest apps/trader-agent/backend/tests/test_corpus_search.py -v --tb=short
.venv\Scripts\python.exe -m ruff check apps/trader-agent/backend/app/modules/corpus_search.py
.venv\Scripts\python.exe -m ruff check apps/trader-agent/backend/app/api/agent.py
.venv\Scripts\python.exe -m pytest apps/trader-agent/backend/tests/test_artifact_catalog.py -v --tb=short
.venv\Scripts\python.exe -m pytest apps/trader-agent/backend/tests/test_markdown_section_indexer.py -v --tb=short
```

## Important: do NOT commit

All changes stay in the working tree. Do not run `git commit`.

## Final response format

When done, report:
- List of changed files
- Commands run and their results
- Any failed command output
- Known gaps or risks
