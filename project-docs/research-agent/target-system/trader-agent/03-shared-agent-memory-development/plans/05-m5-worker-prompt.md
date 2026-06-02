# M5 Worker Prompt — Active Memory Context Injection

Target model: Cursor Composer 2.5
Source plan: [05-m5-context-injection.md](./05-m5-context-injection.md)
Generated: 2026-05-29

---

Implement Shared Agent Memory M5: Active Memory Context Injection.

## Goal

Build the `context_selector` module that, given an Agent task context (task_type, symbols, tags, market_scope), selects the most relevant active `memory_items`, scores them, and returns a budget-limited context payload with citation metadata.

## Repository root

D:\workspace\01-products\stock-community-summary

## Context: what already exists

### Tables
- `memory_items` (M4) — active memory with status, symbols_json, tags_json, market_scope, confidence, evidence_refs_json, valid_from, valid_until, last_reviewed_at
- `memory_candidates` (M3) — candidate memories (NOT queried by M5; only active items are injected)
- `document_sections` (M1)
- `agent_events`

### API
- `knowledge_router` in `api/agent.py` — `/search`, `/candidates`, `/memory-items`, `/extract-preview`, etc. Add `/select-context`.

### Shared
- `_json.py`: `dumps()`, `loads()`
- `events.py`: `record_agent_event(settings, event_type=..., status=..., input_summary=...)`
- `time.py`: `utc_now_iso()`
- `session.py`: `create_sqlite_engine(settings)`

## Confirmed decisions

1. **Dual interface**: Pure function `select_context(settings, ...)` for Agent Core + REST endpoint `POST /api/knowledge/select-context` for external callers.
2. **task_types**: `market_intent_explanation`, `signal_explanation`, `agent_conversation`, `learning_review`. Extensible.
3. **Scoring weights**: Hardcoded module constants (see below). Not config-file driven.
4. **Budget**: 5 memories max, 800 chars per memory, 3000 chars total.
5. **Confidence threshold**: < 0.5 excluded.
6. **Only active** — status=active, valid_until not expired.
7. **Audit on API call** — `memory_context_selected` event. Pure function calls leave auditing to the caller.

## Allowed files

- `apps/trader-agent/backend/app/modules/context_selector.py` — NEW
- `apps/trader-agent/backend/app/api/agent.py` — add `POST /select-context` to `knowledge_router`
- `apps/trader-agent/backend/tests/test_context_selector.py` — NEW
- `apps/trader-agent/backend/tests/test_context_api.py` — NEW (for the endpoint)

## Forbidden files

- `apps/trader-cockpit/**`, `config.json`
- All existing modules in `app/modules/` (memory_service.py, candidate_service.py, evidence_ref.py, candidate_extractor.py, corpus_search.py, etc.)
- `document_chunks` / `document_chunks_fts`
- package manager files, frontend files

## Task 1: `context_selector.py`

New file. Core logic only — no HTTP, no FastAPI.

### Data types

```python
from dataclasses import dataclass, field
from typing import Any

SELECTOR_VERSION = "v1"

_TASK_TYPE_PREFERENCE: dict[str, list[str]] = {
    "market_intent_explanation": ["market_mechanism", "source_pattern_summary"],
    "signal_explanation": ["trading_rule", "market_mechanism"],
    "agent_conversation": ["source_pattern_summary", "trading_rule", "market_mechanism"],
    "learning_review": ["trading_rule", "market_mechanism"],
}

_SCORE_WEIGHTS = {
    "symbol_match": 30,
    "related_symbol_match": 15,
    "tag_match": 25,
    "task_type_preferred": 20,
    "task_type_secondary": 10,
    "market_scope_match": 10,
    "recency_bonus": 5,
    "evidence_bonus": 5,
}

@dataclass
class ContextMemory:
    memory_id: str
    memory_type: str
    title: str
    summary: str
    rule_text: str
    symbols: list[str]
    confidence: float
    relevance_score: int
    rank: int
    # Citation
    source_date: str | None
    heading_path: str | None
    evidence_count: int

@dataclass
class ContextSelectionResult:
    memories: list[ContextMemory]
    total_chars: int
    excluded_count: int
    selector_version: str = SELECTOR_VERSION
    selected_reasons: dict[str, list[str]] = field(default_factory=dict)
    excluded_reasons: dict[str, str] = field(default_factory=dict)
```

