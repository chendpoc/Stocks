# M4 Worker Prompt — Candidate Review + Active Memory

Target model: Cursor Composer 2.5
Source plan: [04-m4-review-activation.md](./04-m4-review-activation.md)
Generated: 2026-05-29

---

Implement Shared Agent Memory M4: Candidate Review + Active Memory.

## Goal

Create the `memory_items` table, implement the state machine (candidate → active/rejected/merged/conflicted), add a conversational extraction path (LLM extracts memory from user-marked text → preview → confirm → store), and provide the full management API for candidates and memory items.

Two creation paths, both leading to `memory_items`:

```
Path A (M3→M4, batch discovery):
  document_sections → rule-based/LLM scan → memory_candidates
  → POST /candidates/{id}/activate → memory_items

Path B (M4, conversational):
  conversation text → POST /extract-preview → LLM extracts → human sees preview
  → POST /memory-items → stored directly as active memory
```

## Repository root

D:\workspace\01-products\stock-community-summary

## Context: what already exists

### Tables
- `memory_candidates` (M3) — candidate_type, title, summary, normalized_rule, evidence_refs_json, symbols_json, candidate_status, review_flags_json, created_by, confidence, ...
- `source_artifacts` (M0)
- `document_sections` (M1)
- `agent_events`
- `memory_items` — NOT YET EXISTS

### Modules
- `evidence_ref.py` (M3) — EvidenceRef dataclass with 5 ref types, from_dict(), as_dict(), resolve(engine). Import `EvidenceRef`, `RefType`, `ResolverStatus`.
- `candidate_extractor.py` (M3) — extract_candidates_from_sections(), draft_candidates_with_llm(). Has `_call_deepseek_json(settings, prompt)` — reuse this pattern for extract-preview.
- `candidate_service.py` (M3) — create_candidates(), list_candidates(), get_candidate()

### API
- `api/agent.py` — knowledge_router with `/search`, `/reindex`, `/scan-artifacts`, `/candidates` (POST/GET/GET:id)
- `bootstrap_database(settings)` at each endpoint

### DeepSeek call pattern (from candidate_extractor.py)
```python
import json, urllib.request, urllib.error

def _call_deepseek_json(settings, prompt):
    payload = {
        "model": settings.deepseek_model,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": "Return only JSON..."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0,
    }
    headers = {
        "Authorization": f"Bearer {settings.deepseek_api_key}",
        "Content-Type": "application/json",
    }
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(settings.deepseek_base_url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(request, timeout=settings.model_call_timeout_seconds) as response:
        body = json.loads(response.read().decode("utf-8"))
    content = body["choices"][0]["message"]["content"]
    return json.loads(content) if isinstance(content, str) else content
```

## Confirmed decisions

1. **Independent `memory_items` table** — separate from `memory_candidates`. Different lifecycle, different fields.
2. **Direct edit** — `PATCH /memory-items/{id}` updates fields directly, with `updated_by` field ("human" | "agent"). No review workflow for edits.
3. **No `memory_versions`** — Git is the version history.
4. **Conflict detection** — same symbol + overlapping tags/scope + different direction/invalidation → `possible_conflict` flag. Activates do NOT block, but audit event fires.
5. **Batch operations** — `POST /candidates/batch` with `{candidate_ids, action: "activate"|"reject"}`.
6. **Extract-preview flow** — LLM extracts from text → returns structured preview → human confirms → stores as memory_item.
7. **Backend only** — no Cockpit frontend changes.
8. **All canonical events** from PRD §6.4.

## Allowed files

- `apps/trader-agent/backend/app/db/models.py` — add `memory_items` table
- `apps/trader-agent/backend/app/modules/extract_preview.py` — NEW
- `apps/trader-agent/backend/app/modules/memory_service.py` — NEW (CRUD + state transitions)
- `apps/trader-agent/backend/app/modules/conflict_detector.py` — NEW
- `apps/trader-agent/backend/app/api/agent.py` — add endpoints to `knowledge_router`
- `apps/trader-agent/backend/tests/test_extract_preview.py` — NEW
- `apps/trader-agent/backend/tests/test_memory_service.py` — NEW
- `apps/trader-agent/backend/tests/test_conflict_detector.py` — NEW
- `apps/trader-agent/backend/tests/test_memory_api.py` — NEW

