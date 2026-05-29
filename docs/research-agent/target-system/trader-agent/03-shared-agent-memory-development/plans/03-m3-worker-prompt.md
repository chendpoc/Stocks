# M3 Worker Prompt — Memory Candidate Schema + Extraction

Target model: Cursor Composer 2.5
Source plan: [03-m3-memory-candidate.md](./03-m3-memory-candidate.md)
Generated: 2026-05-29

---

Implement Shared Agent Memory M3: Memory Candidate Schema + Extraction.

## Goal

Define the `EvidenceRef` structure (5 ref types), create the `memory_candidates` table,
implement rule-based and LLM-based candidate extraction from `document_sections`,
add REST API endpoints for candidate CRUD, and implement basic dedup checking.

## Repository root

D:\workspace\01-products\stock-community-summary

## Context: what already exists

### Tables
- `source_artifacts` (M0) — file catalog with `source_type`, `path`, `content_hash`, `memory_eligible`, `index_status`, `source_date`
- `document_sections` (M1) — heading-based markdown sections with `section_key`, `text_digest`, `heading_path`, `start_line`, `end_line`, `symbols_json`, `tags_json`, `text`
- `agent_events` — audit event log
- `rule_candidates` — EXISTING, different purpose (rule discovery). Do NOT modify.

