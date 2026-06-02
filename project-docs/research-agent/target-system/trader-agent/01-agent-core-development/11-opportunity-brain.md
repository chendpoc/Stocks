# 11 - Opportunity Brain

Source module: `01-agent-core-backend-prd.md` module 11.  
Phase: Phase 1.5 after deterministic services are stable.  
Domain: Market and opportunity chain.

## Module Goal

Combine setup detections, Trader Brain, Market Brain, tool evidence, Rule Engine, Scoring Engine, and Risk Engine inputs into `SignalCandidate` proposals.

## Non-Goals

- Does not persist final signal state directly when Signal Manager is available.
- Does not create trade tickets.
- Does not ignore risk vetoes.
- Does not rank opportunities from unsupported universe symbols.

## Inputs And Outputs

Inputs:

- Universe snapshots.
- Setup detection results.
- Trader Brain match.
- Market Brain analysis.
- Rule evaluation.
- Score and risk decision.

Outputs:

- `SignalCandidate` objects with `watch`, `waiting_trigger`, `triggered`, or `invalidated` status.
- Entry trigger, invalidation, evidence, risk flags, and playbook references.

## Core Tables And Schema

SignalCandidate maps to `signals` through Signal Manager:

- `symbol`, `timeframe`, `setup_type`, `score`, `status`, `market_gate`, `trader_playbook_match`.
- `entry_trigger`, `invalidation`, `preferred_instrument`, `evidence`, `risk_flags`, `tool_outputs`, `rule_version`, `agent_version`.

Writes:

- `agent_events` when run through orchestrator.

## API Contract

```text
POST /api/opportunity/scan
POST /api/opportunity/scan/{symbol}
```

Response:

```json
{
  "run_id": "uuid",
  "candidates": [
    {
      "symbol": "TSLA",
      "setup_type": "vwap_reclaim",
      "status": "waiting_trigger",
      "score": 82,
      "entry_trigger": "hold above VWAP with QQQ stable",
      "invalidation": "lose VWAP and QQQ turns risk-off"
    }
  ]
}
```

## Dependencies

- Requires modules 7, 8, 9, 10, 12, 13, 14.
- Uses Signal Manager for persistence.
- Uses Tool Gateway only through Market Brain or explicit tool step.
- Risk Engine result is binding.
- RulePack version must be attached to each candidate.

## Implementation Steps

1. Load universe snapshots.
2. Run setup detectors for each symbol.
3. Request Trader Brain match for setup candidates.
4. Request Market Brain analysis.
5. Evaluate rules and compute score.
6. Run Risk Engine before persistence.
7. Convert surviving candidates into Signal Manager create or update requests.
8. Include invalidated candidates when they explain why no opportunity is active.

## Failure Modes

- No setup match: no candidate for that symbol.
- Rule Engine block: candidate status becomes `invalidated` or omitted based on API filter.
- Risk Engine veto: candidate cannot become ticket-ready.
- Missing playbook: candidate can remain watch with evidence gap.
- Partial universe scan failure: return successful symbols and run-level errors.

## Acceptance Criteria

- Scans full MVP universe.
- Generates watch, waiting-trigger, triggered, and invalidated candidates.
- References playbook match when available.
- Provides entry trigger and invalidation.
- Does not persist state without Signal Manager contract.

## Test Scenarios

- Full universe scan with one TSLA waiting-trigger candidate.
- Symbol scan with no setup and empty candidates.
- Risk veto prevents ticket-ready state.
- Missing playbook lowers confidence but preserves watch state.
- Rule block records block reason in candidate evidence.
