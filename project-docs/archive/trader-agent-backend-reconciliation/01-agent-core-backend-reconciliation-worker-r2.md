# R2 Worker Prompt — Event Registry Compliance

Target model: Cursor Composer 2.5
Source plan: [01-agent-core-backend-reconciliation-plan.md](./01-agent-core-backend-reconciliation-plan.md)
Phase: R2 of 3 (can run parallel to R1)
Generated: 2026-05-29

---

Fix the signal_manager bypass of `record_agent_event()`, and append Phase 1C event
names to the canonical event registry with source labels.

## Repository root

D:\workspace\01-products\stock-community-summary

## Context

### Current issue

`signal_manager.py` line 66-78 directly inserts into `agent_events` table via raw SQLAlchemy instead of calling `record_agent_event()`. This bypasses:
- Standard event ID generation
- JSONL mirror (audit trail)
- Consistent payload formatting

### Canonical event registry

The canonical registry lives in:
`project-docs/research-agent/target-system/trader-agent/03-shared-agent-memory-development/07-audit-and-rebuild-workflow.md`

Phase 1C events to append (all marked `source: pipeline`):

```text
corpus_import_started
corpus_import_completed
semantic_extraction_completed
market_context_completed
outcome_labeling_completed
playbook_aggregation_completed
runtime_orchestrator_run_started
runtime_orchestrator_run_completed
runtime_orchestrator_symbol_completed
runtime_orchestrator_symbol_failed
signal_persisted
rule_discovery_candidate_created
rule_discovery_lite_backtest_completed
rule_discovery_candidate_advanced
structured_model_call_completed
```

## Allowed files

- `apps/trader-agent/backend/app/modules/signal_manager.py`
- `project-docs/research-agent/target-system/trader-agent/03-shared-agent-memory-development/07-audit-and-rebuild-workflow.md`

## Forbidden files

- All M0-M6 modules (except reading events.py for interface reference)
- `document_indexer.py`, `local_search.py`
- `apps/trader-cockpit/**`

## Changes

### 1. `signal_manager.py` — fix event bypass

**Find** the raw `agent_events.insert()` call (around line 66-78). Replace with:

```python
from app.core.events import record_agent_event

# OLD: direct insert
# conn.execute(agent_events.insert().values(...))

# NEW: standard pathway
record_agent_event(
    settings,
    event_type="signal_persisted",
    status="completed",
    title=f"Signal: {symbol} {setup_type}",
    input_summary={
        "signal_id": signal_id,
        "symbol": symbol,
        "setup_type": setup_type,
        "score": score_result.total_score,
        "risk_level": risk_result.risk_level if risk_result else None,
    },
    symbol=symbol,
)
```

Remove the `SIGNAL_PERSISTED` constant if it's no longer referenced elsewhere.

### 2. `07-audit-and-rebuild-workflow.md` — append Phase 1C events

In the event registry section, add a new subsection after the "Rebuild events" block:

```markdown
Pipeline events (Phase 1C — `source: pipeline`)：

\`\`\`text
corpus_import_started
corpus_import_completed
semantic_extraction_completed
market_context_completed
outcome_labeling_completed
playbook_aggregation_completed
runtime_orchestrator_run_started
runtime_orchestrator_run_completed
runtime_orchestrator_symbol_completed
runtime_orchestrator_symbol_failed
signal_persisted
rule_discovery_candidate_created
rule_discovery_lite_backtest_completed
rule_discovery_candidate_advanced
structured_model_call_completed
\`\`\`
```

Also update the introductory text of the event registry section to clarify that events are grouped by source (Memory / Pipeline).

## Tests

- `test_agent_events.py`: verify `signal_persisted` event is written via `record_agent_event` (JSONL mirror works)
- Verify `signal_manager.py` no longer has direct `agent_events.insert()` calls

## Verification

```powershell
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_agent_events.py apps/trader-agent/backend/tests/test_signal_pipeline.py -v --tb=short
.venv/Scripts/python.exe -m ruff check apps/trader-agent/backend/app/modules/signal_manager.py
```

## Do NOT commit

## Final response

- Changed files
- Commands run, results
- Failed output, gaps, risks
