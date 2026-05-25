# 14 - Risk Engine

Source module: `01-agent-core-backend-prd.md` module 14.  
Phase: Phase 1 MVP.  
Domain: Market and opportunity chain.

## Module Goal

Apply highest-priority risk controls before signal promotion and ticket generation. Risk Engine can veto any candidate regardless of score.

## Non-Goals

- Does not calculate setup evidence.
- Does not create tickets.
- Does not place orders.
- Does not weaken hard rules based on explanation quality.

## Inputs And Outputs

Inputs:

- Signal candidate.
- Market gate and market regime.
- Entry, stop, target, invalidation.
- Rule Engine output.
- Account/session risk state.
- RulePack risk config.

Outputs:

- `risk_pass`.
- `veto_reasons`.
- `risk_flags`.
- `position_risk_multiplier`.
- Required approvals for high-risk tools or actions.

## Core Tables And Schema

Reads:

- RulePack `risk` config.
- `agent_rules`.
- Current `trade_tickets` or session loss state when available.

Writes:

- `agent_events` for risk checks and blocks.
- `signals.risk_flags` through Signal Manager.
- `approval_requests` only when a risk policy requires human decision.

## API Contract

```text
POST /api/risk/check
GET  /api/risk/state
```

Response:

```json
{
  "risk_pass": false,
  "veto_reasons": ["missing_stop"],
  "risk_flags": ["ticket_blocked"],
  "position_risk_multiplier": 0,
  "required_approvals": []
}
```

## Dependencies

- Requires RulePack loader.
- Consumes Market Brain, Rule Engine, Scoring Engine, and candidate fields.
- Feeds Signal Manager and Trade Ticket Generator.
- Can trigger approval requests for governed actions.
- Has priority over Opportunity Brain and Scoring Engine.

## Implementation Steps

1. Load active risk config from RulePack.
2. Validate stop, target, entry, and invalidation fields.
3. Compute risk/reward when values are parseable.
4. Apply QQQ risk-off high-beta long veto.
5. Apply BMNR and COIN risk multipliers.
6. Block 0DTE by default.
7. Check daily loss or pause state when configured.
8. Return veto result with explicit reason ids.

## Failure Modes

- Missing stop: veto candidate.
- Risk/reward below 1.5: veto ticket generation.
- Missing market gate: return caution or veto based on config.
- Unknown symbol multiplier: use default multiplier and log warning.
- Session risk state unavailable: fail closed for ticket generation.

## Acceptance Criteria

- Can veto every signal path.
- Every block has a reason.
- Ticket generation must call Risk Engine first.
- QQQ risk-off blocks TSLA, NVDA, COIN, and BMNR long candidates.
- BMNR and COIN risk multipliers are applied.

## Test Scenarios

- Candidate without stop is vetoed.
- Candidate with R/R below 1.5 is vetoed.
- QQQ risk-off high-beta long is vetoed.
- BMNR candidate returns 0.3 multiplier.
- 0DTE instrument is blocked by default.