### Core function

```python
def select_context(
    settings: Settings,
    *,
    task_type: str,
    symbols: list[str] | None = None,
    tags: list[str] | None = None,
    market_scope: str | None = None,
    page_context: str | None = None,
    max_memories: int = 5,
    max_chars_per_memory: int = 800,
    max_total_chars: int = 3000,
) -> ContextSelectionResult:
    ...
```

### Implementation

1. **Validate**: `task_type` must be a valid key in `_TASK_TYPE_PREFERENCE` (or at minimum, not empty). If unknown, use `agent_conversation` as fallback.

2. **Query**: SELECT from `memory_items` WHERE `status = 'active'` AND `confidence >= 0.5`.

3. **Filter** (Python-side, after fetch):
   - If `valid_until` is set AND `valid_until < utc_now_iso()` → exclude (reason: "expired")
   - `valid_until` is None → not expired

4. **Score** each item:
   ```python
   score = 0
   reasons = []
   item_symbols = _normalize_list(item["symbols_json"])
   item_tags = _normalize_list(item["tags_json"])
   related = _normalize_list(item.get("related_symbols_json"))

   for sym in (symbols or []):
       sym_upper = sym.strip().upper()
       if sym_upper in item_symbols:
           score += _SCORE_WEIGHTS["symbol_match"]
           reasons.append(f"symbol:{sym}")
       if sym_upper in related:
           score += _SCORE_WEIGHTS["related_symbol_match"]
           reasons.append(f"related_symbol:{sym}")

   for tag in (tags or []):
       if tag.strip().lower() in {t.lower() for t in item_tags}:
           score += _SCORE_WEIGHTS["tag_match"]
           reasons.append(f"tag:{tag}")

   memory_type = item.get("memory_type")
   prefs = _TASK_TYPE_PREFERENCE.get(task_type, [])
   if memory_type in prefs:
       score += _SCORE_WEIGHTS["task_type_preferred"] if memory_type == prefs[0] else _SCORE_WEIGHTS["task_type_secondary"]
       reasons.append(f"type:{memory_type}")

   if market_scope and item.get("market_scope") == market_scope:
       score += _SCORE_WEIGHTS["market_scope_match"]
       reasons.append("scope_match")

   # Recency: +5 if last_reviewed_at within 30 days
   last_reviewed = item.get("last_reviewed_at")
   if last_reviewed and last_reviewed >= _days_ago(30):
       score += _SCORE_WEIGHTS["recency_bonus"]
       reasons.append("recent")

   # Evidence bonus: +5 if >= 2 evidence refs
   evidence_refs = _normalize_list(item.get("evidence_refs_json"))
   if len(evidence_refs) >= 2:
       score += _SCORE_WEIGHTS["evidence_bonus"]
       reasons.append("evidence")

   # Zero-score items with no match at all → exclude ("no_match")
   ```
   Items with score == 0 → exclude (reason: "no_relevant_match").

5. **Sort**: by `relevance_score` DESC, then `last_reviewed_at` DESC.

6. **Budget enforcement**:
   ```python
   selected = []
   total_chars = 0
   for item in sorted_items:
       if len(selected) >= max_memories:
           break
       text_content = item.get("rule_text") or item.get("summary") or ""
       snippet = text_content[:max_chars_per_memory]
       if total_chars + len(snippet) > max_total_chars:
           break
       # build ContextMemory...
       selected.append(memory)
       total_chars += len(snippet)
   ```

7. **Build ContextMemory** for each selected item:
   - `heading_path`: from first `evidence_ref` where `ref_type == "document_section"`. If multiple, use the first.
   - `source_date`: from `evidence_refs[0].source_date` or `item.created_at`
   - `evidence_count`: `len(evidence_refs)`

8. **Return** `ContextSelectionResult` with selected memories, exclusion reasons, total_chars.

### Helper: `_normalize_list`

```python
from app.modules._json import loads

def _normalize_list(value: Any) -> list:
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        return loads(value, [])
    return []
```

### Helper: `_days_ago`

```python
from datetime import datetime, timedelta, timezone

def _days_ago(n: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=n)).isoformat()
```

## Task 2: API endpoint — `POST /api/knowledge/select-context`

