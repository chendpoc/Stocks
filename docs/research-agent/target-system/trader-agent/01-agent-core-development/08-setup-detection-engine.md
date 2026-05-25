# 08 - Setup Detection Engine

Source module: `01-agent-core-backend-prd.md` module 8.  
Phase: Phase 1 MVP.  
Domain: Market and opportunity chain.

## Module Goal

Detect the five MVP setup types with deterministic functions and return matched evidence, missing conditions, and invalidation conditions.

## Non-Goals

- Does not use LLM judgment for setup matches.
- Does not score opportunities.
- Does not approve tickets.
- Does not call external tools directly.

## Inputs And Outputs

Inputs:

- `MarketSnapshot` for one symbol or full universe.
- RulePack setup thresholds.
- Optional playbook constraints after Playbook Engine exists.

Outputs:

- `setup_type`, `matched`, `evidence`, `missing_conditions`, `risk_flags`.
- Detection event summary in `agent_events` when run inside orchestrator.

## Core Tables And Schema

No dedicated table is required for raw setup detections in 03 PRD. Results are embedded into:

- `signals.setup_type`.
- `signals.evidence`.
- `signals.risk_flags`.
- `agent_events.output_summary`.

## API Contract

```text
POST /api/setups/detect
POST /api/setups/detect/{symbol}
```

Response:

```json
{
  "symbol": "TSLA",
  "detections": [
    {
      "setup_type": "vwap_reclaim",
      "matched": true,
      "evidence": ["price reclaimed VWAP", "relative volume above threshold"],
      "missing_conditions": [],
      "risk_flags": []
    }
  ]
}
```

## Dependencies

- Requires Market Snapshot Service.
- Reads RulePack thresholds.
- Feeds Opportunity Brain, Rule Engine, Scoring Engine, and Signal Manager.
- Does not trigger approval.
- Does not call Tool Gateway directly.
- Does not override Risk Engine.

## Implementation Steps

1. Implement independent functions: `detect_vwap_reclaim`, `detect_relative_strength_pullback`, `detect_opening_range_breakout`, `detect_gap_hold`, `detect_daily_breakout_retest`.
2. Define typed input per detector from `MarketSnapshot`.
3. Return evidence and missing conditions for both matched and unmatched states.
4. Add invalidation hints for matched setups.
5. Keep thresholds in RulePack or config, not hardcoded in detector internals.
6. Produce stable results for identical snapshots and RulePack versions.

## Failure Modes

- Missing VWAP: detector returns unmatched with `missing_vwap`.
- Missing benchmark: relative-strength detector returns unmatched with benchmark gap.
- Market not open long enough: opening range detector returns missing opening range.
- Conflicting setup matches: return multiple detections and let scoring/rules rank later.
- Invalid RulePack threshold: fail detector run and write event.

## Acceptance Criteria

- Each MVP setup has a separate detection function.
- Detection result does not depend on LLM output.
- Result includes missing conditions.
- Result includes invalidation conditions.
- Results can be embedded into signal evidence.

## Test Scenarios

- Detect VWAP reclaim from fixture snapshot.
- Detect relative strength pullback with QQQ benchmark.
- Detect opening range breakout after opening range is established.
- Return missing condition when VWAP is absent.
- Return multiple setup candidates without mutating score.
