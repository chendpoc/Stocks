# 13 - Scoring Engine

Source module: `01-agent-core-backend-prd.md` module 13.  
Phase: Phase 1 MVP.  
Domain: Market and opportunity chain.

## Module Goal

Assign deterministic 0-100 scores to opportunity candidates using weighted evidence, rule adjustments, and risk penalties.

## Non-Goals

- Does not approve tickets.
- Does not override hard rules.
- Does not call external tools.
- Does not hide component-level score reasons.

## Inputs And Outputs

Inputs:

- Market gate.
- Trader playbook match.
- Technical setup evidence.
- Relative strength and volume evidence.
- Catalyst and options evidence.
- Rule Engine score adjustments.
- Risk penalty from Risk Engine or preliminary risk flags.

Outputs:

- Total score.
- Component score rows.
- Score band: ticket evaluation, waiting trigger, watch, or ignore.
- Score history entry for Signal Manager.

## Core Tables And Schema

No dedicated score table is required in 03 PRD. Persist through:

- `signals.score`.
- `signals.evidence`.
- `signals.risk_flags`.
- `agent_events.output_summary`.

## API Contract

```text
POST /api/scoring/score-signal
```

Response:

```json
{
  "score": 82,
  "band": "waiting_trigger",
  "components": [
    {"name": "market_gate", "points": 20, "max_points": 25},
    {"name": "technical_structure", "points": 23, "max_points": 25}
  ],
  "penalties": [
    {"name": "risk_penalty", "points": -5}
  ]
}
```

## Dependencies

- Requires Setup Detection, Trader Brain or Playbook Engine, Market Brain, Rule Engine, and Risk Engine inputs.
- Reads RulePack scoring weights.
- Writes no state directly unless called by Signal Manager.
- Does not trigger approval.
- Does not call Tool Gateway.

## Implementation Steps

1. Load scoring weights from RulePack.
2. Validate that required scoring inputs are present.
3. Compute component points for market gate, playbook match, technical structure, relative strength, volume, catalyst, options confirmation.
4. Apply score adjustments from Rule Engine.
5. Apply bounded risk penalty.
6. Clamp score to 0-100.
7. Return score explanation rows for UI and audit.

## Failure Modes

- Missing required input: score as lower-confidence watch or reject based on missing field.
- RulePack weights do not sum cleanly: use explicit max score normalization and log config warning.
- Negative score after penalty: clamp to 0.
- Hard rule block: return score only for explanation, not for promotion.
- Unsupported component name: reject config at load time.

## Acceptance Criteria

- Same input produces same score.
- Every score change is explainable by component rows.
- Score changes can be recorded in signal history.
- Score bands match PRD thresholds: 85-100, 80-84, 70-79, below 70.
- Risk penalty never improves score.

## Test Scenarios

- Score a candidate at 82 and classify waiting-trigger.
- Score a candidate above 85 and mark eligible for ticket evaluation only after risk pass.
- Apply risk penalty and verify lower score.
- Verify hard rule block prevents promotion even with high score.
- Verify identical input and RulePack version return identical score.