## Forbidden files

- `apps/trader-cockpit/**`, `config.json`
- `document_indexer.py`, `local_search.py`, `knowledge_source_registry.py`
- `corpus_search.py`, `markdown_section_indexer.py`, `artifact_catalog.py`
- `evidence_ref.py`, `candidate_extractor.py`, `candidate_service.py`
- `rule_discovery.py`, `rule_engine.py`, `scoring.py`
- `document_chunks` / `document_chunks_fts`
- package manager files, frontend files

## Task 1: `memory_items` table in models.py

Add after `memory_candidates`:

```python
memory_items = Table(
    "memory_items",
    metadata,
    uuid_column("id", primary_key=True, nullable=False),
    Column("memory_type", Text, nullable=False),
    Column("title", Text, nullable=False),
    Column("summary", Text),
    Column("rule_text", Text),
    Column("applicability", Text),
    Column("invalidation", Text),
    json_column("evidence_refs_json"),
    json_column("symbols_json"),
    json_column("related_symbols_json"),
    json_column("asset_classes_json"),
    json_column("tags_json"),
    Column("market_scope", Text),
    Column("confidence", Numeric),
    Column("status", Text, nullable=False, default="active"),
    Column("updated_by", Text, nullable=False, default="human"),
    timestamp_column("valid_from"),
    timestamp_column("valid_until"),
    timestamp_column("last_reviewed_at"),
    timestamp_column("created_at"),
    timestamp_column("updated_at"),
)
```

## Task 2: `extract_preview.py` — LLM conversational extraction

```python
from dataclasses import dataclass
from app.core.config import Settings

@dataclass
class ExtractPreviewResult:
    memory_type: str
    title: str
    summary: str
    rule_text: str
    applicability: str | None
    invalidation: str | None
    symbols: list[str]
    tags: list[str]
    confidence: float

def extract_preview(settings: Settings, text: str, *, context_note: str | None = None) -> ExtractPreviewResult | None:
    ...
```

Implementation:
1. If `text` is empty or whitespace → return None
2. Build a prompt:
   ```
   Extract a memory item from the following text. Return JSON:
   {"memory_type": "...", "title": "...", "summary": "...", "rule_text": "...",
    "applicability": "...", "invalidation": "...", "symbols": [...], "tags": [...], "confidence": 0.7}
   
   memory_type must be one of: market_mechanism, trading_rule, source_pattern_summary
   If the text does not contain a clear financial memory, return {"memory_type": "none"}
   
   Text: {text}
   Context: {context_note or "none"}
   ```
3. Call `_call_deepseek_json(settings, prompt)` — reuse the same pattern as `candidate_extractor.py`
4. Parse response → ExtractPreviewResult
5. If `memory_type == "none"` or parse error → return None

## Task 3: `conflict_detector.py`

```python
def detect_conflict(
    item: dict,           # new memory_item dict
    existing_items: list[dict],  # existing active memory_items
) -> bool:
    """Check if item conflicts with any existing active memory."""
    ...

def mark_conflict(
    settings: Settings,
    item_id: str,
    conflicting_item_id: str,
) -> None:
    """Mark both items as conflicted, write audit events."""
    ...
```

Conflict logic:
1. `item.symbols_json` ∩ `existing.symbols_json` non-empty
2. AND (`item.tags_json` ∩ `existing.tags_json` non-empty OR `item.market_scope == existing.market_scope`)
3. AND direction keywords are opposite (buy/sell, long/short, 做多/做空, call/put, above/below) OR invalidation conditions are fundamentally contradictory
4. If all three → conflict

## Task 4: `memory_service.py` — CRUD + state machine