In `api/agent.py`, add to `knowledge_router`:

```python
from pydantic import BaseModel
from app.modules.context_selector import select_context

class SelectContextRequest(BaseModel):
    task_type: str
    symbols: list[str] | None = None
    tags: list[str] | None = None
    market_scope: str | None = None
    page_context: str | None = None
    max_memories: int = 5
    max_total_chars: int = 3000

@knowledge_router.post("/select-context")
def select_context_endpoint(request: Request, payload: SelectContextRequest) -> dict:
    settings = _settings(request)
    bootstrap_database(settings)

    result = select_context(
        settings,
        task_type=payload.task_type,
        symbols=payload.symbols,
        tags=payload.tags,
        market_scope=payload.market_scope,
        page_context=payload.page_context,
        max_memories=payload.max_memories,
        max_total_chars=payload.max_total_chars,
    )

    # Write audit event (API call path only)
    record_agent_event(
        settings,
        event_type="memory_context_selected",
        status="completed",
        input_summary={
            "selector_version": result.selector_version,
            "task_type": payload.task_type,
            "symbols": payload.symbols,
            "tags": payload.tags,
            "selected_memory_ids": [m.memory_id for m in result.memories],
            "selected_count": len(result.memories),
            "excluded_count": result.excluded_count,
            "total_chars": result.total_chars,
        },
    )

    return {
        "memories": [dataclasses.asdict(m) for m in result.memories],
        "total_chars": result.total_chars,
        "excluded_count": result.excluded_count,
        "selector_version": result.selector_version,
        "selected_reasons": result.selected_reasons,
    }
```

## Task 3: Tests

### test_context_selector.py

| Test | Assertion |
|---|---|
| `test_selects_active_matching_symbol` | seed memory_items with SPY → query symbols=[SPY] → result contains it |
| `test_excludes_deprecated_and_conflicted` | seed 3 items (active, deprecated, conflicted) → only active returned |
| `test_excludes_low_confidence` | confidence=0.3, 0.4, 0.5, 0.7 → only 0.5 and 0.7 returned |
| `test_respects_max_memories` | seed 10 items, max_memories=3 → len(result) <= 3 |
| `test_respects_total_chars` | seed items with varying text length → total_chars <= budget |
| `test_scores_symbol_match_above_scope_match` | one with SYM=SPY, one with same market_scope → symbol match ranks higher |
| `test_returns_empty_when_no_match` | symbols=["ZZZZ"] with no matching items → empty result |
| `test_task_type_preference` | market_intent_explanation → market_mechanism items scored higher |
| `test_excludes_expired_valid_until` | valid_until=2020-01-01 → excluded |
| `test_excludes_no_match_zero_score` | item with no symbol/tag/type/scope overlap → excluded |
| `test_recency_bonus` | last_reviewed_at < 30 days ago vs > 30 days → recent gets +5 |
| `test_evidence_bonus` | evidence_refs_json with 1 item vs 3 items → 3 items gets +5 |
| `test_heading_path_from_evidence_ref` | ContextMemory has heading_path from first document_section ref |
| `test_source_date_from_evidence_ref` | ContextMemory has source_date from evidence or created_at |

### test_context_api.py

| Test | Assertion |
|---|---|
| `test_post_select_context_returns_200` | POST with valid task_type → 200 |
| `test_post_select_context_writes_audit_event` | memory_context_selected in agent_events |
| `test_post_select_context_returns_no_results_for_no_match` | 200, empty list |
| `test_full_regression` | M0-M4 tests pass |

## Verification

```powershell
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_context_selector.py apps/trader-agent/backend/tests/test_context_api.py -v --tb=short
.venv/Scripts/python.exe -m ruff check apps/trader-agent/backend/app/modules/context_selector.py apps/trader-agent/backend/app/api/agent.py
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_artifact_catalog.py apps/trader-agent/backend/tests/test_markdown_section_indexer.py apps/trader-agent/backend/tests/test_corpus_search.py apps/trader-agent/backend/tests/test_evidence_ref.py apps/trader-agent/backend/tests/test_candidate_api.py apps/trader-agent/backend/tests/test_memory_api.py -v --tb=short
```

## Do NOT commit

## Final response

- Changed files
- Commands run, results
- Failed output, gaps, risks
