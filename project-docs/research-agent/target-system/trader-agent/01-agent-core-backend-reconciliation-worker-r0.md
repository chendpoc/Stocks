# R0 Worker Prompt — EvidenceRef Standardization

Target model: Cursor Composer 2.5
Source plan: [01-agent-core-backend-reconciliation-plan.md](./01-agent-core-backend-reconciliation-plan.md)
Phase: R0 of 3
Generated: 2026-05-29

---

Standardize evidence references across the Phase 1C pipeline: replace colon-delimited
string format with the `EvidenceRef` dataclass from M3.

## Repository root

D:\workspace\01-products\stock-community-summary

## Context

### Current state

`market_snapshot.py` defines `_evidence_ref(provider, symbol, timestamp) -> str` which produces `"provider:symbol:timestamp"` strings. This format flows through:

```
MarketSnapshot.evidence_refs: list[str]
  → SetupCandidate.evidence_refs: list[str]
    → RuleEvaluation.rule_context.evidence.candidate_evidence_refs
      → ScoreResult (via candidate.evidence_refs)
        → signal_manager._evidence() → serialized to JSON
```

### Target state

All `evidence_refs: list[str]` become `evidence_refs: list[EvidenceRef]`, where `EvidenceRef` is from `app.modules.evidence_ref` (M3). The dataclass provides:

```python
@dataclass
class EvidenceRef:
    ref_type: RefType          # DOCUMENT_SECTION | RAW_CHAT_MESSAGE | NEWS_ARCHIVE | ...
    ref_id: str                # the original reference identifier
    artifact_id: str           # UUID of the artifact
    artifact_path: str         # relative path
    artifact_hash: str | None
    source_date: str | None
    resolver_status: ResolverStatus  # RESOLVED | STALE | UNRESOLVED
    # ... per-type fields
```

### What you can import from M3

```python
from app.modules.evidence_ref import EvidenceRef, RefType, ResolverStatus

# Creating an EvidenceRef for a market data provider:
ref = EvidenceRef(
    ref_type=RefType.RAW_CHAT_MESSAGE,  # or NEWS_ARCHIVE for news sources
    ref_id=f"{provider}:{symbol}:{timestamp}",  # keep the old string as the identifier
    artifact_id="",  # market data has no local artifact — use empty string or generate
    artifact_path=f"{provider}:{symbol}",  # descriptive path
    source_date=timestamp,
)
```

## Allowed files

- `apps/trader-agent/backend/app/modules/market_snapshot.py`
- `apps/trader-agent/backend/app/modules/setup_detection.py`
- `apps/trader-agent/backend/app/modules/rule_engine.py`
- `apps/trader-agent/backend/app/modules/scoring.py`
- `apps/trader-agent/backend/app/modules/signal_manager.py`
- `apps/trader-agent/backend/app/modules/runtime_orchestrator.py`
- `apps/trader-agent/backend/tests/test_market_snapshot.py`
- `apps/trader-agent/backend/tests/test_setup_detection.py`
- `apps/trader-agent/backend/tests/test_signal_pipeline.py`
- `apps/trader-agent/backend/tests/test_scoring.py`
- `apps/trader-agent/backend/tests/test_runtime_orchestrator.py`

## Forbidden files

- All M0-M6 modules (evidence_ref.py, memory_service.py, context_selector.py, etc.)
- `document_indexer.py`, `local_search.py`
- `apps/trader-cockpit/**`
- `config.json`

## Changes

### 1. `market_snapshot.py`

**Delete** `_evidence_ref()` function.

**Change** `EvidenceGap.evidence_refs` and `MarketSnapshot.evidence_refs` from `list[str]` to `list[EvidenceRef]`.

**In `build_market_snapshot()`** (the function that calls `_evidence_ref`): replace each call with an `EvidenceRef` constructor:

```python
# OLD
evidence_refs=[
    _evidence_ref(item.provider, item.symbol, item.timestamp) for item in evidence
]

# NEW
evidence_refs=[
    EvidenceRef(
        ref_type=RefType.NEWS_ARCHIVE,
        ref_id=f"{item.provider}:{item.symbol}:{item.timestamp}",
        artifact_id="",
        artifact_path=f"{item.provider}:{item.symbol}",
        source_date=str(item.timestamp),
    )
    for item in evidence
]
```