```python
from dataclasses import dataclass

@dataclass
class ActivateResult:
    memory_item_id: str
    candidate_ids: list[str]
    conflicts_found: list[str]  # list of conflicting memory_item_ids

@dataclass
class BatchResult:
    activated: list[str]
    rejected: list[str]
    skipped: list[str]  # conflicted or already processed


# ---- Memory Items CRUD ----

def create_memory_item(settings: Settings, item: dict) -> dict: ...

def list_memory_items(
    settings: Settings, *, status: str | None = None, memory_type: str | None = None,
    symbol: str | None = None, limit: int = 20, offset: int = 0,
) -> list[dict]: ...

def get_memory_item(settings: Settings, item_id: str) -> dict | None: ...

def update_memory_item(
    settings: Settings, item_id: str, updates: dict, updated_by: str = "human",
) -> dict | None: ...

def deprecate_memory_item(settings: Settings, item_id: str) -> dict | None: ...


# ---- Candidate State Transitions ----

def activate_candidate(settings: Settings, candidate_id: str) -> ActivateResult: ...
def reject_candidate(settings: Settings, candidate_id: str) -> dict: ...
def merge_candidate(settings: Settings, candidate_id: str, target_memory_item_id: str) -> dict: ...
def batch_process(settings: Settings, candidate_ids: list[str], action: str) -> BatchResult: ...
```

Implementation notes:

- `activate_candidate`:
  1. Read candidate from `memory_candidates`
  2. Build `memory_items` row from candidate fields
  3. Run `detect_conflict()` against existing active items
  4. INSERT memory_item, UPDATE candidate status=activated
  5. Write `memory_candidate_activated` event
  6. If conflict → write `memory_conflict_marked` event

- `reject_candidate`: UPDATE candidate status=rejected, write event
- `merge_candidate`: append candidate's evidence_refs to target memory_item's evidence_refs, update candidate status=merged, write event
- `batch_process`: loop through IDs, handle each, return counts. Skip conflicted items.

- `update_memory_item`: UPDATE the row, set `updated_by` and `updated_at`. No review gate.

- `deprecate_memory_item`: UPDATE status=deprecated, write event.

## Task 5: API endpoints in `api/agent.py`

Add to `knowledge_router`:

### POST /api/knowledge/extract-preview

```python
class ExtractPreviewRequest(BaseModel):
    text: str
    context_note: str | None = None

@knowledge_router.post("/extract-preview")
def extract_preview_endpoint(request: Request, payload: ExtractPreviewRequest) -> dict:
    settings = _settings(request)
    result = extract_preview(settings, payload.text, context_note=payload.context_note)
    if result is None:
        raise HTTPException(status_code=422, detail="Could not extract memory from text")
    return asdict(result)
```

### POST /api/knowledge/memory-items

```python
class CreateMemoryItemRequest(BaseModel):
    memory_type: str
    title: str
    summary: str | None = None
    rule_text: str | None = None
    applicability: str | None = None
    invalidation: str | None = None
    symbols_json: list[str] | None = None
    related_symbols_json: list[str] | None = None
    asset_classes_json: list[str] | None = None
    tags_json: list[str] | None = None
    market_scope: str | None = None
    confidence: float | None = None
    evidence_refs_json: list[dict] | None = None

@knowledge_router.post("/memory-items")
def create_memory_item_endpoint(request: Request, payload: CreateMemoryItemRequest) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)
    item = create_memory_item(settings, payload.model_dump(exclude_none=True))
    record_agent_event(settings, event_type="memory_candidate_activated", status="completed",
                       input_summary={"memory_item_id": item["id"]})
    return item
```

### GET /api/knowledge/memory-items

```python
@knowledge_router.get("/memory-items")
def list_memory_items_endpoint(
    request: Request, status: str | None = None, memory_type: str | None = None,
    symbol: str | None = None, limit: int = 20, offset: int = 0,
) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)
    rows = list_memory_items(settings, status=status, memory_type=memory_type,
                             symbol=symbol, limit=limit, offset=offset)
    return {"results": rows, "limit": limit, "offset": offset}
```

### GET /api/knowledge/memory-items/{id}

