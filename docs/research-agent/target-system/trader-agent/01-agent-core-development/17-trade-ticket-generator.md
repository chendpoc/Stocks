# 17 - Trade Ticket Generator

Source module: `01-agent-core-backend-prd.md` module 17.  
Phase: Phase 4 control layer.  
Domain: Tool and ticket chain.

## Module Goal

Generate conditional `TradeTicket` drafts from qualified signals after Risk Engine pass, with rationale, entry plan, stop plan, targets, invalidation, and default manual approval status.

## Non-Goals

- Does not execute orders.
- Does not create tickets without stop and invalidation.
- Does not override score threshold or risk veto.
- Does not approve its own ticket.

## Inputs And Outputs

Inputs:

- `signals` row.
- Latest Risk Engine decision.
- Score threshold configuration.
- Entry, stop, target, invalidation evidence.

Outputs:

- `trade_tickets` row.
- Optional `approval_requests` row.
- `agent_events` for ticket generation and blocked generation attempts.

## Core Tables And Schema

Primary table: `trade_tickets`.

Fields:

- `signal_id`, `symbol`, `direction`, `instrument`, `timeframe`.
- `entry_plan`, `stop_plan`, `target_1`, `target_2`.
- `max_loss_nav_pct`, `position_size_rule`, `status`, `rationale`, `invalidation`.
- `created_at`, `approved_at`, `rejected_at`.

Related:

- Reads `signals`.
- Writes `approval_requests`.
- Writes `agent_events`.

## API Contract

```text
POST /api/tickets/generate/{signal_id}
GET  /api/tickets
GET  /api/tickets/{id}
```

Generate response:

```json
{
  "ticket_id": "uuid",
  "signal_id": "uuid",
  "status": "waiting_manual_approval",
  "approval_request_id": "uuid"
}
```

## Dependencies

- Requires Signal Manager.
- Requires Scoring Engine threshold and Risk Engine pass.
- Uses Approval Center through `approval_requests`.
- Writes audit events.
- Does not call external tools directly.
- Does not affect RulePack.

## Implementation Steps

1. Load signal and verify status is `triggered` or eligible for approval.
2. Verify score meets configured ticket threshold.
3. Call or load latest Risk Engine pass.
4. Validate entry, stop, target, invalidation, and rationale.
5. Create ticket with `waiting_manual_approval` status.
6. Create linked approval request.
7. Log blocked generation attempts with explicit reason.

## Failure Modes

- Missing stop: block generation.
- Missing target: block generation.
- Score below threshold: block generation.
- Risk Engine veto: block generation.
- Existing active ticket for signal: return existing ticket or reject duplicate based on config.

## Acceptance Criteria

- No stop means no ticket.
- Ticket defaults to `waiting_manual_approval`.
- Ticket contains rationale and invalidation.
- Ticket does not execute any external action.
- Ticket generation is traceable through events and approval request.

## Test Scenarios

- Generate ticket from qualified triggered signal.
- Block ticket for missing stop.
- Block ticket for risk veto.
- Verify approval request is created.
- Verify duplicate generation does not create multiple active tickets.