For bar/price data, use `RefType.RAW_CHAT_MESSAGE` as fallback. If the source is clearly news or filings, use the appropriate type.

### 2. `setup_detection.py`

**Change** `SetupCandidate.evidence_refs` from `list[str]` to `list[EvidenceRef]`.

**Change** all internal `evidence_refs` tuple construction to use EvidenceRef objects instead of strings.

**Delete** `_refs()` helper (line 266) — it extracts strings from dict records. Replace with EvidenceRef construction.

**In `detect_setups()` return types**: all `evidence_refs` fields become `list[EvidenceRef]`.

### 3. `rule_engine.py`

**Change** the `rule_context["evidence"]["candidate_evidence_refs"]` component from `list[str]` to list of EvidenceRef dicts:

```python
# OLD
"candidate_evidence_refs": list(candidate.evidence_refs)

# NEW
"candidate_evidence_refs": [ref.as_dict() for ref in candidate.evidence_refs]
```

### 4. `scoring.py`

**Change** `_evidence_quality()` from counting string refs to using EvidenceRef:

```python
# OLD (line 153-154)
return min(max_score, len(candidate.evidence_refs) * (max_score / 3))

# NEW — count unique artifact_ids among resolved refs
resolved_count = len({
    ref.artifact_id
    for ref in candidate.evidence_refs
    if ref.artifact_id and ref.resolver_status == ResolverStatus.RESOLVED
})
return min(max_score, max(1, resolved_count) * (max_score / 3))
```

**Change** `_catalyst_score()` (line 157-170) — the string-parsing logic for evidence refs. Replace with type-based checking:

```python
# OLD: parse strings like "news:" or "filing:"
# NEW: check ref.ref_type
has_news = any(ref.ref_type == RefType.NEWS_ARCHIVE for ref in candidate.evidence_refs)
has_filing = any(ref.ref_type == RefType.FILING_ARCHIVE for ref in candidate.evidence_refs)
```

### 5. `signal_manager.py`

**Change** `_evidence()` method: serialize EvidenceRef objects using `.as_dict()`. When reading `snapshot.evidence_refs` or `candidate.evidence_refs`, iterate EvidenceRef objects:

```python
"evidence_refs": [ref.as_dict() for ref in snapshot.evidence_refs],
```

### 6. `runtime_orchestrator.py`

**Change** evidence_refs collection (lines 106-113, 197-203) from set of strings to set of EvidenceRef dicts:

```python
# OLD
"evidence_refs": sorted({
    evidence_ref
    for item in symbol_results
    for evidence_ref in item["evidence_refs"]
})

# NEW
"evidence_refs": sorted(
    {
        ref.as_dict() if isinstance(ref, EvidenceRef) else ref
        for item in symbol_results
        for ref in item.get("evidence_refs", [])
    },
    key=lambda r: r.get("source_date", "") if isinstance(r, dict) else "",
)
```

## Tests

Update existing test assertions that check evidence_refs format. All tests that assert `evidence_refs` values need to expect EvidenceRef dicts instead of colon-delimited strings.

Do NOT create new test files. Update existing fixtures and assertions.

## Verification

```powershell
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_market_snapshot.py apps/trader-agent/backend/tests/test_setup_detection.py apps/trader-agent/backend/tests/test_signal_pipeline.py apps/trader-agent/backend/tests/test_runtime_orchestrator.py -v --tb=short
.venv/Scripts/python.exe -m ruff check apps/trader-agent/backend/app/modules/market_snapshot.py apps/trader-agent/backend/app/modules/setup_detection.py apps/trader-agent/backend/app/modules/rule_engine.py apps/trader-agent/backend/app/modules/scoring.py apps/trader-agent/backend/app/modules/signal_manager.py apps/trader-agent/backend/app/modules/runtime_orchestrator.py
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_evidence_ref.py apps/trader-agent/backend/tests/test_memory_api.py apps/trader-agent/backend/tests/test_candidate_api.py -v --tb=short
```

## Do NOT commit

## Final response

- Changed files
- Commands run, results
- Failed output, gaps, risks