Same pattern as `GET /candidates/{id}` — fetch + resolve evidence refs.

### PATCH /api/knowledge/memory-items/{id}

```python
class UpdateMemoryItemRequest(BaseModel):
    # All fields optional
    title: str | None = None
    summary: str | None = None
    rule_text: str | None = None
    applicability: str | None = None
    invalidation: str | None = None
    symbols_json: list[str] | None = None
    tags_json: list[str] | None = None
    market_scope: str | None = None
    confidence: float | None = None
    updated_by: str = "human"

@knowledge_router.patch("/memory-items/{item_id}")
def update_memory_item_endpoint(request: Request, item_id: str, payload: UpdateMemoryItemRequest) -> dict:
    ...
```

### POST /api/knowledge/candidates/{id}/activate

```python
@knowledge_router.post("/candidates/{candidate_id}/activate")
def activate_candidate_endpoint(request: Request, candidate_id: str) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)
    result = activate_candidate(settings, candidate_id)
    # Write events AFTER transaction
    ...
    return {"memory_item_id": result.memory_item_id, "conflicts_found": result.conflicts_found}
```

### POST /api/knowledge/candidates/{id}/reject

### POST /api/knowledge/candidates/{id}/merge

```python
class MergeRequest(BaseModel):
    target_memory_item_id: str
```

### POST /api/knowledge/candidates/batch

```python
class BatchRequest(BaseModel):
    candidate_ids: list[str]
    action: str  # "activate" | "reject"
```

### POST /api/knowledge/memory-items/{id}/deprecate

### POST /api/knowledge/memory-items/{id}/mark-conflict

```python
class MarkConflictRequest(BaseModel):
    conflicting_item_id: str
```

## Task 6: Tests

### test_extract_preview.py
- extract_preview returns structured result with valid memory_type
- extract_preview with empty text → None
- extract_preview result fields are populated (title, summary, symbols)
- extract_preview handles DeepSeek error gracefully → None

### test_memory_service.py
- create_memory_item → status=active, all fields persisted
- update_memory_item → fields updated, updated_by set
- activate_candidate → candidate status→activated, memory_item created
- activate_candidate copies evidence_refs, symbols from candidate
- reject_candidate → candidate status→rejected
- merge_candidate → target memory_item evidence_refs extended
- deprecate_memory_item → status→deprecated
- batch_process activate → correct counts
- batch_process skip → conflicted items counted as skipped
- audit events written for all transitions

### test_conflict_detector.py
- same symbol + tag overlap + opposite direction → conflict
- same symbol + no tag overlap → no conflict
- different symbols → no conflict
- same direction → no conflict

### test_memory_api.py
- POST /extract-preview → 200 with preview
- POST /memory-items → 201
- GET /memory-items → paginated list
- PATCH /memory-items/{id} → 200
- POST /candidates/{id}/activate → 200
- POST /candidates/{id}/reject → 200
- POST /candidates/batch → 200 with counts
- POST /memory-items/{id}/deprecate → 200
- Full regression: M0/M1/M2/M3 tests pass

## Verification commands

```powershell
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_extract_preview.py apps/trader-agent/backend/tests/test_memory_service.py apps/trader-agent/backend/tests/test_conflict_detector.py apps/trader-agent/backend/tests/test_memory_api.py -v --tb=short
.venv/Scripts/python.exe -m ruff check apps/trader-agent/backend/app/modules/extract_preview.py apps/trader-agent/backend/app/modules/memory_service.py apps/trader-agent/backend/app/modules/conflict_detector.py apps/trader-agent/backend/app/api/agent.py
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_artifact_catalog.py apps/trader-agent/backend/tests/test_markdown_section_indexer.py apps/trader-agent/backend/tests/test_corpus_search.py apps/trader-agent/backend/tests/test_evidence_ref.py apps/trader-agent/backend/tests/test_candidate_extractor.py apps/trader-agent/backend/tests/test_candidate_api.py -v --tb=short
```

## Important: do NOT commit

## Final response
- List of changed files
- Commands run and their results
- Any failed command output
- Known gaps or risks