### Modules
- `markdown_section_indexer.py` — `search_document_sections()`, `ensure_sections_fts()`
- `corpus_search.py` — `search_corpus()` (M2)
- `rule_discovery.py` — has `RuleCandidate` with `evidence_refs: list[dict]` (reference pattern, don't modify)

### Shared helpers
- `_json.py`: `dumps(obj)`, `loads(json_str, default=None)`
- `events.py`: `record_agent_event(settings, event_type=..., status=..., input_summary=..., error=...)`
- `time.py`: `utc_now_iso()`
- `session.py`: `create_sqlite_engine(settings)`
- `models.py`: `uuid_column(n)`, `timestamp_column(n)`, `json_column(n)`, `metadata`

### API
- `api/agent.py`: `knowledge_router` already has `/search`, `/reindex`, `/scan-artifacts`
- `bootstrap_database(settings)` at each endpoint

## Confirmed decisions

1. **All 5 EvidenceRef types**: `document_section`, `image_artifact`, `raw_chat_message`, `news_archive`, `filing_archive`
2. **Both extraction modes**: rule-based (heading matching) + LLM draft (DeepSeek structured output)
3. **REST API included**: `POST /candidates`, `GET /candidates`, `GET /candidates/{id}`
4. **evidence_refs_json embedded** — no separate `memory_sources` table
5. **Dedup**: basic title similarity + symbol overlap, mark `review_flags_json`
6. **candidate_status**: default is `candidate`, always requires human review per M4
7. **Events**: `memory_candidate_created` on successful insertion
8. **No modification** of existing `rule_candidates` or `rule_discovery.py`

## Allowed files

- `apps/trader-agent/backend/app/db/models.py` — add `memory_candidates` table
- `apps/trader-agent/backend/app/modules/evidence_ref.py` — NEW
- `apps/trader-agent/backend/app/modules/candidate_extractor.py` — NEW
- `apps/trader-agent/backend/app/modules/candidate_service.py` — NEW
- `apps/trader-agent/backend/app/api/agent.py` — add 3 endpoints to `knowledge_router`
- `apps/trader-agent/backend/tests/test_evidence_ref.py` — NEW
- `apps/trader-agent/backend/tests/test_candidate_extractor.py` — NEW
- `apps/trader-agent/backend/tests/test_candidate_api.py` — NEW

## Forbidden files (do not touch)

- `apps/trader-cockpit/**`
- `config.json`
- `document_indexer.py`, `local_search.py`, `knowledge_source_registry.py`
- `corpus_search.py`, `markdown_section_indexer.py`, `artifact_catalog.py`
- `rule_discovery.py`, `rule_engine.py`, `scoring.py`, `setup_detection.py`
- `document_chunks`, `document_chunks_fts`, `document_sections_fts`
- package manager files, frontend files

## Task 1: `memory_candidates` table in models.py

Add after the `source_artifacts` table. Use shared helpers.

```python
memory_candidates = Table(
    "memory_candidates",
    metadata,
    uuid_column("id", primary_key=True, nullable=False),
    Column("candidate_type", Text, nullable=False),
    Column("title", Text, nullable=False),
    Column("summary", Text),
    Column("normalized_rule", Text),
    Column("applicability", Text),
    json_column("trigger_conditions_json"),
    json_column("invalidation_conditions_json"),
    json_column("evidence_refs_json"),
    json_column("symbols_json"),
    json_column("related_symbols_json"),
    json_column("asset_classes_json"),
    Column("market_scope", Text),
    Column("confidence", Numeric),
    Column("candidate_status", Text, nullable=False, default="candidate"),
    json_column("review_flags_json"),
    Column("created_by", Text, nullable=False),
    timestamp_column("created_at"),
    timestamp_column("reviewed_at"),
    Column("review_note", Text),
)
```

## Task 2: `evidence_ref.py` — EvidenceRef dataclass

Define the unified EvidenceRef structure with all 5 ref types.

```python
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any

class RefType(str, Enum):
    DOCUMENT_SECTION = "document_section"
    IMAGE_ARTIFACT = "image_artifact"
    RAW_CHAT_MESSAGE = "raw_chat_message"
    NEWS_ARCHIVE = "news_archive"
    FILING_ARCHIVE = "filing_archive"

class ResolverStatus(str, Enum):
    RESOLVED = "resolved"
    STALE = "stale"
    UNRESOLVED = "unresolved"

@dataclass
class EvidenceRef:
    # ---- Common fields ----
    ref_type: RefType
    ref_id: str
    artifact_id: str
    artifact_path: str
    artifact_hash: str | None = None
    source_date: str | None = None
    resolver_status: ResolverStatus = ResolverStatus.RESOLVED
    quote: str | None = None
    note: str | None = None

    # ---- document_section ----
    section_key: str | None = None
    text_digest: str | None = None
    heading_path: str | None = None
    start_line: int | None = None
    end_line: int | None = None

    # ---- image_artifact ----
    perceptual_hash: str | None = None
    related_artifact_id: str | None = None
    ocr_text_digest: str | None = None

    # ---- raw_chat_message ----
    message_id: str | None = None
    conversation_id: str | None = None
    message_digest: str | None = None

    # ---- news_archive / filing_archive ----
    archive_id: str | None = None
    source_url: str | None = None
    published_at: str | None = None
    content_digest: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "EvidenceRef":
        ...

    def as_dict(self) -> dict[str, Any]:
        ...

    def resolve(self, engine) -> "EvidenceRef":
        """Check if referenced entity still exists. Returns new EvidenceRef
        with updated resolver_status (resolved / stale / unresolved)."""
        ...
```

Implementation requirements:

- `from_dict`: deserialize JSON dict → EvidenceRef. Handle missing optional fields gracefully.
- `as_dict`: serialize to dict for JSON storage. Exclude `None` values. Use field keys matching the PRD spec (e.g. `ref_type`, not `refType`).
- `resolve`: given a SQLAlchemy engine:
  - For `document_section`: query `document_sections` by `section_key`. If found + `text_digest` matches → `resolved`. If found + digest differs → `stale`. If not found → `unresolved`.
  - For `image_artifact`: query `source_artifacts` by `artifact_id`. If found + hash matches → resolved. Hash differs → stale. Not found → unresolved.
  - For `raw_chat_message`, `news_archive`, `filing_archive`: query `source_artifacts` by `artifact_id`. If found → resolved. Not found → unresolved. (No per-message digest check for now.)
  - Use a new connection via `engine.connect()` for the check, close after.

## Task 3: `candidate_service.py` — CRUD + dedup

```python
from dataclasses import dataclass
from app.core.config import Settings

@dataclass
class CandidateCreateResult:
    created: list[str]  # list of candidate IDs
    flagged: list[str]  # list of candidate IDs with review_flags set

def create_candidates(
    settings: Settings,
    candidates: list[dict[str, Any]],  # list of candidate dicts
) -> CandidateCreateResult:
    ...
```

Implementation:
1. For each candidate dict, check dedup against existing candidates:
   - Normalize titles (lowercase, strip whitespace)
   - Compute edit distance ratio: `1 - edit_distance / max(len(a), len(b))`
   - If ratio > 0.7 → flag
   - If `symbols_json` has any overlap → strengthen flag
   - Set `review_flags_json = ["possible_duplicate"]` if flagged
2. Insert all candidates into `memory_candidates` table
3. Return `CandidateCreateResult` with created IDs and flagged IDs

Helper:

```python
def list_candidates(
    settings: Settings,
    *,
    status: str | None = None,
    candidate_type: str | None = None,
    symbol: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> list[dict[str, Any]]:
    ...

def get_candidate(settings: Settings, candidate_id: str) -> dict[str, Any] | None:
    ...
```

## Task 4: `candidate_extractor.py` — Rule-based + LLM extraction

```python
def extract_candidates_from_sections(
    settings: Settings,
    *,
    section_ids: list[str] | None = None,
    source_date_from: str | None = None,
    source_date_to: str | None = None,
) -> list[dict[str, Any]]:
    ...
```

Rule-based logic:

1. Query `document_sections` JOIN `source_artifacts` WHERE `source_artifacts.memory_eligible = 1`
2. If `section_ids` provided, filter to those IDs. If `source_date_from/to`, filter by `document_sections.source_date`.
3. Define heading patterns:

```python
EXTRACTION_RULES = [
    ("核心理论", "market_mechanism", 0.6),
    ("证据链", "source_pattern_summary", 0.6),
    ("交易框架拆解", "trading_rule", 0.55),
    ("入场条件", "trading_rule", 0.65),
    ("风控规则", "trading_rule", 0.65),
    ("失效条件", "trading_rule", 0.6),
    ("市场状态判断", "market_mechanism", 0.55),
    ("核心结论", "source_pattern_summary", 0.6),
    ("仓位/操作策略", "trading_rule", 0.55),
    ("退出条件", "trading_rule", 0.6),
    ("观察信号", "trading_rule", 0.5),
]
```

4. For each matching section:
   - Build EvidenceRef of `ref_type=document_section`
   - `candidate_type` from the rule's type
   - `title` = `heading_path` (e.g. "2026-05-15 每日总结 > 核心理论")
   - `summary` = first 500 chars of `section.text`
   - `normalized_rule` = `section.text` (full text as the rule draft)
   - `symbols_json` = deserialize `section.symbols_json`
   - `tags_json` = deserialize `section.tags_json`
   - `confidence` = rule's default confidence
   - `created_by = "rule_based"`
   - `evidence_refs_json` = serialized EvidenceRef (list with one item)

5. Return list of candidate dicts. Do NOT write to DB — that's `candidate_service.create_candidates()`'s job.

```python
def draft_candidates_with_llm(
    settings: Settings,
    *,
    section_texts: list[str],
    section_metadata: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    ...
```

LLM draft logic:
1. Build prompt with section texts + instructions to output JSON array of candidate drafts
2. Call the project's existing DeepSeek/LLM infrastructure. Check `apps/trader-agent/backend/` for existing LLM call patterns (e.g. `app/modules/explanation.py` or similar files). Reuse the same pattern.
3. Parse the JSON response
4. Each candidate:
   - `created_by = "agent"`
   - `confidence` = use model's output or default 0.5
   - `candidate_status = "candidate"`
5. Return list of candidate dicts.

If the LLM call fails or returns unparseable JSON → return empty list. Do not crash.

## Task 5: API endpoints in `api/agent.py`

Add to `knowledge_router`:

### POST /api/knowledge/candidates

```python
from pydantic import BaseModel

class CreateCandidatesRequest(BaseModel):
    section_ids: list[str] | None = None
    extraction_mode: str = "rule_based"  # "rule_based" | "llm_draft" | "both"
    source_date_from: str | None = None
    source_date_to: str | None = None

@knowledge_router.post("/candidates")
def create_candidates(request: Request, payload: CreateCandidatesRequest) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)

    raw_candidates: list[dict[str, Any]] = []
    if payload.extraction_mode in ("rule_based", "both"):
        raw_candidates.extend(
            extract_candidates_from_sections(
                settings,
                section_ids=payload.section_ids,
                source_date_from=payload.source_date_from,
                source_date_to=payload.source_date_to,
            )
        )
    if payload.extraction_mode in ("llm_draft", "both"):
        # For LLM: fetch section texts from the provided section_ids
        ...
        raw_candidates.extend(
            draft_candidates_with_llm(settings, ...)
        )

    if not raw_candidates:
        return {"created": [], "flagged": []}

    result = create_candidates(settings, raw_candidates)

    # Write audit events AFTER transaction (create_candidates uses its own transaction)
    for candidate_id in result.created:
        record_agent_event(
            settings,
            event_type="memory_candidate_created",
            status="completed",
            input_summary={
                "candidate_id": candidate_id,
                "extraction_mode": payload.extraction_mode,
            },
        )

    return {"created": result.created, "flagged": result.flagged}
```

### GET /api/knowledge/candidates

```python
@knowledge_router.get("/candidates")
def list_candidates(
    request: Request,
    status: str | None = None,
    candidate_type: str | None = None,
    symbol: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)
    rows = list_candidates(
        settings,
        status=status,
        candidate_type=candidate_type,
        symbol=symbol,
        limit=limit,
        offset=offset,
    )
    return {"results": rows, "limit": limit, "offset": offset}
```

### GET /api/knowledge/candidates/{candidate_id}

```python
@knowledge_router.get("/candidates/{candidate_id}")
def get_candidate(request: Request, candidate_id: str) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)
    row = get_candidate(settings, candidate_id)
    if row is None:
        raise HTTPException(status_code=404, detail="candidate not found")

    # Resolve evidence refs
    engine = create_sqlite_engine(settings)
    evidence_refs = loads(row.get("evidence_refs_json"), [])
    resolved_refs = []
    for ref_dict in evidence_refs:
        ref = EvidenceRef.from_dict(ref_dict)
        resolved = ref.resolve(engine)
        resolved_refs.append(resolved.as_dict())
    row["evidence_refs"] = resolved_refs

    return row
```

Import note: `EvidenceRef` is imported from `app.modules.evidence_ref`, `create_candidates`/`list_candidates`/`get_candidate` from `app.modules.candidate_service`, `extract_candidates_from_sections`/`draft_candidates_with_llm` from `app.modules.candidate_extractor`.

## Task 6: Tests

### test_evidence_ref.py

```python
# Test cases:
# 1. from_dict -> as_dict roundtrip for each of the 5 ref types
# 2. Field-specific values preserved (section_key, text_digest for document_section)
# 3. resolve — found (insert section into DB, resolve should return RESOLVED)
# 4. resolve — stale (insert section, then resolve with wrong text_digest → STALE)
# 5. resolve — unresolved (resolve with nonexistent section_key → UNRESOLVED)
# 6. as_dict excludes None values
# 7. from_dict handles missing optional fields
```

### test_candidate_extractor.py

```python
# 1. rule-based extracts from "核心理论" heading → market_mechanism
# 2. rule-based extracts from "入场条件" heading → trading_rule
# 3. rule-based filters by source_date range
# 4. rule-based respects memory_eligible=0 (PRD docs excluded)
# 5. generated candidate dicts have correct shape (all required keys)
# 6. EvidenceRef in evidence_refs_json is valid (roundtrip test)
```

### test_candidate_api.py

```python
# 1. POST /candidates rule_based → returns {"created": [...], "flagged": [...]}
# 2. POST /candidates with specific section_ids → only extracts from those
# 3. POST /candidates on empty sections → returns {"created": [], "flagged": []}
# 4. GET /candidates → returns list with pagination
# 5. GET /candidates?status=candidate → filters
# 6. GET /candidates?symbol=AAPL → filters by embedded symbols_json
# 7. GET /candidates/{id} → returns candidate with resolved evidence refs
# 8. GET /candidates/{nonexistent} → 404
# 9. memory_candidate_created event written after POST
```

## Verification commands (run in order)

```powershell
.venv\Scripts\python.exe -m pytest apps/trader-agent/backend/tests/test_evidence_ref.py -v --tb=short
.venv\Scripts\python.exe -m pytest apps/trader-agent/backend/tests/test_candidate_extractor.py -v --tb=short
.venv\Scripts\python.exe -m pytest apps/trader-agent/backend/tests/test_candidate_api.py -v --tb=short
.venv\Scripts\python.exe -m ruff check apps/trader-agent/backend/app/modules/evidence_ref.py
.venv\Scripts\python.exe -m ruff check apps/trader-agent/backend/app/modules/candidate_extractor.py
.venv\Scripts\python.exe -m ruff check apps/trader-agent/backend/app/modules/candidate_service.py
.venv\Scripts\python.exe -m ruff check apps/trader-agent/backend/app/api/agent.py
.venv\Scripts\python.exe -m pytest apps/trader-agent/backend/tests/test_artifact_catalog.py apps/trader-agent/backend/tests/test_markdown_section_indexer.py apps/trader-agent/backend/tests/test_corpus_search.py -v --tb=short
```

## Important: do NOT commit

All changes stay in the working tree. Do not run `git commit`.

## Final response

When done, report:
- List of changed files
- Commands run and their results
- Any failed command output
- Known gaps or risks
