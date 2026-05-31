# R1 Worker Prompt — Pipeline Memory Injection

Target model: Cursor Composer 2.5
Source plan: [01-agent-core-backend-reconciliation-plan.md](./01-agent-core-backend-reconciliation-plan.md)
Phase: R1 of 3 (depends on R0)
Generated: 2026-05-29

---

Inject Shared Memory (select_context + memory_items) into the Phase 1C pipeline:
orchestrator queries memory before scanning, high-confidence signals auto-create
candidates, and playbook outputs feed into memory_items.

## Repository root

D:\workspace\01-products\stock-community-summary

## Context

### What you can call from M0-M6

```python
from app.modules.context_selector import select_context, ContextSelectionResult, ContextMemory
# select_context(settings, *, task_type, symbols, tags, market_scope, ...) -> ContextSelectionResult

from app.modules.memory_service import create_memory_item
# create_memory_item(settings, item_dict, confirm=False) -> dict

from app.modules.evidence_ref import EvidenceRef, RefType
# EvidenceRef dataclass with 5 ref types
```

### Orchestrator flow (current)

```
run_symbol(symbol):
  build_market_snapshot(symbol) → snapshot
  detect_setups(snapshot) → candidates
  for candidate:
    evaluate_rule(candidate, rulepack, snapshot) → rule_result
    score_candidate(candidate, rule_result, snapshot) → score_result
    assess_risk(candidate, rule_result, score_result, rulepack) → risk_result
    persist_signal(candidate, rule_result, score_result, risk_result, snapshot) → signal
```

### Signal score field

The `score_result.total_score` is a float (0-1). R1 uses 0.7 as the threshold for auto-creating candidates.

## Allowed files

- `apps/trader-agent/backend/app/modules/runtime_orchestrator.py`
- `apps/trader-agent/backend/app/modules/signal_manager.py`
- `apps/trader-agent/backend/app/modules/playbook.py`
- `apps/trader-agent/backend/tests/test_runtime_orchestrator.py`
- `apps/trader-agent/backend/tests/test_signal_pipeline.py`
- `apps/trader-agent/backend/tests/test_playbook.py` (if exists)

## Forbidden files

- All M0-M6 modules (context_selector.py may be imported but NOT modified)
- `document_indexer.py`, `local_search.py`
- `apps/trader-cockpit/**`
- `config.json`

## Changes

### 1. `runtime_orchestrator.py` — inject memory before scan

In `run_symbol()`, before `build_market_snapshot()`, add:

```python
# Query active memory items relevant to this symbol
from app.modules.context_selector import select_context
context_result = select_context(
    settings,
    task_type="signal_explanation",
    symbols=[symbol],
    max_memories=3,
    max_total_chars=2000,
)
# Attach to the symbol result for downstream use
memory_context = [
    {"memory_id": m.memory_id, "title": m.title, "rule_text": m.rule_text}
    for m in context_result.memories
]
```

Pass `memory_context` into the symbol result dict that's accumulated in `run_scan()` and `run_symbol()`. It should appear in:
- The per-symbol result dict
- The per-scan event `input_summary`

At the end of `run_symbol()`, after signals are persisted, add:

```python
# Feed high-confidence signals back to memory
for signal in signals_persisted:
    score = signal.get("score", 0)
    if score >= 0.7:
        create_memory_item(
            settings,
            {
                "memory_type": "trading_rule",
                "title": f"{signal['symbol']} {signal.get('setup_type', 'signal')}",
                "summary": signal.get("explanation", "")[:500],
                "rule_text": signal.get("rule_text", ""),
                "symbols_json": [signal["symbol"]],
                "confidence": score,
                "candidate_status": "candidate",
                "created_by": "pipeline",
                "evidence_refs_json": signal.get("evidence_refs", []),
            },
        )
```

Edge case: `create_memory_item` may raise `MemoryItemConflictError` if it conflicts with existing active memory. Catch it — the signal was already persisted, the memory feedback is best-effort.

### 2. `signal_manager.py` — pass score through

Ensure `persist_signal()` returns the score in its return dict so the orchestrator can use it. If the function already returns a dict with score info, just verify the key name. If not, add `"score": score_result.total_score` to the return value.

### 3. `playbook.py` — output to memory_items

In `aggregate_playbooks()`, after playbooks are written, add:

```python
from app.modules.memory_service import get_memory_item, create_memory_item

for playbook in new_playbooks:
    # Check if a memory_item already exists for this playbook
    # (simple title match — if not found, create one)
    playbook_row = ...  # the row just inserted
    create_memory_item(
        settings,
        {
            "memory_type": "trading_rule",
            "title": playbook_row["name"],
            "summary": playbook_row.get("description", ""),
            "rule_text": playbook_row.get("description", ""),
            "symbols_json": loads(playbook_row.get("symbols", "[]")),
            "confidence": float(playbook_row.get("confidence", 0.6)),
            "tags_json": [playbook_row.get("setup_type")] if playbook_row.get("setup_type") else [],
            "created_by": "playbook",
        },
    )
```

Catch `MemoryItemConflictError` — playbooks that duplicate existing memory are silently skipped.

## Tests

- `test_runtime_orchestrator.py`: verify `memory_context` appears in symbol results when active memory exists for that symbol
- `test_signal_pipeline.py`: verify high-score signals trigger memory_item creation
- Verify `memory_context_selected` event in agent_events after a scan

## Verification

```powershell
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_runtime_orchestrator.py apps/trader-agent/backend/tests/test_signal_pipeline.py -v --tb=short
.venv/Scripts/python.exe -m ruff check apps/trader-agent/backend/app/modules/runtime_orchestrator.py apps/trader-agent/backend/app/modules/signal_manager.py apps/trader-agent/backend/app/modules/playbook.py
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_memory_api.py apps/trader-agent/backend/tests/test_context_selector.py -v --tb=short
```

## Do NOT commit

## Final response

- Changed files
- Commands run, results
- Failed output, gaps, risks
