# 16 - Signal Manager

Source module: `01-agent-core-backend-prd.md` module 16.  
Phase: Phase 1 MVP.  
Domain: Tool and ticket chain.

## Module Goal

Own signal persistence and legal lifecycle transitions so all opportunity candidates become auditable `signals` with stable status history.

## Non-Goals

- Does not detect setups.
- Does not calculate score.
- Does not override Risk Engine.
- Does not create trade tickets directly.

## Inputs And Outputs

Inputs:

- SignalCandidate from Opportunity Brain or Agent Runtime Orchestrator.
- Rule, score, risk, and evidence payloads.
- Requested status transition.

Outputs:

- `signals` rows.
- Signal state transition events.
- WebSocket event payloads through platform event bus.

## Core Tables And Schema

Primary table: `signals`.

Fields:

- `symbol`, `timeframe`, `setup_type`, `score`, `status`, `market_gate`, `trader_playbook_match`.
- `entry_trigger`, `invalidation`, `preferred_instrument`, `evidence`, `risk_flags`, `tool_outputs`, `rule_version`, `agent_version`.

Writes:

- `agent_events` for create, update, invalidate, trigger, archive.

## API Contract

```text
GET  /api/signals
POST /api/signals
GET  /api/signals/{id}
PATCH /api/signals/{id}
POST /api/signals/{id}/invalidate
POST /api/signals/{id}/trigger
```

Create response:

```json
{
  "signal_id": "uuid",
  "status": "waiting_trigger",
  "created": true,
  "event_id": "uuid"
}
```

## Dependencies

- Consumes Opportunity Brain output.
- Requires Rule Engine, Scoring Engine, and Risk Engine outputs in payload.
- Publishes platform events through WebSocket Event Bus in Phase 2.
- Feeds Trade Ticket Generator and Agent Explanation Service.
- Does not trigger approval by itself, but can link to approval-required states.

## Implementation Steps

1. Define legal signal states from system overview.
2. Validate create payload against required fields.
3. Implement create or update idempotency by symbol, setup, timeframe, and active status.
4. Implement legal transitions: watch, waiting_trigger, triggered, ticket_ready, waiting_approval, approved, rejected, in_trade, review, completed, invalidated.
5. Write one `agent_events` row per important transition.
6. Publish signal events when WebSocket layer exists.
7. Reject transitions that conflict with risk veto.

## Failure Modes

- Illegal transition: reject and log.
- Missing evidence: reject promotion beyond watch.
- Risk veto present: block ticket-ready transition.
- Duplicate active signal: update existing signal rather than create duplicate.
- Event bus unavailable: persist signal and mark push failure.

## Acceptance Criteria

- Signal state transitions are legal.
- Every state change writes `agent_events`.
- Important state changes publish WebSocket events when platform exists.
- Risk-vetoed signal cannot become ticket-ready.
- Signal history is reconstructable from events.

## Test Scenarios

- Create watch signal.
- Promote waiting-trigger to triggered.
- Reject triggered to completed without required intermediate state.
- Invalidate signal and verify event.
- Simulate WebSocket failure and preserve database state.
