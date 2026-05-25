# 12 - Rule Engine

Source module: `01-agent-core-backend-prd.md` module 12.  
Phase: Phase 1 MVP.  
Domain: Market and opportunity chain.

## Module Goal

Evaluate deterministic rules from RulePack and active `agent_rules` so opportunity decisions are auditable, reproducible, and separate from LLM interpretation.

## Non-Goals

- Does not call LLMs.
- Does not calculate final score.
- Does not replace Risk Engine.
- Does not activate new rule proposals by itself.

## Inputs And Outputs

Inputs:

- Market snapshot.
- Setup detection.
- Trader and market brain outputs.
- Active RulePack version.
- Active `agent_rules`.

Outputs:

- `rule_pass`, `rule_hits`, `block_reasons`, `score_adjustments`, `required_approvals`.
- Rule hit logs in `agent_events`.

## Core Tables And Schema

Reads:

- `agent_rules`.
- RulePack config from Configuration Service.

Writes:

- `agent_events` for rule evaluation and rule hits.

Downstream fields:

- `signals.rule_version`.
- `signals.evidence`.
- `signals.risk_flags`.

## API Contract

```text
POST /api/rules/evaluate
GET  /api/rules/current
POST /api/rules/simulate
```

Evaluation response:

```json
{
  "rule_pass": false,
  "rule_hits": ["qqq_risk_off_blocks_high_beta_long"],
  "block_reasons": ["QQQ risk-off blocks high-beta long setups"],
  "score_adjustments": [],
  "required_approvals": [],
  "rule_version": "0.1.0"
}
```

## Dependencies

- Requires RulePack loader from Phase 0.
- Reads Configuration Service and `agent_rules`.
- Feeds Scoring Engine, Risk Engine, Signal Manager, and Explanation Service.
- Can create approval requirements for tool or control rules.
- Does not call external tools directly.

## Implementation Steps

1. Load active RulePack and active database rules.
2. Validate rule schemas before evaluation.
3. Evaluate hard rules first.
4. Evaluate soft, preference, notification, tool, learning, and temporary rules.
5. Return deterministic block reasons and score adjustments.
6. Log every rule hit with rule id and input summary.
7. Support simulation without mutating signal state.

## Failure Modes

- Invalid RulePack: fail closed for opportunity generation and log configuration error.
- Unknown rule type: reject rule at load time.
- Temporary rule conflict: apply priority ordering and record conflict.
- Missing input field: mark rule not evaluable and return evidence gap.
- Simulation request with unsupported scope: reject request with schema error.

## Acceptance Criteria

- QQQ risk-off blocks high-beta long opportunities.
- BMNR special rules can apply.
- Temporary rules can override regular rules by priority.
- Every rule hit has an event log.
- Rule evaluation is deterministic for identical inputs and rule version.

## Test Scenarios

- Evaluate QQQ risk-off high-beta long block.
- Evaluate BMNR risk multiplier rule.
- Simulate a temporary rule override.
- Load invalid RulePack and verify fail-closed behavior.
- Verify rule hit appears in `agent_events`.
