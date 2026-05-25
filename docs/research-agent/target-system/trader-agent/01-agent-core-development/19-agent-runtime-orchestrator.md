# 19 - Agent Runtime Orchestrator

Source module: `01-agent-core-backend-prd.md` module 19.  
Phase: Phase 1 to Phase 2 bridge.  
Domain: Reflection and runtime chain.

## Module Goal

Orchestrate complete agent scan runs with run ids, step-level events, deterministic service calls, tool gating, signal updates, and dashboard event push.

## Non-Goals

- Does not implement business logic already owned by modules 7-16.
- Does not call providers outside the Tool Access contract. Phase 0/1 uses LocalToolAdapter; Phase 2 uses Tool Gateway.
- Does not create tickets unless explicitly invoking Trade Ticket Generator.
- Does not hide step failures.

## Inputs And Outputs

Inputs:

- Scan request for full universe or one symbol.
- Active RulePack version.
- Runtime configuration.
- Optional task id.

Outputs:

- `run_id`.
- Step timeline in `agent_events`.
- Created or updated signals.
- WebSocket/SSE events when platform layer exists.

## Core Tables And Schema

Writes:

- `agent_events` for every step.
- `signals` through Signal Manager.

Reads:

- `agent_tasks` when run is task-triggered.
- `agent_rules`, `agent_capabilities`, and configuration.

## API Contract

```text
POST /api/agent/run-scan
POST /api/agent/run-symbol/{symbol}
GET  /api/agent/runs
GET  /api/agent/runs/{id}
```

Run response:

```json
{
  "run_id": "uuid",
  "status": "completed",
  "symbols_scanned": ["SPY", "QQQ", "TSLA", "NVDA", "AAPL", "COIN", "BMNR"],
  "signals_created": 1,
  "signals_updated": 2,
  "errors": []
}
```

## Dependencies

- Requires Market Snapshot, Setup Detection, Rule Engine, Scoring Engine, Risk Engine, and Signal Manager for Phase 1 run.
- Uses Trader Brain, Market Brain, and Opportunity Brain after Phase 1.5.
- Uses LocalToolAdapter in Phase 0/1 and Tool Gateway plus WebSocket Event Bus after Phase 2.
- Writes all progress to `agent_events`.
- Risk Engine veto is binding.

## Implementation Steps

1. Create `run_id` and write run-start event.
2. Load market snapshot.
3. Analyze market gate.
4. Detect setups.
5. Retrieve playbook evidence.
6. Call required tools through the Tool Access contract.
7. Evaluate rules.
8. Score candidates.
9. Run risk checks.
10. Create, update, or invalidate signals through Signal Manager.
11. Push dashboard event when event bus exists.
12. Write run-complete or run-failed event.

## Failure Modes

- Snapshot failure: fail run before setup detection and log.
- One symbol failure: continue other symbols and include symbol error.
- Tool approval required: pause tool-dependent branch and continue deterministic branch when possible.
- RulePack invalid: fail closed and create no promoted signals.
- Event bus failure: preserve database state and log push failure.

## Acceptance Criteria

- Every run has `run_id`.
- Every step writes `agent_events`.
- Web can reconstruct action timeline from events.
- Full universe scan handles partial symbol failures.
- No candidate bypasses Rule Engine, Scoring Engine, and Risk Engine.

## Test Scenarios

- Run full scan with fixture snapshot and one created signal.
- Run one-symbol scan.
- Simulate tool approval requirement and verify paused branch.
- Simulate RulePack invalid state and verify fail-closed behavior.
- Verify run timeline includes start, each step, and completion.
